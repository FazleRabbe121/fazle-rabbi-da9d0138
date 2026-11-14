"""Gemini REST client with persistent caching, daily call budget, token/error telemetry, and fallback."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone

log = logging.getLogger("gemini")


def _parse_json(txt: str):
    txt = txt.strip()
    txt = re.sub(r"^```(?:json)?\s*|\s*```$", "", txt, flags=re.I)
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", txt, flags=re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def get_gemini_telemetry(cfg, db) -> dict:
    """Returns live Gemini quota, token, cache hit, and error telemetry for the Dashboard/Admin Panel."""
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    used = int(db.kv_get(f"gemini_calls_{day}", "0") or 0)
    tokens = int(db.kv_get(f"gemini_tokens_{day}", "0") or 0)
    errors = int(db.kv_get(f"gemini_errors_{day}", "0") or 0)
    cache_hits = int(db.kv_get(f"gemini_cache_hits_{day}", "0") or 0)
    last_status = db.kv_get("gemini_last_status", "idle")
    pending_ai_tasks = db.one("SELECT COUNT(*) c FROM ai_task_queue WHERE status='pending'")["c"]
    return {
        "date": day,
        "configured": bool(cfg.gemini_key),
        "model": cfg.gemini_model,
        "daily_calls_used": used,
        "daily_calls_limit": cfg.gemini_daily_calls,
        "daily_tokens_used": tokens,
        "daily_errors": errors,
        "cache_hits_today": cache_hits,
        "last_status": last_status,
        "pending_ai_queue_count": pending_ai_tasks,
        "fallback_mode_active": (not cfg.gemini_key) or (used >= cfg.gemini_daily_calls) or (last_status == "quota_exhausted"),
    }


async def generate_json(cfg, db, client, prompt: str, use_cache: bool = True) -> dict | None:
    """Returns a dict, or None when Gemini is unavailable (callers must have a Python fallback)."""
    day = datetime.now(timezone.utc).strftime("%Y%m%d")

    # 1. Check persistent SQLite cache first so repeated analysis of the same vacancy costs 0 quota
    if use_cache and hasattr(db, "get_cached_gemini"):
        cached = db.get_cached_gemini(prompt)
        if isinstance(cached, dict):
            hits = int(db.kv_get(f"gemini_cache_hits_{day}", "0") or 0)
            db.kv_set(f"gemini_cache_hits_{day}", str(hits + 1))
            return cached

    if not cfg.gemini_key or client is None:
        db.kv_set("gemini_last_status", "unconfigured_python_fallback")
        return None

    key = f"gemini_calls_{day}"
    used = int(db.kv_get(key, "0") or 0)
    if used >= cfg.gemini_daily_calls:
        log.info("Gemini daily budget reached (%s/%s) — operating in Python-first mode", used, cfg.gemini_daily_calls)
        db.kv_set("gemini_last_status", "quota_exhausted")
        return None
    db.kv_set(key, str(used + 1))

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{cfg.gemini_model}:generateContent"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"},
    }
    for attempt in range(3):
        try:
            r = await client.post(
                url,
                json=body,
                headers={"x-goog-api-key": cfg.gemini_key, "User-Agent": "aistudio-build"},
                timeout=45,
            )
        except Exception as e:  # network error
            log.warning("Gemini network error: %s", e)
            err_cnt = int(db.kv_get(f"gemini_errors_{day}", "0") or 0)
            db.kv_set(f"gemini_errors_{day}", str(err_cnt + 1))
            db.kv_set("gemini_last_status", "network_error")
            await asyncio.sleep(2 * (attempt + 1))
            continue
        if r.status_code == 429:
            err_cnt = int(db.kv_get(f"gemini_errors_{day}", "0") or 0)
            db.kv_set(f"gemini_errors_{day}", str(err_cnt + 1))
            db.kv_set("gemini_last_status", "quota_exhausted")
            await asyncio.sleep(2 * (attempt + 1))
            continue
        if r.status_code in (500, 502, 503, 504):
            err_cnt = int(db.kv_get(f"gemini_errors_{day}", "0") or 0)
            db.kv_set(f"gemini_errors_{day}", str(err_cnt + 1))
            db.kv_set("gemini_last_status", f"http_{r.status_code}")
            await asyncio.sleep(2 * (attempt + 1))
            continue
        if r.status_code != 200:
            log.warning("Gemini HTTP %s: %s", r.status_code, r.text[:200])
            err_cnt = int(db.kv_get(f"gemini_errors_{day}", "0") or 0)
            db.kv_set(f"gemini_errors_{day}", str(err_cnt + 1))
            db.kv_set("gemini_last_status", f"http_{r.status_code}")
            return None
        try:
            resp_json = r.json()
            txt = resp_json["candidates"][0]["content"]["parts"][0]["text"]
            usage = resp_json.get("usageMetadata", {})
            tok = int(usage.get("totalTokenCount", 0) or 0)
            if tok > 0:
                prev_tok = int(db.kv_get(f"gemini_tokens_{day}", "0") or 0)
                db.kv_set(f"gemini_tokens_{day}", str(prev_tok + tok))
        except Exception:
            return None
        parsed = _parse_json(txt)
        if isinstance(parsed, dict):
            db.kv_set("gemini_last_status", "healthy")
            if use_cache and hasattr(db, "set_cached_gemini"):
                db.set_cached_gemini(prompt, parsed, cfg.gemini_model)
        return parsed
    return None
