"""Reliable sending: one queue, one mail at a time, never twice, with CV attachment enforcement and SMTP cleanup."""
from __future__ import annotations

import asyncio
import logging
import random
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from pathlib import Path
from zoneinfo import ZoneInfo

from .db import DB, utc_in, utcnow
from .textutil import EMAIL_OK

log = logging.getLogger("mailer")


class SendError(Exception):
    def __init__(self, kind: str, msg: str = ""):
        super().__init__(msg)
        self.kind = kind  # auth | quota | retry | fatal | ambiguous | cv_missing


def smtp_deliver(cfg, msg: EmailMessage) -> None:
    """Blocking. Raises SendError with a precise kind and guarantees SMTP socket cleanup."""
    s = None
    # Stage 1: connect + login. Nothing has been sent yet, so any failure here is safe to retry.
    try:
        ctx = ssl.create_default_context()
        s = smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, timeout=40, context=ctx)
        s.login(cfg.gmail_address, cfg.gmail_app_password)
    except smtplib.SMTPAuthenticationError as e:
        if s is not None:
            try:
                s.close()
            except Exception:
                pass
        raise SendError("auth", str(e))
    except (OSError, smtplib.SMTPException) as e:
        if s is not None:
            try:
                s.close()
            except Exception:
                pass
        raise SendError("retry", f"connect/login: {e}")
    # Stage 2: transmit.
    try:
        s.send_message(msg)
    except smtplib.SMTPRecipientsRefused as e:
        raise SendError("fatal", f"recipient refused: {e}")
    except smtplib.SMTPSenderRefused as e:
        raise SendError("quota" if _is_quota(str(e)) else "fatal", f"sender refused: {e}")
    except smtplib.SMTPDataError as e:
        text = f"{e.smtp_code} {e.smtp_error!r}"
        if _is_quota(text):
            raise SendError("quota", text)
        raise SendError("fatal" if e.smtp_code >= 500 else "retry", text)  # 4xx = not accepted
    except (smtplib.SMTPServerDisconnected, TimeoutError, OSError, smtplib.SMTPException) as e:
        raise SendError("ambiguous", f"connection lost while sending: {e}")
    finally:
        if s is not None:
            try:
                s.quit()
            except Exception:
                try:
                    s.close()
                except Exception:
                    pass


def _is_quota(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ("quota", "5.4.5", "daily user sending", "rate limit", "too many"))


class Mailer:
    def __init__(self, cfg, db: DB, profile_getter, notify):
        self.cfg, self.db, self.notify = cfg, db, notify
        self._profile = profile_getter  # callable -> dict (reload-friendly)
        self.tz = ZoneInfo(cfg.send_tz)

    # ---- policy -------------------------------------------------------------
    def todays_cap(self) -> int:
        cap = int(self.db.kv_get("daily_cap", "") or self.cfg.daily_cap)
        first = self.db.kv_get("first_send_date")
        if not first:
            return min(cap, self.cfg.warmup_start)
        days = (datetime.now(self.tz).date() - datetime.strptime(first, "%Y-%m-%d").date()).days
        return min(cap, self.cfg.warmup_start + max(0, days) * self.cfg.warmup_step)

    def in_window(self) -> bool:
        h = datetime.now(self.tz)
        return h.weekday() < 6 and self.cfg.send_hour_start <= h.hour < self.cfg.send_hour_end

    def _resolve_cv_file(self, row) -> tuple[Path | None, str]:
        """Resolves the CV file from outbox row -> CV Gallery -> cfg.cv_path."""
        row_keys = row.keys() if hasattr(row, "keys") else []
        if "cv_path" in row_keys and row["cv_path"]:
            p = Path(row["cv_path"])
            if p.exists() and p.is_file() and p.stat().st_size > 0:
                fname = (row["cv_filename"] if "cv_filename" in row_keys and row["cv_filename"] else p.name)
                return p, fname
        if hasattr(self.db, "select_cv_for_roles"):
            cv_id = row["cv_id"] if "cv_id" in row_keys else ""
            roles = row["vacancy_title"] if "vacancy_title" in row_keys else ""
            gal = self.db.select_cv_for_roles(roles=roles, preferred_cv_id=cv_id)
            if gal and gal.get("file_path"):
                p = Path(gal["file_path"])
                if p.exists() and p.is_file() and p.stat().st_size > 0:
                    return p, gal.get("filename") or p.name
        cv = Path(self.cfg.cv_path)
        if cv.exists() and cv.is_file() and cv.stat().st_size > 0:
            return cv, cv.name
        return None, ""

    # ---- message building ----------------------------------------------------
    def build(self, row, mid: str) -> EmailMessage:
        cfg = self.cfg
        profile = {}
        try:
            profile = self._profile()
        except Exception:
            pass
        msg = EmailMessage()
        msg["From"] = formataddr((cfg.from_name, cfg.gmail_address))
        msg["To"] = row["to_email"]
        msg["Subject"] = row["subject"]
        msg["Message-ID"] = mid
        msg["Date"] = formatdate(localtime=True)
        msg["Reply-To"] = profile.get("reply_to") or cfg.gmail_address
        if row["kind"] == "followup" and row["parent_id"]:
            parent = self.db.get_outbox(row["parent_id"])
            if parent and parent["message_id"]:
                msg["In-Reply-To"] = parent["message_id"]
                msg["References"] = parent["message_id"]
        msg.set_content(row["body"])
        if row["kind"] == "initial":
            cv_file, cv_name = self._resolve_cv_file(row)
            if cv_file is not None:
                msg.add_attachment(
                    cv_file.read_bytes(),
                    maintype="application",
                    subtype="pdf",
                    filename=cv_name or cv_file.name,
                )
            elif getattr(cfg, "require_cv_attachment", False) or self.db.kv_get("require_cv", "0") == "1":
                raise SendError("cv_missing", f"Required CV attachment missing at {cfg.cv_path}")
        return msg

    # ---- delivery of ONE queued mail -----------------------------------------
    async def deliver(self, rid: int) -> bool:
        row = self.db.get_outbox(rid)
        if not row:
            return False
        to = row["to_email"].strip().lower()
        if not EMAIL_OK.match(to):
            self.db.set_outbox(rid, status="failed", last_error="invalid email address")
            return False
        if self.db.is_suppressed(to):
            self.db.set_outbox(rid, status="skipped", last_error="address is on the suppression list")
            return False
        # Do not send applications to closed/expired vacancies
        if row["company_id"]:
            comp = self.db.get_company(row["company_id"])
            if comp and comp["status"] in ("closed", "expired"):
                self.db.set_outbox(rid, status="skipped", last_error="vacancy marked closed or expired")
                return False
        dup = self.db.one("SELECT id FROM outbox WHERE to_email=? AND kind=? AND status='sent' AND id<>?",
                          (to, row["kind"], rid))
        if dup:
            self.db.set_outbox(rid, status="skipped", last_error=f"already sent as #{dup['id']}")
            return False
        mid = make_msgid(domain=self.cfg.gmail_address.split("@")[-1] or "localhost")
        self.db.set_outbox(rid, message_id=mid)
        try:
            msg = self.build(row, mid)
        except SendError as e:
            return await self._on_error(rid, row, e)
        except Exception as e:
            self.db.set_outbox(rid, status="failed", last_error=f"could not build message: {e}")
            return False
        try:
            await asyncio.to_thread(smtp_deliver, self.cfg, msg)
        except SendError as e:
            return await self._on_error(rid, row, e)
        self.db.set_outbox(rid, status="sent", sent_at=utcnow(), last_error="")
        if not self.db.kv_get("first_send_date"):
            self.db.kv_set("first_send_date", datetime.now(self.tz).strftime("%Y-%m-%d"))
        log.info("sent #%s -> %s", rid, to)
        return True

    async def _on_error(self, rid: int, row, e: SendError) -> bool:
        log.warning("send #%s failed (%s): %s", rid, e.kind, e)
        err = str(e)[:300]
        if e.kind == "cv_missing":
            self.db.set_outbox(rid, status="failed", last_error=err)
            await self.notify(f"⛔ Mail #{rid} blocked: CV attachment missing. Select a valid CV in the CV Gallery.")
        elif e.kind == "auth":
            self.db.set_outbox(rid, status="approved", attempts=max(0, row["attempts"]), last_error=err)
            self.db.kv_set("paused", "1")
            await self.notify("⛔ Gmail login failed. Sending paused until credentials are verified.")
        elif e.kind == "quota":
            self.db.set_outbox(rid, status="approved", last_error=err, next_try_at=utc_in(hours=6))
            self.db.kv_set("blocked_until", utc_in(hours=6))
            await self.notify("⚠️ Gmail daily sending limit reached. Paused for 6 hours; queue preserved.")
        elif e.kind == "retry":
            if row["attempts"] >= 3:
                self.db.set_outbox(rid, status="failed", last_error=err)
            else:
                self.db.set_outbox(rid, status="approved", last_error=err,
                                   next_try_at=utc_in(minutes=5 * row["attempts"]))
        elif e.kind == "fatal":
            self.db.set_outbox(rid, status="failed", last_error=err)
        else:  # ambiguous - might have been delivered
            self.db.set_outbox(rid, status="needs_review", last_error=err)
            await self.notify(f"🔎 Mail #{rid} ({row['to_email']}): connection lost during send — marked for /review.")
        return False

    # ---- main loop ------------------------------------------------------------
    async def tick(self) -> None:
        if self.db.kv_get("paused") == "1":
            await asyncio.sleep(10)
            return
        blocked = self.db.kv_get("blocked_until")
        if blocked and blocked > utcnow():
            await asyncio.sleep(60)
            return
        if not self.in_window():
            await asyncio.sleep(60)
            return
        cap, sent = self.todays_cap(), self.db.sent_today(self.cfg.send_tz)
        if sent >= cap:
            today = datetime.now(self.tz).strftime("%Y-%m-%d")
            waiting = self.db.one("SELECT COUNT(*) c FROM outbox WHERE status='approved'")["c"]
            if waiting and self.db.kv_get("cap_notified") != today:
                self.db.kv_set("cap_notified", today)
                await self.notify(f"📮 Daily sending cap ({cap}) reached. {waiting} queued applications will resume tomorrow.")
            await asyncio.sleep(120)
            return
        rid = self.db.claim_next_to_send()
        if rid is None:
            await asyncio.sleep(15)
            return
        ok = await self.deliver(rid)
        if ok:
            await asyncio.sleep(random.uniform(self.cfg.gap_min, self.cfg.gap_max))

    async def run(self) -> None:
        while True:
            try:
                await self.tick()
            except Exception:
                log.exception("mailer tick crashed")
                await asyncio.sleep(30)
