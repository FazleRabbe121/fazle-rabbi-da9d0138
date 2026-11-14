"""`python run.py check` - tests every connection so you find problems BEFORE the agent runs."""
from __future__ import annotations

import asyncio
import imaplib
import smtplib
import ssl
from pathlib import Path

from .drafts import load_profile


def _line(ok: bool | None, text: str):
    print(("✅ " if ok else "⚠️  " if ok is None else "❌ ") + text)


async def _async_checks(cfg):
    import httpx

    async with httpx.AsyncClient(timeout=30) as client:
        if cfg.telegram_token:
            try:
                r = (await client.get(f"https://api.telegram.org/bot{cfg.telegram_token}/getMe")).json()
                _line(r.get("ok", False), f"Telegram bot: @{r.get('result', {}).get('username', '?')}" if r.get("ok")
                      else "Telegram token ভুল")
            except Exception as e:
                _line(False, f"Telegram পৌঁছানো যায়নি: {e}")
        if cfg.gemini_key:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{cfg.gemini_model}:generateContent"
                r = await client.post(url, headers={"x-goog-api-key": cfg.gemini_key},
                                      json={"contents": [{"parts": [{"text": "Reply with the word OK"}]}]})
                _line(r.status_code == 200, f"Gemini ({cfg.gemini_model}) HTTP {r.status_code}"
                      + ("" if r.status_code == 200 else f" — {r.text[:120]}"))
            except Exception as e:
                _line(False, f"Gemini পৌঁছানো যায়নি: {e}")
        try:
            r = await client.get("https://overpass-api.de/api/status")
            _line(r.status_code == 200, "OpenStreetMap (Overpass) সার্ভার পৌঁছানো যাচ্ছে")
        except Exception as e:
            _line(False, f"Overpass পৌঁছানো যায়নি: {e}")


def run_check(cfg):
    print("— JobHunter সেটআপ চেক —")
    try:
        p = load_profile(cfg.profile_path)
        _line(True, f"profile.json ঠিক আছে ({p.get('full_name')})")
    except Exception as e:
        _line(False, f"profile.json: {e}")
    _line(Path(cfg.cv_path).exists() or None, f"CV ফাইল: {cfg.cv_path}" + ("" if Path(cfg.cv_path).exists() else " (নেই — মেইলে CV যাবে না!)"))
    _line(bool(cfg.telegram_token), "TELEGRAM_BOT_TOKEN সেট আছে")
    _line(bool(cfg.telegram_chat_id) or None, "TELEGRAM_CHAT_ID সেট আছে" + ("" if cfg.telegram_chat_id else " (বটকে /start দিন, সে আপনার ID বলে দেবে)"))
    _line(bool(cfg.gemini_key) or None, "GEMINI_API_KEY সেট আছে" + ("" if cfg.gemini_key else " (ছাড়াও চলে, তবে স্মার্টনেস কম)"))
    if cfg.gmail_address and cfg.gmail_app_password:
        try:
            s = smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, timeout=30, context=ssl.create_default_context())
            s.login(cfg.gmail_address, cfg.gmail_app_password)
            s.quit()
            _line(True, "Gmail SMTP (পাঠানো) লগইন ঠিক")
        except Exception as e:
            _line(False, f"Gmail SMTP লগইন ব্যর্থ: {e}")
        try:
            M = imaplib.IMAP4_SSL(cfg.imap_host, 993, timeout=30)
            M.login(cfg.gmail_address, cfg.gmail_app_password)
            M.logout()
            _line(True, "Gmail IMAP (রিপ্লাই পড়া) লগইন ঠিক")
        except Exception as e:
            _line(False, f"Gmail IMAP ব্যর্থ (Gmail সেটিংসে IMAP চালু করুন): {e}")
    else:
        _line(False, "GMAIL_ADDRESS / GMAIL_APP_PASSWORD সেট নেই")
    try:
        asyncio.run(_async_checks(cfg))
    except ImportError:
        _line(False, "httpx ইনস্টল নেই: pip install -r requirements.txt")
