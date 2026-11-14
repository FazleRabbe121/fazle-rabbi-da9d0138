"""The agent: independent loops (discover -> crawl -> analyse -> score -> draft -> send -> track -> AI retry)."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from zoneinfo import ZoneInfo

from .analyzer import analyze
from .commands import Commands, draft_card
from .crawler import Crawler
from .db import DB, FMT, utcnow
from .drafts import load_profile, make_draft
from .inbox import poll_inbox
from .mailer import Mailer
from .scoring import check_mx, evaluate_four_scores, label, score_company
from .sources import overpass_search, places_search
from .telegram import Telegram
from .textutil import classify_email, domain_of, is_freemail, same_domain

log = logging.getLogger("agent")
KIND_RANK = {"hr": 0, "general": 1, "person": 2}


def setup_logging():
    Path("data").mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if not root.handlers:
        for h in (
            logging.StreamHandler(),
            RotatingFileHandler("data/agent.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"),
        ):
            h.setFormatter(fmt)
            root.addHandler(h)
    logging.getLogger("httpx").setLevel(logging.WARNING)


class Agent:
    def __init__(self, cfg):
        import httpx

        self.cfg = cfg
        self.db = DB(cfg.db_path)
        self.client = httpx.AsyncClient(follow_redirects=True)
        # Telegram is excluded in production web integration; notifications route to DB events for Dashboard/Admin Panel
        self.tg = Telegram(cfg, self.client, db=self.db)
        self.crawler = Crawler(cfg)
        self.mailer = Mailer(cfg, self.db, self.profile, self.tg.send)
        self.cmds = Commands(cfg, self.db, self.tg, self.mailer)
        self.tz = ZoneInfo(cfg.send_tz)
        self._profile_cache: dict | None = None

    def profile(self) -> dict:
        self._profile_cache = load_profile(self.cfg.profile_path)
        return self._profile_cache

    @property
    def mode(self) -> str:
        return self.db.kv_get("mode", self.cfg.default_mode)

    # ---- supervisor ----------------------------------------------------------------
    async def _supervised(self, name: str, fn):
        while True:
            try:
                await fn()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("loop %s crashed - restarting in 20s", name)
                await asyncio.sleep(20)

    async def run(self):
        setup_logging()
        recovery = self.db.recover_crashed_tasks()
        stuck = recovery["stuck_sends_to_review"]
        try:
            self.profile()
        except Exception as e:
            log.error("profile problem: %s", e)
            await self.tg.send(f"⚠️ profile.json warning: {e}")
        await self.tg.send(
            "🟢 JobHunter Python Engine active."
            + (f"\n⚠️ {stuck} mail(s) interrupted during previous run — check /review." if stuck else "")
        )
        # Note: Telegram bot_loop is excluded per Section 12 (Telegram Exclusion); all control is via Dashboard & Admin Panel
        loops = [
            ("discovery", self.discovery_loop),
            ("crawl", self.crawl_loop),
            ("mailer", self.mailer.run),
            ("inbox", self.inbox_loop),
            ("followup", self.followup_loop),
            ("ai_retry", self.ai_retry_loop),
            ("summary", self.summary_loop),
        ]
        try:
            await asyncio.gather(*(self._supervised(n, f) for n, f in loops))
        finally:
            await self.crawler.close()
            await self.client.aclose()

    # ---- 1. discovery (priority-ordered) -----------------------------------------------
    async def discovery_loop(self):
        while True:
            if self.db.kv_get("paused") == "1":
                await asyncio.sleep(10)
                continue
            row = self.db.claim_next_search()
            if not row:
                await asyncio.sleep(10)
                continue
            found = await overpass_search(self.client, row["city"], row["country"], row["kinds"])
            if self.cfg.places_key:
                found += await places_search(self.client, self.cfg.places_key, row["city"], row["country"], row["kinds"])
            added = 0
            for c in found:
                if self.db.add_company(
                    c["name"], c["website"], c["domain"], c["country"], c["city"],
                    c["address"], c["phone"], c["source"], c["osm_email"],
                ):
                    added += 1
            self.db.x(
                "UPDATE searches SET status='done', note=?, updated_at=? WHERE id=?",
                (f"{len(found)} found, {added} new", utcnow(), row["id"]),
            )
            msg = f"🔎 {row['city']} ({row['country']}): {len(found)} found, {added} new companies queued for crawling."
            await self.tg.send(msg)

    # ---- 2. crawl -> analyse -> score -> draft ---------------------------------------------
    async def crawl_loop(self):
        while True:
            if self.db.kv_get("paused") == "1":
                await asyncio.sleep(10)
                continue
            ids = self.db.claim_new_companies(self.cfg.crawl_concurrency)
            if not ids:
                await asyncio.sleep(15)
                continue
            results = await asyncio.gather(*(self.process_company(i) for i in ids), return_exceptions=True)
            for i, r in zip(ids, results):
                if isinstance(r, Exception):
                    log.error("company %s failed: %r", i, r)
                    self.db.set_company(i, status="error")

    async def process_company(self, cid: int):
        c = self.db.get_company(cid)
        if not c["website"]:
            self.db.set_company(cid, status="no_site")
            return
        crawl = await self.crawler.crawl_company(c["website"])
        if not crawl.reachable:
            self.db.set_company(cid, status="unreachable", analyzed_at=utcnow())
            return
        text = crawl.career_text or crawl.home_text
        info = await analyze(self.cfg, self.db, self.client, text, company_id=cid)

        # emails: crawled + OSM + explicit apply email
        site_dom = domain_of(c["website"])
        found = dict(crawl.emails)
        if c["osm_email"]:
            found.setdefault(c["osm_email"], "osm")
        if info.get("apply_email"):
            found.setdefault(info["apply_email"].lower(), "career page")
        ranked = []
        for e, src in found.items():
            kind = classify_email(e)
            same = same_domain(domain_of(e), site_dom)
            self.db.add_email(cid, e, kind, src)
            ranked.append((0 if e == (info.get("apply_email") or "").lower() else 1, not same, KIND_RANK[kind], e, kind, same))
        ranked.sort()
        best = ranked[0] if ranked else None
        best_email = best[3] if best else ""

        mx = await asyncio.to_thread(check_mx, domain_of(best_email)) if best_email else False
        score_input = {
            "reachable": True,
            "has_job": info["has_relevant_job"],
            "visa_signal": info["visa_signal"],
            "sponsorship_category": info.get("sponsorship_category", "D"),
            "accommodation": info["accommodation"],
            "best_email": best_email,
            "email_matches_site": bool(best and best[5]),
            "email_kind": best[4] if best else "",
            "freemail": bool(best_email) and is_freemail(best_email),
            "mx_ok": mx,
            "has_contact_details": bool(c["phone"] or c["address"]),
            "country": c["country"],
            "roles": info["roles"],
            "red_flags": info["red_flags"],
        }
        score, why = score_company(score_input)
        try:
            prof = self.profile()
        except Exception:
            prof = {}
        four_scores = evaluate_four_scores(score_input, prof)

        self.db.set_company(
            cid,
            status="analyzed",
            score=score,
            score_reasons=" | ".join(why),
            job_suitability_score=four_scores["job_suitability_score"],
            sponsorship_evidence_score=four_scores["sponsorship_evidence_score"],
            work_permit_feasibility_score=four_scores["work_permit_feasibility_score"],
            overall_priority_score=four_scores["overall_priority_score"],
            sponsorship_category=info.get("sponsorship_category", four_scores["sponsorship_category"]),
            sponsorship_confidence=info.get("sponsorship_confidence", "None"),
            evidence_source=info.get("evidence_source", ""),
            verification_date=info.get("verification_date", utcnow()[:10]),
            has_job=int(info["has_relevant_job"]),
            visa_signal=info["visa_signal"],
            accommodation=int(info["accommodation"]),
            roles=", ".join(info["roles"]),
            canonical_roles=", ".join(info.get("canonical_roles") or []),
            summary=info.get("summary") or "",
            career_url=crawl.career_url,
            apply_url=info.get("apply_url") or crawl.apply_url,
            best_email=best_email,
            language=info.get("language") or "",
            red_flags="; ".join(info["red_flags"]),
            analyzed_at=utcnow(),
        )

        # decide whether this company deserves a draft
        spontaneous = self.db.kv_get("spontaneous", "0") == "1"
        qualifies = (
            best_email
            and not info["red_flags"]
            and info["visa_signal"] != "negative"
            and mx
            and score >= self.cfg.min_score
            and (info["has_relevant_job"] or (spontaneous and score >= self.cfg.min_score + 15))
        )
        if not qualifies or self.db.is_suppressed(best_email):
            return
        company = dict(self.db.get_company(cid))
        subject, body, lang = await make_draft(self.cfg, self.db, self.client, prof, company)
        status = "approved" if self.mode == "auto" else "draft"
        selected_cv = self.db.select_cv_for_roles(roles=company.get("roles", ""))
        rid = self.db.add_draft(
            cid,
            best_email,
            subject,
            body,
            lang,
            status=status,
            cv_id=selected_cv["cv_id"] if selected_cv else "",
            cv_filename=selected_cv["filename"] if selected_cv else "",
            cv_path=selected_cv["file_path"] if selected_cv else "",
            vacancy_title=company.get("canonical_roles") or company.get("roles") or "Hospitality Position",
            employer_name=company.get("name") or "",
        )
        if rid and status == "draft":
            txt, kb = draft_card(self.db, rid)
            await self.tg.send(txt, kb)
        elif rid:
            log.info("auto mode: queued #%s for %s", rid, best_email)

    # ---- 3. inbox ----------------------------------------------------------------------------
    async def inbox_loop(self):
        while True:
            if self.cfg.gmail_address and self.cfg.gmail_app_password:
                try:
                    for ev in await asyncio.to_thread(poll_inbox, self.cfg, self.db):
                        await self._announce(ev)
                except Exception as e:
                    log.warning("inbox poll failed: %s", e)
            await asyncio.sleep(600)

    async def _announce(self, ev: dict):
        t = ev["type"]
        if t == "reply":
            await self.tg.send(f"💬 Reply received from {ev['to']}\n\n{ev.get('snippet', '')}")
        elif t == "bounce":
            await self.tg.send(f"↩️ Bounce detected: {ev['to']} — added to suppression list.")
        elif t == "stop":
            await self.tg.send(f"🚫 Opt-out received from {ev['to']} — added to suppression list.")

    # ---- 4. follow-ups -----------------------------------------------------------------------
    async def followup_loop(self):
        while True:
            await asyncio.sleep(3600 * 3)
            if self.db.kv_get("paused") == "1":
                continue
            cutoff = (datetime.now(timezone.utc) - timedelta(days=self.cfg.followup_days)).strftime(FMT)
            rows = self.db.q(
                "SELECT * FROM outbox o WHERE o.kind='initial' AND o.status='sent' AND o.sent_at<=? "
                "AND o.replied_at IS NULL AND o.bounced=0 AND NOT EXISTS "
                "(SELECT 1 FROM outbox f WHERE f.parent_id=o.id) LIMIT 10",
                (cutoff,),
            )
            for o in rows:
                if self.db.is_suppressed(o["to_email"]) or not o["company_id"]:
                    continue
                company = dict(self.db.get_company(o["company_id"]))
                subject, body, lang = await make_draft(self.cfg, self.db, self.client, self.profile(), company, "followup")
                status = "approved" if self.mode == "auto" else "draft"
                rid = self.db.add_draft(
                    o["company_id"], o["to_email"], "Re: " + o["subject"], body, lang,
                    kind="followup", parent_id=o["id"], status=status,
                    employer_name=company.get("name") or "",
                )
                if rid and status == "draft":
                    txt, kb = draft_card(self.db, rid)
                    await self.tg.send("🔁 Follow-up draft\n" + txt, kb)

    # ---- 5. persistent AI retry loop (when Gemini quota recovers) ----------------------------
    async def ai_retry_loop(self):
        while True:
            await asyncio.sleep(180)
            if not self.cfg.gemini_key or self.db.kv_get("paused") == "1":
                continue
            tasks = self.db.claim_ai_tasks(limit=3)
            for t in tasks:
                try:
                    payload = json.loads(t["payload_json"])
                    if t["task_type"] == "analyze_company" and t["target_id"]:
                        snippet = payload.get("text_snippet", "")
                        info = await analyze(self.cfg, self.db, self.client, snippet, company_id=0)
                        if info.get("summary"):
                            self.db.set_company(
                                t["target_id"],
                                summary=info["summary"],
                                sponsorship_category=info.get("sponsorship_category", "D"),
                                evidence_source=info.get("evidence_source", ""),
                            )
                    self.db.complete_ai_task(t["id"])
                except Exception as e:
                    self.db.fail_ai_task(t["id"], str(e))

    # ---- 6. daily summary --------------------------------------------------------------------
    async def summary_loop(self):
        while True:
            now = datetime.now(self.tz)
            today = now.strftime("%Y-%m-%d")
            if now.hour >= 20 and self.db.kv_get("last_summary") != today:
                self.db.kv_set("last_summary", today)
                sent = self.db.sent_today(self.cfg.send_tz)
                drafts = self.db.one("SELECT COUNT(*) c FROM outbox WHERE status='draft'")["c"]
                replies = self.db.one(
                    "SELECT COUNT(*) c FROM outbox WHERE replied_at>=?",
                    (datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z"),),
                )["c"]
                await self.tg.send(f"🌙 Daily Summary: Sent {sent} | Replies {replies} | Pending Drafts {drafts}")
            await asyncio.sleep(900)
