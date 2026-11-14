"""Internal web-application notification sink (replaces external Telegram Bot API per Section 8 & 12)."""
from __future__ import annotations

import logging

log = logging.getLogger("telegram")


class Telegram:
    """Stores runtime notifications in SQLite `events` table for the Web Dashboard & Admin Panel.
    Never calls api.telegram.org in production.
    """

    def __init__(self, cfg, client=None, db=None):
        self.cfg = cfg
        self.client = client
        self.db = db

    async def call(self, method: str, **payload):
        return None

    async def send(self, text: str, buttons=None, chat_id: int | None = None):
        msg = (text or "").strip()
        if not msg:
            return None
        log.info("[web-notify] %s", msg.replace("\n", " | ")[:200])
        if self.db is not None and hasattr(self.db, "log_event"):
            try:
                self.db.log_event(msg[:1000], category="notification", level="info")
            except Exception as e:
                log.debug("Failed to log event: %s", e)
        return {"ok": True}

    async def clear_buttons(self, chat_id: int, message_id: int):
        return None

    async def answer(self, callback_id: str, text: str = ""):
        return None

    async def send_document(self, path: str, caption: str = "") -> bool:
        if self.db is not None and hasattr(self.db, "log_event"):
            self.db.log_event(f"Exported document: {path} ({caption})", category="export", level="info")
        return True

    async def get_updates(self, offset: int):
        return []
