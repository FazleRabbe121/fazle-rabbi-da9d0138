"""Settings loaded from the .env file / environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def load_env(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _s(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _i(name: str, default: int) -> int:
    try:
        return int(_s(name, str(default)))
    except ValueError:
        return default


def _f(name: str, default: float) -> float:
    try:
        return float(_s(name, str(default)))
    except ValueError:
        return default


@dataclass
class Config:
    telegram_token: str
    telegram_chat_id: int
    gemini_key: str
    gemini_model: str
    gemini_daily_calls: int
    places_key: str
    gmail_address: str
    gmail_app_password: str
    from_name: str
    smtp_host: str
    smtp_port: int
    imap_host: str
    db_path: str
    cv_path: str
    profile_path: str
    default_mode: str
    daily_cap: int
    warmup_start: int
    warmup_step: int
    gap_min: int
    gap_max: int
    send_tz: str
    send_hour_start: int
    send_hour_end: int
    followup_days: int
    min_score: int
    crawl_concurrency: int
    crawl_delay: float
    use_playwright: bool
    user_agent: str

    @classmethod
    def load(cls) -> "Config":
        gmail = _s("GMAIL_ADDRESS")
        mode = _s("MODE", "approve").lower()
        return cls(
            telegram_token=_s("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=_i("TELEGRAM_CHAT_ID", 0),
            gemini_key=_s("GEMINI_API_KEY"),
            gemini_model=_s("GEMINI_MODEL", "gemini-2.5-flash"),
            gemini_daily_calls=_i("GEMINI_DAILY_CALLS", 300),
            places_key=_s("GOOGLE_PLACES_API_KEY"),
            gmail_address=gmail,
            gmail_app_password=_s("GMAIL_APP_PASSWORD").replace(" ", ""),
            from_name=_s("FROM_NAME", gmail.split("@")[0] if gmail else "Applicant"),
            smtp_host=_s("SMTP_HOST", "smtp.gmail.com"),
            smtp_port=_i("SMTP_PORT", 465),
            imap_host=_s("IMAP_HOST", "imap.gmail.com"),
            db_path=_s("DB_PATH", "data/jobhunter.db"),
            cv_path=_s("CV_PATH", "cv/CV.pdf"),
            profile_path=_s("PROFILE_PATH", "profile.json"),
            default_mode=mode if mode in ("approve", "auto") else "approve",
            daily_cap=_i("DAILY_CAP", 40),
            warmup_start=_i("WARMUP_START", 10),
            warmup_step=_i("WARMUP_STEP", 5),
            gap_min=_i("SEND_GAP_MIN", 45),
            gap_max=_i("SEND_GAP_MAX", 120),
            send_tz=_s("SEND_TZ", "Europe/Berlin"),
            send_hour_start=_i("SEND_HOUR_START", 8),
            send_hour_end=_i("SEND_HOUR_END", 18),
            followup_days=_i("FOLLOWUP_DAYS", 7),
            min_score=_i("MIN_SCORE", 45),
            crawl_concurrency=_i("CRAWL_CONCURRENCY", 3),
            crawl_delay=_f("CRAWL_DELAY", 2.0),
            use_playwright=_s("USE_PLAYWRIGHT", "0") == "1",
            user_agent=_s(
                "USER_AGENT",
                f"JobHunterBot/1.0 (personal job search; contact: {gmail or 'n/a'})",
            ),
        )
