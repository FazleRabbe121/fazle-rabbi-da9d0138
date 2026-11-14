"""Decides whether a company page has a real, relevant job. Python rules first, Gemini on top with fallback queue."""
from __future__ import annotations

from datetime import datetime, timezone
import re

from .data import (
    FEE_WORDS,
    HIRING_WORDS,
    ROLE_WORDS,
    SPONSORSHIP_CATEGORIES,
    VISA_EXPLICIT,
    VISA_IMPLICIT,
    VISA_NEGATIVE,
    VISA_VERIFIED_A,
    map_canonical_professions,
)
from .gemini import generate_json

ROLE_RE = re.compile(
    r"(?<!\w)(" + "|".join(sorted((re.escape(w) for w in set(ROLE_WORDS)), key=len, reverse=True)) + r")(?!\w)",
    re.I,
)
HIRING_RE = re.compile(
    r"(?<!\w)(" + "|".join(sorted((re.escape(w) for w in set(HIRING_WORDS)), key=len, reverse=True)) + r")",
    re.I,
)


def classify_sponsorship_evidence(text: str) -> dict:
    """Section 7: Classifies opportunity into Categories A, B, C, D, or E based strictly on evidence."""
    t = (text or "").lower()
    now_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    neg_matches = [k for k in VISA_NEGATIVE if k in t]
    fee_matches = [f for f in FEE_WORDS if f in t]
    if neg_matches or fee_matches:
        reasons = neg_matches + [f"scam/fee flag: {f}" for f in fee_matches]
        return {
            "category": "E",
            "category_label": SPONSORSHIP_CATEGORIES["E"],
            "visa_signal": "negative",
            "confidence": "High",
            "evidence_source": f"Explicitly excluded ({', '.join(reasons[:3])})",
            "verification_date": now_date,
        }

    ver_a_matches = [k for k in VISA_VERIFIED_A if k in t]
    if ver_a_matches:
        return {
            "category": "A",
            "category_label": SPONSORSHIP_CATEGORIES["A"],
            "visa_signal": "explicit",
            "confidence": "High",
            "evidence_source": f"Official sponsorship statement/register ({', '.join(ver_a_matches[:3])})",
            "verification_date": now_date,
        }

    exp_b_matches = [k for k in VISA_EXPLICIT if k in t]
    if exp_b_matches:
        return {
            "category": "B",
            "category_label": SPONSORSHIP_CATEGORIES["B"],
            "visa_signal": "explicit",
            "confidence": "Medium",
            "evidence_source": f"Employer states work-permit/international support ({', '.join(exp_b_matches[:3])})",
            "verification_date": now_date,
        }

    imp_c_matches = [k for k in VISA_IMPLICIT if k in t]
    if imp_c_matches:
        return {
            "category": "C",
            "category_label": SPONSORSHIP_CATEGORIES["C"],
            "visa_signal": "implicit",
            "confidence": "Low",
            "evidence_source": f"Implicit relocation/accommodation signal ({', '.join(imp_c_matches[:3])}) — requires employer confirmation",
            "verification_date": now_date,
        }

    return {
        "category": "D",
        "category_label": SPONSORSHIP_CATEGORIES["D"],
        "visa_signal": "none",
        "confidence": "None",
        "evidence_source": "No sponsorship or work-permit evidence mentioned on page",
        "verification_date": now_date,
    }


def rule_analyze(text: str) -> dict:
    t = (text or "").lower()
    roles = sorted({m.lower() for m in ROLE_RE.findall(t)})
    # "server" alone is too ambiguous (IT servers) - require another role word or hospitality context
    if roles == ["server"] and not re.search(r"restaurant|hotel|bar |café|cafe|guest|dining|hospitality", t):
        roles = []
    has_job = bool(roles) and bool(HIRING_RE.search(t))
    spon = classify_sponsorship_evidence(text)
    visa = spon["visa_signal"]
    accommodation = any(
        k in t
        for k in (
            "accommodation", "housing", "staff housing", "live-in", "unterkunft", "personalunterkunft",
            "logement", "alloggio", "alojamiento", "alojamento", "smještaj", "smjestaj", "zakwaterowanie",
            "huisvesting",
        )
    )
    flags = [f for f in FEE_WORDS if f in t]
    canonical_roles = map_canonical_professions(roles)
    return {
        "has_relevant_job": has_job,
        "roles": roles[:6],
        "canonical_roles": canonical_roles[:6],
        "visa_signal": visa,
        "sponsorship_category": spon["category"],
        "sponsorship_category_label": spon["category_label"],
        "sponsorship_confidence": spon["confidence"],
        "evidence_source": spon["evidence_source"],
        "verification_date": spon["verification_date"],
        "accommodation": accommodation,
        "apply_email": None,
        "apply_url": None,
        "language": "",
        "red_flags": flags,
        "summary": "",
    }


PROMPT = """You are helping an international hospitality professional find REAL job openings and verify sponsorship evidence.
Below is text from a hotel/restaurant/hospitality website (careers or home page; any language).
Return ONLY a JSON object with these keys:
  has_relevant_job: true if there is an open position for Bartender, Barista, Waiter/Waitress, Restaurant Server, Head Waiter, Food and Beverage Assistant/Supervisor, Restaurant/Bar Supervisor, Mixologist, Hotel Restaurant Staff, Hospitality Assistant, Front Office Assistant, or Hotel Operations Staff
  roles: list of short role names found (English)
  visa_signal: "explicit" if the page says they help with visa/work permit or accept non-EU/international applicants;
               "implicit" if it mentions staff accommodation, relocation or an international team;
               "negative" if it says only EU/local citizens or existing right to work required; otherwise "none"
  sponsorship_category: "A" (verified sponsor license / explicit visa guarantee),
                        "B" (employer explicitly states international applicants or work-permit support considered),
                        "C" (potential sponsorship — accommodation/relocation mentioned, requires confirmation),
                        "D" (no sponsorship evidence),
                        "E" (not eligible / EU or local right-to-work only / scam)
  evidence_source: short factual quote or reason for the sponsorship category (never assume sponsorship from hotel size/reputation alone)
  accommodation: true/false
  apply_email: an email address explicitly given for job applications, or null
  apply_url: an application URL explicitly given, or null
  language: ISO 639-1 code of the page language
  red_flags: list of strings (asks applicants to pay money, looks like a scam, etc.) - empty if none
  summary: one short English sentence
Never invent anything. If the page has no job information set has_relevant_job to false.

PAGE TEXT:
"""


async def analyze(cfg, db, client, text: str, company_id: int = 0) -> dict:
    base = rule_analyze(text)
    if not text or not text.strip():
        return base
    # Python-First rule: only call Gemini if there is substantial text where AI adds value
    if len(text.strip()) < 80:
        return base
    data = await generate_json(cfg, db, client, PROMPT + text[:9000])
    if not isinstance(data, dict):
        # If Gemini is configured but currently unavailable / quota-exhausted, queue for background AI retry
        if cfg and getattr(cfg, "gemini_key", "") and company_id > 0 and hasattr(db, "enqueue_ai_task"):
            db.enqueue_ai_task("analyze_company", company_id, {"text_snippet": text[:4000]})
        return base
    out = dict(base)
    out["has_relevant_job"] = bool(data.get("has_relevant_job", base["has_relevant_job"]))
    roles = data.get("roles") or base["roles"]
    out["roles"] = [str(r).lower() for r in roles][:6] if isinstance(roles, list) else base["roles"]
    out["canonical_roles"] = map_canonical_professions(out["roles"])[:6]
    v = str(data.get("visa_signal", "")).lower()
    if v in ("explicit", "implicit", "negative", "none"):
        # never let the model hide a rule-detected negative or scam flag
        out["visa_signal"] = "negative" if base["visa_signal"] == "negative" else v
    cat = str(data.get("sponsorship_category", "")).upper().strip()
    if base["sponsorship_category"] == "E":
        out["sponsorship_category"] = "E"
    elif cat in SPONSORSHIP_CATEGORIES:
        out["sponsorship_category"] = cat
        out["sponsorship_category_label"] = SPONSORSHIP_CATEGORIES[cat]
    ev_src = data.get("evidence_source")
    if isinstance(ev_src, str) and ev_src.strip() and base["sponsorship_category"] != "E":
        out["evidence_source"] = ev_src.strip()[:300]
    out["accommodation"] = bool(data.get("accommodation", base["accommodation"]))
    for k in ("apply_email", "apply_url", "language", "summary"):
        val = data.get(k)
        out[k] = val if isinstance(val, str) and val.strip() and val.lower() != "null" else base.get(k)
    flags = data.get("red_flags") or []
    out["red_flags"] = sorted(set(base["red_flags"]) | {str(f) for f in flags if str(f).strip()})
    if out["red_flags"]:
        out["sponsorship_category"] = "E"
        out["sponsorship_category_label"] = SPONSORSHIP_CATEGORIES["E"]
        out["visa_signal"] = "negative"
    return out
