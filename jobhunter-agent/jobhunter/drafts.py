"""Writes the application / follow-up email. Gemini personalises it; a safe template is the fallback."""
from __future__ import annotations

import json
import re
from pathlib import Path

from .data import COUNTRIES
from .gemini import generate_json

OPT_OUT = ('\n\n--\nIf you would prefer not to receive further emails from me, '
           'simply reply with "stop" and I will not contact you again.')


def load_profile(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"{path} not found - copy profile.example.json to profile.json and fill it in")
    data = json.loads(p.read_text(encoding="utf-8"))
    if "YOUR NAME" in json.dumps(data) or not data.get("full_name"):
        raise ValueError("profile.json still has placeholder values - edit it first")
    return data


def _signature(profile: dict) -> str:
    bits = [profile.get("full_name", "")]
    if profile.get("phone"):
        bits.append(profile["phone"])
    return "\n".join(b for b in bits if b)


def _template(profile: dict, company: dict, kind: str) -> tuple[str, str]:
    name = company["name"]
    roles = profile.get("roles") or ["Bartender", "Barista", "Waiter"]
    role_txt = ", ".join(roles[:-1]) + (" and " if len(roles) > 1 else "") + roles[-1]
    exp = profile.get("experience_summary", "")
    auth = profile.get("work_authorization", "")
    if kind == "followup":
        subject = f"Following up - {roles[0]} application - {profile['full_name']}"
        body = (f"Dear {name} team,\n\nI am writing to follow up on my application sent last week for a "
                f"{role_txt} position. I remain very interested in joining your team and would be glad to "
                f"provide any further information.\n\nThank you for your time.\n\nKind regards,\n{_signature(profile)}")
        return subject, body
    subject = f"Application - {role_txt} - {profile['full_name']}"
    body = (f"Dear {name} team,\n\nI would like to apply for a {role_txt} position at {name}. {exp}\n\n"
            f"{auth}\n\nMy CV is attached. I would be happy to attend an interview or video call at any time.\n\n"
            f"Kind regards,\n{_signature(profile)}")
    return subject, re.sub(r"\n{3,}", "\n\n", body)


def _valid(subject: str, body: str, min_len: int = 200) -> bool:
    if not subject or not body or len(body) < min_len or len(body) > 2400:
        return False
    return not re.search(r"\{[^}]*\}|\[[A-Z][A-Za-z ]{2,}\]|<[^>]+>|lorem ipsum", subject + body)


def _prompt(profile: dict, company: dict, kind: str, lang_name: str) -> str:
    role_ctx = company.get("roles") or "bartender / barista / waiter"
    if kind == "followup":
        task = "Write a very short (50-80 words), polite follow-up to my earlier application sent about a week ago."
    else:
        task = ("Write a short (110-160 words), polite, personalised job application email. "
                "Mention the specific role the company advertises if there is one; otherwise apply for "
                "bartender / barista / waiter positions. Say the CV is attached.")
    return f"""{task}
Language of the email: {lang_name}.
Recipient: hiring manager at "{company['name']}" ({company.get('city', '')}, {COUNTRIES.get(company.get('country', ''), ('', ''))[0]}).
Roles seen on their site: {role_ctx}. Company note: {company.get('summary') or 'n/a'}
Rules:
- Plain text only, no markdown, no placeholders, no links.
- Use ONLY facts from PROFILE. Never invent experience, certificates, numbers or promises.
- In one sentence, be honest about work authorization using PROFILE.work_authorization.
- Sign off with the full name and phone from PROFILE. Do NOT add an unsubscribe line.
Return JSON: {{"subject": "...", "body": "..."}}
PROFILE: {json.dumps(profile, ensure_ascii=False)}"""


async def make_draft(cfg, db, client, profile: dict, company: dict, kind: str = "initial"):
    """Returns (subject, body, language_name)."""
    lang_name = COUNTRIES.get(company.get("country", ""), ("", "English"))[1]
    data = await generate_json(cfg, db, client, _prompt(profile, company, kind, lang_name))
    if isinstance(data, dict):
        subject, body = str(data.get("subject", "")).strip(), str(data.get("body", "")).strip()
        if _valid(subject, body, min_len=80 if kind == "followup" else 200):
            return subject, body + OPT_OUT, lang_name
    subject, body = _template(profile, company, kind)
    return subject, body + OPT_OUT, "English"
