"""Reads Gmail (IMAP, read-only) to detect replies and bounces, with UIDVALIDITY & incremental UID recovery."""
from __future__ import annotations

import email
import imaplib
import logging
import re
from datetime import datetime, timedelta, timezone
from email import policy
from email.header import decode_header, make_header
from email.utils import parseaddr

from .db import DB, utcnow
from .textutil import EMAIL_RE

log = logging.getLogger("inbox")
STOP_RE = re.compile(r"\b(stop|unsubscribe|remove me|do not contact|don't contact|nicht kontaktieren|"
                     r"abmelden|désinscrire|cancella|baja)\b", re.I)


def _hdr(msg, name: str) -> str:
    try:
        return str(make_header(decode_header(msg.get(name, "") or "")))
    except Exception:
        return msg.get(name, "") or ""


def _text(msg) -> str:
    try:
        part = msg.get_body(preferencelist=("plain", "html"))
        txt = part.get_content() if part else ""
    except Exception:
        txt = ""
    return re.sub(r"\s+", " ", txt or "").strip()


def _first_reply_text(txt: str) -> str:
    """Cut quoted history so 'stop' inside our own quoted footer doesn't trigger suppression."""
    cut = re.split(r"(?:\bOn .{5,80} wrote:|-----Original Message-----|\bAm .{5,80} schrieb|^>)", txt, maxsplit=1)[0]
    return cut.strip()


def process_message(db: DB, msg) -> dict | None:
    """Classifies one incoming message. Returns an event dict, or None."""
    frm = parseaddr(msg.get("From", ""))[1].lower()
    subj = _hdr(msg, "Subject")
    refs = f"{msg.get('In-Reply-To', '')} {msg.get('References', '')}"
    ref_ids = re.findall(r"<[^>]+>", refs)
    auto = (msg.get("Auto-Submitted", "no").lower() != "no") or "auto" in (msg.get("Precedence", "") or "").lower()

    # --- bounce -----------------------------------------------------------------
    if (frm.startswith(("mailer-daemon", "postmaster")) or
            re.search(r"delivery status notification|undeliver|returned mail|delivery failure|failure notice", subj, re.I)):
        raw = msg.as_string()
        row = None
        for m in re.findall(r"<[^>\s]+@[^>\s]+>", raw):
            row = db.one("SELECT * FROM outbox WHERE message_id=?", (m,))
            if row:
                break
        if not row:
            for e in EMAIL_RE.findall(raw):
                row = db.one("SELECT * FROM outbox WHERE to_email=? AND status='sent' ORDER BY id DESC", (e.lower(),))
                if row:
                    break
        if row and not row["bounced"]:
            db.set_outbox(row["id"], bounced=1, last_error="bounced: address does not accept mail")
            db.suppress(row["to_email"], "bounced")
            return {"type": "bounce", "id": row["id"], "to": row["to_email"]}
        return None

    # --- reply ----------------------------------------------------------------------
    row = None
    for m in ref_ids:
        row = db.one("SELECT * FROM outbox WHERE message_id=?", (m,))
        if row:
            break
    if not row and frm:  # some providers rewrite Message-IDs: fall back to the exact sender address
        row = db.one("SELECT * FROM outbox WHERE to_email=? AND status='sent' ORDER BY id DESC", (frm,))
    if not row:
        return None
    body = _text(msg)
    if auto:
        return {"type": "auto", "id": row["id"], "to": row["to_email"]} if not row["replied_at"] else None
    snippet = (_first_reply_text(body) or body)[:300]
    first_time = not row["replied_at"]
    db.set_outbox(row["id"], replied_at=utcnow(), reply_snippet=snippet)
    if STOP_RE.search(_first_reply_text(body)[:400]):
        db.suppress(frm, "asked to stop")
        db.suppress(row["to_email"], "asked to stop")
        return {"type": "stop", "id": row["id"], "to": row["to_email"], "snippet": snippet}
    return {"type": "reply", "id": row["id"], "to": row["to_email"], "snippet": snippet,
            "subject": subj} if first_time else None


def poll_inbox(cfg, db: DB) -> list[dict]:
    """Blocking IMAP poll with UIDVALIDITY verification and incremental UID persistence."""
    events: list[dict] = []
    M = None
    try:
        M = imaplib.IMAP4_SSL(cfg.imap_host, 993, timeout=40)
        M.login(cfg.gmail_address, cfg.gmail_app_password)
        typ, _ = M.select("INBOX", readonly=True)
        if typ != "OK":
            return events

        # Check UIDVALIDITY so mailbox recreation never causes missed messages
        uidvalidity = ""
        try:
            uv_resp = M.response("UIDVALIDITY")
            if uv_resp and uv_resp[1] and uv_resp[1][0]:
                uidvalidity = uv_resp[1][0].decode("ascii", errors="ignore") if isinstance(uv_resp[1][0], bytes) else str(uv_resp[1][0])
        except Exception:
            pass
        stored_uv = db.kv_get("imap_uidvalidity", "")
        if uidvalidity and stored_uv and uidvalidity != stored_uv:
            log.info("IMAP UIDVALIDITY changed (%s -> %s); resetting imap_last_uid", stored_uv, uidvalidity)
            db.kv_set("imap_last_uid", "0")
        if uidvalidity:
            db.kv_set("imap_uidvalidity", uidvalidity)

        last = int(db.kv_get("imap_last_uid", "0") or 0)
        if last == 0:
            since = (datetime.now(timezone.utc) - timedelta(days=14)).strftime("%d-%b-%Y")
            typ, data = M.uid("SEARCH", None, "SINCE", since)
        else:
            typ, data = M.uid("SEARCH", None, f"UID {last + 1}:*")
        uids = sorted(int(x) for x in (data[0] or b"").split() if x.isdigit() and int(x) > last)
        for uid in uids:
            typ, d = M.uid("FETCH", str(uid), "(BODY.PEEK[]<0.80000>)")
            if typ != "OK" or not d or not d[0] or not isinstance(d[0], tuple):
                continue
            msg = email.message_from_bytes(d[0][1], policy=policy.default)
            try:
                ev = process_message(db, msg)
            except Exception:
                log.exception("could not process uid %s", uid)
                ev = None
            if ev:
                events.append(ev)
            # Incrementally persist last processed UID for crash recovery
            db.kv_set("imap_last_uid", str(uid))
        if not uids and last == 0:
            typ, data = M.uid("SEARCH", None, "ALL")
            allu = [int(x) for x in (data[0] or b"").split() if x.isdigit()]
            if allu:
                db.kv_set("imap_last_uid", str(max(allu)))
    finally:
        if M is not None:
            try:
                M.close()
            except Exception:
                pass
            try:
                M.logout()
            except Exception:
                pass
    return events
