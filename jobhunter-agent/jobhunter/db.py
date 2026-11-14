"""SQLite storage = the agent's persistent memory, queues, Gemini cache, and CV Gallery link."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from .data import COUNTRY_PRIORITY_RANK

FMT = "%Y-%m-%dT%H:%M:%SZ"

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, website TEXT, domain TEXT UNIQUE,
  brand_key TEXT DEFAULT '',
  country TEXT, city TEXT, address TEXT, phone TEXT, source TEXT, osm_email TEXT,
  status TEXT DEFAULT 'new',
  score INTEGER DEFAULT 0, score_reasons TEXT DEFAULT '',
  job_suitability_score INTEGER DEFAULT 0,
  sponsorship_evidence_score INTEGER DEFAULT 0,
  work_permit_feasibility_score INTEGER DEFAULT 0,
  overall_priority_score INTEGER DEFAULT 0,
  sponsorship_category TEXT DEFAULT 'D',
  sponsorship_confidence TEXT DEFAULT 'None',
  evidence_source TEXT DEFAULT '',
  verification_date TEXT DEFAULT '',
  has_job INTEGER DEFAULT 0, visa_signal TEXT DEFAULT '', accommodation INTEGER DEFAULT 0,
  roles TEXT DEFAULT '', canonical_roles TEXT DEFAULT '',
  summary TEXT DEFAULT '', career_url TEXT DEFAULT '',
  apply_url TEXT DEFAULT '', best_email TEXT DEFAULT '', language TEXT DEFAULT '',
  publication_date TEXT DEFAULT '',
  red_flags TEXT DEFAULT '', created_at TEXT, analyzed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS ix_companies_country ON companies(country);
CREATE INDEX IF NOT EXISTS ix_companies_brand ON companies(brand_key, country);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL, email TEXT NOT NULL,
  kind TEXT DEFAULT 'general', source TEXT DEFAULT '',
  UNIQUE(company_id, email)
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER, to_email TEXT NOT NULL, subject TEXT, body TEXT, lang TEXT,
  kind TEXT DEFAULT 'initial', parent_id INTEGER,
  cv_id TEXT DEFAULT '', cv_filename TEXT DEFAULT '', cv_path TEXT DEFAULT '',
  vacancy_title TEXT DEFAULT '', employer_name TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',  -- draft|approved|sending|sent|failed|needs_review|skipped
  message_id TEXT, attempts INTEGER DEFAULT 0, last_error TEXT DEFAULT '',
  next_try_at TEXT, created_at TEXT, approved_at TEXT, sent_at TEXT,
  replied_at TEXT, reply_snippet TEXT DEFAULT '', bounced INTEGER DEFAULT 0
);
-- Only ONE live initial application per address, ever: the database itself blocks duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_initial
  ON outbox(to_email) WHERE kind='initial' AND status NOT IN ('skipped','failed');
CREATE INDEX IF NOT EXISTS ix_outbox_status ON outbox(status);

CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY, reason TEXT, created_at TEXT
);

CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT, country TEXT, kinds TEXT DEFAULT 'hotels',
  priority_rank INTEGER DEFAULT 50,
  status TEXT DEFAULT 'new', note TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_searches_status_prio ON searches(status, priority_rank, id);

CREATE TABLE IF NOT EXISTS gemini_cache (
  cache_key TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  model TEXT DEFAULT '',
  created_at TEXT,
  hit_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_task_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,
  target_id INTEGER DEFAULT 0,
  payload_json TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending|processing|completed|failed
  attempts INTEGER DEFAULT 0,
  last_error TEXT DEFAULT '',
  next_retry_at TEXT,
  created_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_ai_task_status ON ai_task_queue(status, next_retry_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT DEFAULT 'info',
  category TEXT DEFAULT 'system',
  message TEXT NOT NULL,
  details_json TEXT DEFAULT '{}',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS cv_gallery (
  cv_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  role_target TEXT DEFAULT '',
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
"""

OUTBOX_FIELDS = {
    "status", "message_id", "attempts", "last_error", "next_try_at", "approved_at",
    "sent_at", "replied_at", "reply_snippet", "bounced", "subject", "body",
    "cv_id", "cv_filename", "cv_path", "vacancy_title", "employer_name",
}
COMPANY_FIELDS = {
    "status", "score", "score_reasons", "has_job", "visa_signal", "accommodation", "roles",
    "canonical_roles", "summary", "career_url", "apply_url", "best_email", "language",
    "red_flags", "analyzed_at", "brand_key", "sponsorship_category", "sponsorship_confidence",
    "evidence_source", "verification_date", "job_suitability_score", "sponsorship_evidence_score",
    "work_permit_feasibility_score", "overall_priority_score", "publication_date",
}


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime(FMT)


def utc_in(**delta) -> str:
    return (datetime.now(timezone.utc) + timedelta(**delta)).strftime(FMT)


def normalize_brand_key(name: str) -> str:
    """Normalizes company brand name so multi-branch duplicates in the same country are detected."""
    s = (name or "").lower()
    # Strip common branch/location suffixes and legal entity suffixes
    s = re.sub(r"\b(ltd|limited|llc|inc|gmbh|s\.r\.l|srl|d\.o\.o|doo|sp\.?\s*z\s*o\.?\s*o|sa|b\.v|bv|plc)\b", "", s)
    s = re.sub(r"[^a-z0-9]", "", s)
    return s[:48]


class DB:
    def __init__(self, path: str = "data/jobhunter.db"):
        self.path = path
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=5000")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)
        self._ensure_columns()

    def _ensure_columns(self) -> None:
        """Safely migrates older SQLite databases without losing existing records."""
        migrations = [
            ("companies", "brand_key", "TEXT DEFAULT ''"),
            ("companies", "job_suitability_score", "INTEGER DEFAULT 0"),
            ("companies", "sponsorship_evidence_score", "INTEGER DEFAULT 0"),
            ("companies", "work_permit_feasibility_score", "INTEGER DEFAULT 0"),
            ("companies", "overall_priority_score", "INTEGER DEFAULT 0"),
            ("companies", "sponsorship_category", "TEXT DEFAULT 'D'"),
            ("companies", "sponsorship_confidence", "TEXT DEFAULT 'None'"),
            ("companies", "evidence_source", "TEXT DEFAULT ''"),
            ("companies", "verification_date", "TEXT DEFAULT ''"),
            ("companies", "canonical_roles", "TEXT DEFAULT ''"),
            ("companies", "publication_date", "TEXT DEFAULT ''"),
            ("outbox", "cv_id", "TEXT DEFAULT ''"),
            ("outbox", "cv_filename", "TEXT DEFAULT ''"),
            ("outbox", "cv_path", "TEXT DEFAULT ''"),
            ("outbox", "vacancy_title", "TEXT DEFAULT ''"),
            ("outbox", "employer_name", "TEXT DEFAULT ''"),
            ("searches", "priority_rank", "INTEGER DEFAULT 50"),
            ("searches", "updated_at", "TEXT DEFAULT ''"),
        ]
        with self.lock:
            for table, col, col_def in migrations:
                try:
                    self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}")
                except sqlite3.OperationalError:
                    pass

    def close(self) -> None:
        with self.lock:
            try:
                self.conn.close()
            except Exception:
                pass

    def __enter__(self) -> "DB":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    # ---- generic helpers -------------------------------------------------
    def q(self, sql: str, params=()):
        with self.lock:
            return self.conn.execute(sql, params).fetchall()

    def one(self, sql: str, params=()):
        with self.lock:
            return self.conn.execute(sql, params).fetchone()

    def x(self, sql: str, params=()):
        with self.lock:
            return self.conn.execute(sql, params)

    def kv_get(self, k: str, default: str = "") -> str:
        r = self.one("SELECT v FROM kv WHERE k=?", (k,))
        return r["v"] if r else default

    def kv_set(self, k: str, v: str) -> None:
        self.x("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, v))

    # ---- event logging (Dashboard & Admin Panel replacement for Telegram) ---
    def log_event(self, message: str, category: str = "system", level: str = "info", details: dict | None = None) -> None:
        self.x(
            "INSERT INTO events(level,category,message,details_json,created_at) VALUES(?,?,?,?,?)",
            (level, category, message[:1000], json.dumps(details or {}, ensure_ascii=False), utcnow()),
        )

    def get_recent_events(self, limit: int = 50) -> list[dict]:
        rows = self.q("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]

    # ---- companies ---------------------------------------------------------
    def add_company(self, name, website, domain, country, city, address="", phone="",
                    source="", osm_email="") -> int | None:
        bkey = normalize_brand_key(name)
        # Prevent duplicate company with multiple branches in the same country
        if bkey and len(bkey) >= 5:
            existing_branch = self.one(
                "SELECT id FROM companies WHERE brand_key=? AND country=? AND domain=?",
                (bkey, country, domain),
            )
            if existing_branch:
                return None
        cur = self.x(
            "INSERT OR IGNORE INTO companies(name,website,domain,brand_key,country,city,address,phone,"
            "source,osm_email,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (name, website, domain, bkey, country, city, address, phone, source, osm_email, utcnow()),
        )
        return cur.lastrowid if cur.rowcount else None

    def get_company(self, cid: int):
        return self.one("SELECT * FROM companies WHERE id=?", (cid,))

    def set_company(self, cid: int, **f) -> None:
        f = {k: v for k, v in f.items() if k in COMPANY_FIELDS}
        if not f:
            return
        cols = ", ".join(f"{k}=?" for k in f)
        self.x(f"UPDATE companies SET {cols} WHERE id=?", (*f.values(), cid))

    def claim_new_companies(self, n: int) -> list[int]:
        """Claims 'new' companies ordered by country priority rank (Group 1 -> Group 2 -> Group 3)."""
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                rows = self.conn.execute(
                    "SELECT id, country FROM companies WHERE status='new'"
                ).fetchall()
                sorted_rows = sorted(
                    rows,
                    key=lambda r: (COUNTRY_PRIORITY_RANK.get(r["country"] or "", 99), r["id"]),
                )[:n]
                ids = [r["id"] for r in sorted_rows]
                for i in ids:
                    self.conn.execute("UPDATE companies SET status='crawling' WHERE id=?", (i,))
                self.conn.execute("COMMIT")
            except Exception:
                self.conn.execute("ROLLBACK")
                raise
            return ids

    def add_email(self, company_id: int, email: str, kind: str, source: str = "") -> None:
        self.x("INSERT OR IGNORE INTO emails(company_id,email,kind,source) VALUES(?,?,?,?)",
               (company_id, email.lower(), kind, source))

    # ---- searches queue (priority-aware & persistent) ----------------------
    def add_search(self, city: str, country: str, kinds: str = "hotels") -> int | None:
        city_clean = city.strip()
        cc_clean = country.strip().upper()
        # Prevent duplicate pending/running searches for the same city+country+kinds
        existing = self.one(
            "SELECT id FROM searches WHERE lower(city)=lower(?) AND country=? AND kinds=? AND status IN ('new','running')",
            (city_clean, cc_clean, kinds),
        )
        if existing:
            return existing["id"]
        prio = COUNTRY_PRIORITY_RANK.get(cc_clean, 50)
        cur = self.x(
            "INSERT INTO searches(city,country,kinds,priority_rank,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            (city_clean, cc_clean, kinds, prio, "new", utcnow(), utcnow()),
        )
        return cur.lastrowid

    def claim_next_search(self):
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                row = self.conn.execute(
                    "SELECT * FROM searches WHERE status='new' ORDER BY priority_rank ASC, id ASC LIMIT 1"
                ).fetchone()
                if row:
                    self.conn.execute(
                        "UPDATE searches SET status='running', updated_at=? WHERE id=?",
                        (utcnow(), row["id"]),
                    )
                self.conn.execute("COMMIT")
                return row
            except Exception:
                self.conn.execute("ROLLBACK")
                raise

    # ---- Gemini cache & AI fallback queue ----------------------------------
    @staticmethod
    def hash_prompt(prompt: str) -> str:
        return hashlib.sha256(prompt.encode("utf-8")).hexdigest()

    def get_cached_gemini(self, prompt: str) -> dict | None:
        ckey = self.hash_prompt(prompt)
        row = self.one("SELECT response_json FROM gemini_cache WHERE cache_key=?", (ckey,))
        if not row:
            return None
        self.x("UPDATE gemini_cache SET hit_count=hit_count+1 WHERE cache_key=?", (ckey,))
        try:
            return json.loads(row["response_json"])
        except Exception:
            return None

    def set_cached_gemini(self, prompt: str, response_data: dict, model: str = "") -> None:
        ckey = self.hash_prompt(prompt)
        self.x(
            "INSERT INTO gemini_cache(cache_key,response_json,model,created_at,hit_count) VALUES(?,?,?,?,0) "
            "ON CONFLICT(cache_key) DO UPDATE SET response_json=excluded.response_json, model=excluded.model",
            (ckey, json.dumps(response_data, ensure_ascii=False), model, utcnow()),
        )

    def enqueue_ai_task(self, task_type: str, target_id: int, payload: dict) -> int:
        existing = self.one(
            "SELECT id FROM ai_task_queue WHERE task_type=? AND target_id=? AND status IN ('pending','processing')",
            (task_type, target_id),
        )
        if existing:
            return existing["id"]
        cur = self.x(
            "INSERT INTO ai_task_queue(task_type,target_id,payload_json,status,created_at) VALUES(?,?,?,'pending',?)",
            (task_type, target_id, json.dumps(payload, ensure_ascii=False), utcnow()),
        )
        return cur.lastrowid

    def claim_ai_tasks(self, limit: int = 5) -> list[dict]:
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                now = utcnow()
                rows = self.conn.execute(
                    "SELECT * FROM ai_task_queue WHERE status='pending' "
                    "AND (next_retry_at IS NULL OR next_retry_at<=?) ORDER BY id ASC LIMIT ?",
                    (now, limit),
                ).fetchall()
                for r in rows:
                    self.conn.execute(
                        "UPDATE ai_task_queue SET status='processing', attempts=attempts+1 WHERE id=?",
                        (r["id"],),
                    )
                self.conn.execute("COMMIT")
                return [dict(r) for r in rows]
            except Exception:
                self.conn.execute("ROLLBACK")
                raise

    def complete_ai_task(self, task_id: int) -> None:
        self.x(
            "UPDATE ai_task_queue SET status='completed', completed_at=?, last_error='' WHERE id=?",
            (utcnow(), task_id),
        )

    def fail_ai_task(self, task_id: int, error: str, retry_minutes: int = 15) -> None:
        row = self.one("SELECT attempts FROM ai_task_queue WHERE id=?", (task_id,))
        attempts = row["attempts"] if row else 1
        if attempts >= 5:
            self.x("UPDATE ai_task_queue SET status='failed', last_error=? WHERE id=?", (error[:300], task_id))
        else:
            self.x(
                "UPDATE ai_task_queue SET status='pending', last_error=?, next_retry_at=? WHERE id=?",
                (error[:300], utc_in(minutes=retry_minutes * attempts), task_id),
            )

    # ---- CV Gallery synchronization ----------------------------------------
    def upsert_cv_gallery_item(self, cv_id: str, title: str, filename: str, file_path: str,
                               role_target: str = "", is_active: bool = False) -> None:
        with self.lock:
            if is_active:
                self.conn.execute("UPDATE cv_gallery SET is_active=0")
            self.conn.execute(
                "INSERT INTO cv_gallery(cv_id,title,role_target,filename,file_path,is_active,updated_at) "
                "VALUES(?,?,?,?,?,?,?) ON CONFLICT(cv_id) DO UPDATE SET "
                "title=excluded.title, role_target=excluded.role_target, filename=excluded.filename, "
                "file_path=excluded.file_path, is_active=excluded.is_active, updated_at=excluded.updated_at",
                (cv_id, title, role_target, filename, file_path, 1 if is_active else 0, utcnow()),
            )

    def select_cv_for_roles(self, roles: str = "", preferred_cv_id: str = "") -> dict | None:
        """Selects the best CV from the synced CV Gallery (single source of truth)."""
        if preferred_cv_id:
            r = self.one("SELECT * FROM cv_gallery WHERE cv_id=?", (preferred_cv_id,))
            if r and Path(r["file_path"]).exists():
                return dict(r)
        active = self.one("SELECT * FROM cv_gallery WHERE is_active=1 LIMIT 1")
        if active and Path(active["file_path"]).exists():
            return dict(active)
        rows = self.q("SELECT * FROM cv_gallery ORDER BY updated_at DESC")
        roles_lower = (roles or "").lower()
        for r in rows:
            target = (r["role_target"] or r["title"] or "").lower()
            if target and any(tok in roles_lower for tok in ("bartender", "barista", "waiter", "mixologist", "supervisor") if tok in target):
                if Path(r["file_path"]).exists():
                    return dict(r)
        for r in rows:
            if Path(r["file_path"]).exists():
                return dict(r)
        return None

    # ---- outbox / send queue ----------------------------------------------
    def add_draft(self, company_id, to_email, subject, body, lang, kind="initial",
                  parent_id=None, status="draft", cv_id="", cv_filename="", cv_path="",
                  vacancy_title="", employer_name="") -> int | None:
        """Returns the new id, or None if this address already has a live initial mail."""
        try:
            cur = self.x(
                "INSERT INTO outbox(company_id,to_email,subject,body,lang,kind,parent_id,status,"
                "cv_id,cv_filename,cv_path,vacancy_title,employer_name,created_at,approved_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (company_id, to_email.lower().strip(), subject, body, lang, kind, parent_id, status,
                 cv_id, cv_filename, cv_path, vacancy_title, employer_name,
                 utcnow(), utcnow() if status == "approved" else None),
            )
            return cur.lastrowid
        except sqlite3.IntegrityError:
            return None

    def get_outbox(self, rid: int):
        return self.one("SELECT * FROM outbox WHERE id=?", (rid,))

    def set_outbox(self, rid: int, **f) -> None:
        f = {k: v for k, v in f.items() if k in OUTBOX_FIELDS}
        if not f:
            return
        cols = ", ".join(f"{k}=?" for k in f)
        self.x(f"UPDATE outbox SET {cols} WHERE id=?", (*f.values(), rid))

    def approve(self, rid: int) -> bool:
        cur = self.x("UPDATE outbox SET status='approved', approved_at=? "
                     "WHERE id=? AND status='draft'", (utcnow(), rid))
        return cur.rowcount > 0

    def skip(self, rid: int) -> bool:
        cur = self.x("UPDATE outbox SET status='skipped' WHERE id=? AND status IN "
                     "('draft','approved')", (rid,))
        return cur.rowcount > 0

    def claim_next_to_send(self) -> int | None:
        """Atomically moves ONE approved mail to 'sending'. Two workers can never get the same row."""
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                row = self.conn.execute(
                    "SELECT id FROM outbox WHERE status='approved' "
                    "AND (next_try_at IS NULL OR next_try_at<=?) ORDER BY approved_at, id LIMIT 1",
                    (utcnow(),),
                ).fetchone()
                rid = None
                if row:
                    rid = row["id"]
                    self.conn.execute(
                        "UPDATE outbox SET status='sending', attempts=attempts+1 WHERE id=?", (rid,))
                self.conn.execute("COMMIT")
                return rid
            except Exception:
                self.conn.execute("ROLLBACK")
                raise

    def recover_stuck_sending(self) -> int:
        """After a crash we can't know if a 'sending' mail left the building. Never resend blindly."""
        cur = self.x("UPDATE outbox SET status='needs_review', "
                     "last_error='interrupted while sending - check Gmail Sent folder' "
                     "WHERE status='sending'")
        return cur.rowcount

    def recover_crashed_tasks(self) -> dict:
        """Recovers interrupted background searches, crawls, AI tasks, and stuck sends after server restart."""
        stuck_sends = self.recover_stuck_sending()
        cur_search = self.x("UPDATE searches SET status='new', updated_at=? WHERE status='running'", (utcnow(),))
        cur_crawl = self.x("UPDATE companies SET status='new' WHERE status='crawling'")
        cur_ai = self.x("UPDATE ai_task_queue SET status='pending' WHERE status='processing'")
        return {
            "stuck_sends_to_review": stuck_sends,
            "searches_recovered": cur_search.rowcount,
            "crawls_recovered": cur_crawl.rowcount,
            "ai_tasks_recovered": cur_ai.rowcount,
        }

    def sent_today(self, tzname: str) -> int:
        tz = ZoneInfo(tzname)
        start = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        start_utc = start.astimezone(timezone.utc).strftime(FMT)
        return self.one("SELECT COUNT(*) c FROM outbox WHERE sent_at>=?", (start_utc,))["c"]

    # ---- suppression list ---------------------------------------------------
    def suppress(self, email: str, reason: str = "") -> None:
        self.x("INSERT OR IGNORE INTO suppression(email,reason,created_at) VALUES(?,?,?)",
               (email.lower().strip(), reason, utcnow()))

    def is_suppressed(self, email: str) -> bool:
        email = email.lower().strip()
        dom = email.split("@")[-1]
        return bool(self.one("SELECT 1 FROM suppression WHERE email=? OR email=?", (email, "@" + dom)))
