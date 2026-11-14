"""Sponsor Score & 4-Dimensional Hospitality Job Matching Engine (Suitability, Sponsorship Evidence, Work-Permit Feasibility, Overall Priority)."""
from __future__ import annotations

import socket

from .data import COUNTRY_PERMIT_RULES, COUNTRY_PRIORITY_RANK, HIGH_DEMAND, map_canonical_professions


def check_mx(domain: str) -> bool:
    """True if the domain can receive email (MX record, or at least an A record)."""
    if not domain:
        return False
    try:
        import dns.resolver  # type: ignore

        try:
            return len(dns.resolver.resolve(domain, "MX", lifetime=8)) > 0
        except Exception:
            pass
    except ImportError:
        pass
    try:
        socket.getaddrinfo(domain, None)
        return True
    except OSError:
        return False


def label(score: int) -> str:
    return "Strong" if score >= 70 else "Maybe" if score >= 45 else "Weak"


def evaluate_four_scores(i: dict, profile: dict | None = None) -> dict:
    """Section 9: Calculates 4 separate scores without hiding missing sponsorship evidence:
       1. job_suitability_score (0-100)
       2. sponsorship_evidence_score (0-100)
       3. work_permit_feasibility_score (0-100)
       4. overall_priority_score (0-100)
    """
    profile = profile or {}
    candidate_roles = map_canonical_professions(profile.get("roles") or ["Bartender", "Barista", "Waiter / Waitress"])
    job_roles = map_canonical_professions(i.get("roles") or [])
    country = (i.get("country") or "").upper().strip()
    red_flags = i.get("red_flags") or []
    visa_sig = i.get("visa_signal") or "none"
    spon_cat = (i.get("sponsorship_category") or "").upper().strip()
    if not spon_cat:
        if visa_sig == "negative" or red_flags:
            spon_cat = "E"
        elif visa_sig == "explicit":
            spon_cat = "B"
        elif visa_sig == "implicit":
            spon_cat = "C"
        else:
            spon_cat = "D"

    # 1. Job Suitability Score (0-100)
    suitability = 20 if i.get("reachable") else 0
    if i.get("has_job"):
        suitability += 35
    if job_roles:
        overlap = set(job_roles) & set(candidate_roles)
        if overlap:
            suitability += 25
        else:
            suitability += 15  # Allied hospitality role
    if i.get("accommodation"):
        suitability += 10
    if i.get("best_email") and i.get("mx_ok", True):
        suitability += 10
    suitability = max(0, min(100, suitability))

    # 2. Sponsorship Evidence Score (0-100) — never inflated by employer size/reputation alone
    if spon_cat == "A":
        sponsorship_score = 95
    elif spon_cat == "B":
        sponsorship_score = 78
    elif spon_cat == "C":
        sponsorship_score = 52
    elif spon_cat == "D":
        sponsorship_score = 15
    else:  # Category E
        sponsorship_score = 0
    if i.get("accommodation") and spon_cat in ("A", "B", "C"):
        sponsorship_score = min(100, sponsorship_score + 5)

    # 3. Work-Permit Feasibility Score (0-100)
    permit_meta = COUNTRY_PERMIT_RULES.get(country, {})
    feasibility = int(permit_meta.get("feasibility_base", 65 if country in HIGH_DEMAND else 50))
    if spon_cat == "E" or visa_sig == "negative" or red_flags:
        feasibility = 0
    else:
        if spon_cat == "A":
            feasibility = min(100, feasibility + 18)
        elif spon_cat == "B":
            feasibility = min(100, feasibility + 10)
        elif spon_cat == "D":
            feasibility = max(15, feasibility - 20)
        # UK / Australia supervisory role check
        if country in ("GB", "GB-ENG", "GB-SCT", "AU"):
            supervisory = any("supervisor" in r.lower() or "head" in r.lower() or "mixologist" in r.lower() for r in job_roles)
            if supervisory:
                feasibility = min(100, feasibility + 12)

    # 4. Overall Application Priority Score (0-100)
    if spon_cat == "E" or visa_sig == "negative" or red_flags:
        overall = 0
    else:
        prio_rank = COUNTRY_PRIORITY_RANK.get(country, 25)
        country_bonus = 8 if prio_rank <= 7 else (5 if prio_rank <= 11 else 2)
        overall = round(
            0.35 * suitability
            + 0.35 * sponsorship_score
            + 0.30 * feasibility
            + country_bonus
        )
        overall = max(0, min(100, overall))

    return {
        "job_suitability_score": suitability,
        "sponsorship_evidence_score": sponsorship_score,
        "work_permit_feasibility_score": feasibility,
        "overall_priority_score": overall,
        "sponsorship_category": spon_cat,
    }


def score_company(i: dict) -> tuple[int, list[str]]:
    s, why = 0, []

    def add(p: int, text: str):
        nonlocal s
        s += p
        why.append(f"{p:+d} {text}")

    if i.get("reachable"):
        add(10, "website reachable")
    if i.get("has_job"):
        add(25, "relevant job posted")
    v = i.get("visa_signal")
    if v == "explicit":
        add(25, "mentions visa / work permit / non-EU hiring")
    elif v == "implicit":
        add(10, "mentions accommodation / relocation / international team")
    elif v == "negative":
        add(-35, "says EU citizens / existing right to work only")
    if i.get("accommodation"):
        add(5, "staff accommodation mentioned")
    if i.get("best_email"):
        add(5, "contact email found")
        add(10, "email domain matches website") if i.get("email_matches_site") else add(-10, "email domain differs from website")
        if i.get("email_kind") == "hr":
            add(5, "HR / careers mailbox")
        if i.get("freemail"):
            add(-10, "free-mail address")
        add(5, "email domain accepts mail") if i.get("mx_ok") else add(-15, "email domain cannot receive mail")
    else:
        add(-20, "no email found")
    if i.get("has_contact_details"):
        add(5, "phone / address listed")
    if i.get("country") in HIGH_DEMAND:
        add(5, "country where many employers hire foreign hospitality staff")
    for f in i.get("red_flags") or []:
        add(-40, f"red flag: {f}")
    return max(0, min(100, s)), why
