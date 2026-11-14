"""Telegram commands and buttons - this is the phone remote control."""
from __future__ import annotations

import csv
import logging
from datetime import datetime
from pathlib import Path

from .data import COUNTRIES
from .db import DB, utcnow
from .scoring import label

log = logging.getLogger("commands")

HELP = """🤖 JobHunter কমান্ড

🔎 খোঁজা
/find Zagreb HR — শহরের হোটেল খুঁজবে (দেশের কোড দিন)
/find Split HR all — রেস্টুরেন্ট/বারসহ
/countries — সাপোর্টেড দেশের কোড
/top — সেরা স্কোরের কোম্পানি

✉️ মেইল
/drafts — অপেক্ষমাণ ড্রাফট (✅/⏭ বাটন)
/approve_all — সব ড্রাফট কিউতে দিন
/review — "গেছে কিনা নিশ্চিত না" মেইল
/replies — সাম্প্রতিক রিপ্লাই

⚙️ কন্ট্রোল
/status — অবস্থা
/mode approve|auto — অনুমোদন মোড / অটো মোড
/spontaneous on|off — জব পোস্ট ছাড়া কোম্পানিতেও আবেদন
/cap 30 — দৈনিক মেইল সীমা
/pause, /resume — সব বন্ধ/চালু
/suppress email@x.com — এই ঠিকানায় আর নয়
/export — CSV ফাইল"""


def _kb_draft(rid: int):
    return [[{"text": "✅ পাঠান", "callback_data": f"ap:{rid}"},
             {"text": "⏭ বাদ", "callback_data": f"sk:{rid}"},
             {"text": "👁 পুরো", "callback_data": f"pv:{rid}"}]]


def draft_card(db: DB, rid: int) -> tuple[str, list]:
    r = db.get_outbox(rid)
    c = db.get_company(r["company_id"]) if r["company_id"] else None
    head = f"📝 #{rid} ({r['kind']})"
    if c:
        head += f" — {c['name']} ({c['city']}, {c['country']})\nস্কোর: {c['score']} ({label(c['score'])})"
        if c["roles"]:
            head += f" | রোল: {c['roles']}"
        if c["visa_signal"] and c["visa_signal"] != "none":
            head += f" | ভিসা সিগনাল: {c['visa_signal']}"
    txt = f"{head}\nTo: {r['to_email']}\nবিষয়: {r['subject']}\n\n{r['body'][:450]}…"
    return txt, _kb_draft(rid)


class Commands:
    def __init__(self, cfg, db: DB, tg, mailer):
        self.cfg, self.db, self.tg, self.mailer = cfg, db, tg, mailer

    # ---- dispatch ------------------------------------------------------------------
    async def handle(self, upd: dict):
        if "callback_query" in upd:
            return await self.on_callback(upd["callback_query"])
        m = upd.get("message") or upd.get("edited_message")
        if not m:
            return
        chat = m["chat"]["id"]
        text = (m.get("text") or "").strip()
        if not self.cfg.telegram_chat_id:
            await self.tg.send(f"আপনার Chat ID: {chat}\n.env ফাইলে লিখুন: TELEGRAM_CHAT_ID={chat}\n"
                               "তারপর এজেন্ট রিস্টার্ট করুন।", chat_id=chat)
            return
        if chat != self.cfg.telegram_chat_id:
            return  # strangers are ignored completely
        if not text.startswith("/"):
            await self.tg.send("কমান্ড লিখুন, যেমন /status বা /help")
            return
        parts = text.split()
        cmd, args = parts[0].split("@")[0].lower()[1:], parts[1:]
        fn = getattr(self, f"cmd_{cmd}", None)
        if not fn:
            await self.tg.send("অচেনা কমান্ড। /help দেখুন।")
            return
        try:
            await fn(args)
        except Exception as e:
            log.exception("command %s failed", cmd)
            await self.tg.send(f"❌ /{cmd} চালাতে সমস্যা: {e}")

    async def on_callback(self, cb: dict):
        chat = cb["message"]["chat"]["id"]
        if chat != self.cfg.telegram_chat_id:
            return
        action, _, sid = cb.get("data", "").partition(":")
        try:
            rid = int(sid)
        except ValueError:
            return
        mid = cb["message"]["message_id"]
        if action == "ap":
            ok = self.db.approve(rid)
            await self.tg.answer(cb["id"], "✅ কিউতে গেছে" if ok else "আগেই হয়ে গেছে")
            await self.tg.clear_buttons(chat, mid)
        elif action == "sk":
            ok = self.db.skip(rid)
            await self.tg.answer(cb["id"], "⏭ বাদ দেওয়া হলো" if ok else "আগেই হয়ে গেছে")
            await self.tg.clear_buttons(chat, mid)
        elif action == "pv":
            r = self.db.get_outbox(rid)
            await self.tg.answer(cb["id"])
            if r:
                await self.tg.send(f"#{rid} → {r['to_email']}\nবিষয়: {r['subject']}\n\n{r['body']}")
        elif action == "ms":  # user checked Gmail Sent folder: it did go out
            self.db.set_outbox(rid, status="sent", last_error="marked sent by user")
            await self.tg.answer(cb["id"], "sent হিসেবে মার্ক করা হলো")
            await self.tg.clear_buttons(chat, mid)
        elif action == "rt":  # user checked: it did NOT go out -> retry
            r = self.db.get_outbox(rid)
            if r and r["status"] == "needs_review":
                self.db.set_outbox(rid, status="approved", last_error="", next_try_at=None)
            await self.tg.answer(cb["id"], "আবার কিউতে দেওয়া হলো")
            await self.tg.clear_buttons(chat, mid)

    # ---- commands ----------------------------------------------------------------------
    async def cmd_start(self, a):
        await self.tg.send("স্বাগতম! 👋\n" + HELP)

    async def cmd_help(self, a):
        await self.tg.send(HELP)

    async def cmd_countries(self, a):
        await self.tg.send("দেশের কোড:\n" + ", ".join(f"{k}={v[0]}" for k, v in COUNTRIES.items()))

    async def cmd_find(self, a):
        if len(a) < 2:
            await self.tg.send("ব্যবহার: /find Zagreb HR   (শহর + দেশের কোড; শেষে `all` দিলে রেস্টুরেন্টসহ)")
            return
        kinds = "all" if a[-1].lower() == "all" else "hotels"
        if kinds == "all":
            a = a[:-1]
        cc = a[-1].upper()
        if cc not in COUNTRIES:
            await self.tg.send(f"'{cc}' দেশের কোড চিনিনি। /countries দেখুন।")
            return
        city = " ".join(a[:-1])
        self.db.x("INSERT INTO searches(city,country,kinds,created_at) VALUES(?,?,?,datetime('now'))",
                  (city, cc, kinds))
        await self.tg.send(f"🔎 {city} ({COUNTRIES[cc][0]}) খোঁজা শুরু হচ্ছে। ফল এলে জানাবো।")

    async def cmd_status(self, a):
        db = self.db
        comp = {r["status"]: r["c"] for r in db.q("SELECT status, COUNT(*) c FROM companies GROUP BY status")}
        ob = {r["status"]: r["c"] for r in db.q("SELECT status, COUNT(*) c FROM outbox GROUP BY status")}
        replies = db.one("SELECT COUNT(*) c FROM outbox WHERE replied_at IS NOT NULL")["c"]
        paused = "⏸ পজড" if db.kv_get("paused") == "1" else "▶️ চলছে"
        mode = db.kv_get("mode", self.cfg.default_mode)
        cap = self.mailer.todays_cap()
        sent = db.sent_today(self.cfg.send_tz)
        spont = "চালু" if db.kv_get("spontaneous", "0") == "1" else "বন্ধ"
        await self.tg.send(
            f"📊 অবস্থা: {paused} | মোড: {mode} | spontaneous: {spont}\n"
            f"কোম্পানি: {sum(comp.values())} (নতুন {comp.get('new', 0)}, বিশ্লেষণ হয়েছে {comp.get('analyzed', 0)}, "
            f"সাইট নেই/খোলে না {comp.get('unreachable', 0)})\n"
            f"ড্রাফট: {ob.get('draft', 0)} | কিউতে: {ob.get('approved', 0)} | পাঠানো: {ob.get('sent', 0)} | "
            f"রিভিউ দরকার: {ob.get('needs_review', 0)} | ব্যর্থ: {ob.get('failed', 0)}\n"
            f"আজ পাঠানো: {sent}/{cap} | মোট রিপ্লাই: {replies}")

    async def cmd_top(self, a):
        rows = self.db.q("SELECT * FROM companies WHERE status='analyzed' AND best_email<>'' "
                         "ORDER BY score DESC, has_job DESC LIMIT 10")
        if not rows:
            await self.tg.send("এখনো বিশ্লেষণ করা কোম্পানি নেই। /find দিয়ে শুরু করুন।")
            return
        lines = [f"{i}. {r['name']} ({r['city']}, {r['country']}) — {r['score']} {label(r['score'])}"
                 f"{' | ' + r['roles'] if r['roles'] else ''}\n   {r['best_email']}" for i, r in enumerate(rows, 1)]
        await self.tg.send("🏆 সেরা ১০:\n" + "\n".join(lines))

    async def cmd_drafts(self, a):
        rows = self.db.q("SELECT id FROM outbox WHERE status='draft' ORDER BY id LIMIT 5")
        total = self.db.one("SELECT COUNT(*) c FROM outbox WHERE status='draft'")["c"]
        if not rows:
            await self.tg.send("কোনো অপেক্ষমাণ ড্রাফট নেই।")
            return
        await self.tg.send(f"{total}টি ড্রাফট অপেক্ষায়। প্রথম {len(rows)}টি:")
        for r in rows:
            txt, kb = draft_card(self.db, r["id"])
            await self.tg.send(txt, kb)

    async def cmd_approve_all(self, a):
        cur = self.db.x("UPDATE outbox SET status='approved', approved_at=? WHERE status='draft'", (utcnow(),))
        await self.tg.send(f"✅ {cur.rowcount}টি মেইল কিউতে গেছে। ধীরে ধীরে, নিরাপদ গ্যাপ দিয়ে যাবে।")

    async def cmd_review(self, a):
        rows = self.db.q("SELECT * FROM outbox WHERE status='needs_review' LIMIT 10")
        if not rows:
            await self.tg.send("রিভিউ করার মতো কিছু নেই ✅")
            return
        for r in rows:
            await self.tg.send(
                f"🔎 #{r['id']} → {r['to_email']}\nসমস্যা: {r['last_error']}\n"
                "Gmail-এর Sent ফোল্ডারে দেখুন। গিয়ে থাকলে 'গেছে', না গেলে 'আবার'।",
                [[{"text": "✔️ গেছে", "callback_data": f"ms:{r['id']}"},
                  {"text": "🔁 আবার পাঠান", "callback_data": f"rt:{r['id']}"}]])

    async def cmd_replies(self, a):
        rows = self.db.q("SELECT o.*, c.name cname FROM outbox o LEFT JOIN companies c ON c.id=o.company_id "
                         "WHERE o.replied_at IS NOT NULL ORDER BY o.replied_at DESC LIMIT 8")
        if not rows:
            await self.tg.send("এখনো কোনো রিপ্লাই আসেনি।")
            return
        await self.tg.send("💬 সাম্প্রতিক রিপ্লাই:\n\n" + "\n\n".join(
            f"{r['cname'] or r['to_email']} ({r['to_email']})\n{(r['reply_snippet'] or '')[:200]}" for r in rows))

    async def cmd_mode(self, a):
        if not a or a[0] not in ("approve", "auto"):
            await self.tg.send("ব্যবহার: /mode approve  অথবা  /mode auto")
            return
        self.db.kv_set("mode", a[0])
        await self.tg.send("মোড: " + ("approve — প্রতিটা মেইল আপনার ✅ পাওয়ার পর যাবে" if a[0] == "approve"
                                       else "auto — ড্রাফট নিজে নিজে কিউতে যাবে ⚠️ প্রথমে approve মোডে ভুল কমান"))

    async def cmd_spontaneous(self, a):
        if not a or a[0] not in ("on", "off"):
            await self.tg.send("ব্যবহার: /spontaneous on  অথবা  off")
            return
        self.db.kv_set("spontaneous", "1" if a[0] == "on" else "0")
        await self.tg.send("spontaneous: " + a[0] + " (জব পোস্ট নেই, কিন্তু স্কোর ভালো এমন কোম্পানিতেও আবেদন)")

    async def cmd_cap(self, a):
        if not a or not a[0].isdigit() or not (1 <= int(a[0]) <= 400):
            await self.tg.send("ব্যবহার: /cap 30  (১–৪০০)। নতুন Gmail-এ ২০–৪০ নিরাপদ।")
            return
        self.db.kv_set("daily_cap", a[0])
        await self.tg.send(f"দৈনিক সীমা: {a[0]} (warm-up চলাকালীন আজকের সীমা {self.mailer.todays_cap()})")

    async def cmd_pause(self, a):
        self.db.kv_set("paused", "1")
        await self.tg.send("⏸ পজ করা হয়েছে (খোঁজা ও পাঠানো দুটোই)। চালাতে /resume")

    async def cmd_resume(self, a):
        self.db.kv_set("paused", "0")
        self.db.kv_set("blocked_until", "")
        await self.tg.send("▶️ আবার চালু।")

    async def cmd_suppress(self, a):
        if not a or "@" not in a[0]:
            await self.tg.send("ব্যবহার: /suppress hr@hotel.com   (বা @hotel.com পুরো ডোমেইনের জন্য)")
            return
        self.db.suppress(a[0], "manual")
        await self.tg.send(f"🚫 {a[0]} — আর কখনো মেইল যাবে না।")

    async def cmd_export(self, a):
        rows = self.db.q(
            "SELECT c.*, (SELECT group_concat(email, '; ') FROM emails e WHERE e.company_id=c.id) all_emails, "
            "(SELECT status FROM outbox o WHERE o.company_id=c.id AND o.kind='initial' ORDER BY id DESC LIMIT 1) mail_status "
            "FROM companies c ORDER BY c.score DESC")
        path = Path("data") / f"companies_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        path.parent.mkdir(exist_ok=True)
        cols = ["name", "country", "city", "website", "score", "has_job", "roles", "visa_signal", "accommodation",
                "best_email", "all_emails", "career_url", "apply_url", "phone", "address", "red_flags",
                "status", "mail_status", "summary"]
        with path.open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for r in rows:
                w.writerow([r[c] for c in cols])
        ok = await self.tg.send_document(str(path), f"{len(rows)}টি কোম্পানি")
        if not ok:
            await self.tg.send(f"ফাইল পাঠানো যায়নি; সার্ভারে আছে: {path}")
