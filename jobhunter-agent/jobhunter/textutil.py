"""HTML parsing, email extraction and link picking - stdlib only."""
from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

from .data import ATS_DOMAINS, FREEMAIL, GENERAL_LOCALS, HR_LOCALS

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
EMAIL_OK = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
BAD_EMAIL_BITS = ("example.", "sentry", "wixpress", "yourdomain", "domain.com", "email.com",
                  "u003e", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", "@2x", "noreply",
                  "no-reply", "donotreply", "privacy@", "dpo@", "abuse@", "webmaster@")


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.chunks: list[str] = []
        self.mailtos: list[str] = []
        self.title = ""
        self._skip = 0
        self._href: str | None = None
        self._ltext: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"):
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "a":
            href = (a.get("href") or "").strip()
            self._href, self._ltext = href, []
            if href.lower().startswith("mailto:"):
                self.mailtos.append(href[7:].split("?")[0])
        elif tag in ("br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4"):
            self.chunks.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg"):
            self._skip = max(0, self._skip - 1)
        elif tag == "title":
            self._in_title = False
        elif tag == "a" and self._href is not None:
            if self._href:
                self.links.append((self._href, " ".join(self._ltext).strip()))
            self._href = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._skip:
            return
        d = data.strip()
        if d:
            self.chunks.append(d)
            if self._href is not None:
                self._ltext.append(d)


def parse_html(html: str) -> dict:
    p = PageParser()
    try:
        p.feed(html)
    except Exception:
        pass
    text = re.sub(r"[ \t]+", " ", " ".join(p.chunks))
    text = re.sub(r"\s*\n\s*", "\n", text).strip()
    return {"text": text, "links": p.links, "mailtos": p.mailtos, "title": p.title.strip()}


def deobfuscate(t: str) -> str:
    t = re.sub(r"\s*[\[\(\{]\s*at\s*[\]\)\}]\s*", "@", t, flags=re.I)
    t = re.sub(r"\s*[\[\(\{]\s*dot\s*[\]\)\}]\s*", ".", t, flags=re.I)
    return t


def extract_emails(text: str, extra: list[str] | None = None) -> list[str]:
    found: list[str] = []
    for chunk in [deobfuscate(text)] + [deobfuscate(e) for e in (extra or [])]:
        for m in EMAIL_RE.findall(chunk):
            e = m.strip(".").lower()
            if any(b in e for b in BAD_EMAIL_BITS) or not EMAIL_OK.match(e):
                continue
            if e not in found:
                found.append(e)
    return found


def domain_of(url_or_email: str) -> str:
    s = url_or_email.strip().lower()
    if "@" in s and "/" not in s:
        return s.split("@")[-1]
    if "://" not in s:
        s = "https://" + s
    host = urlparse(s).netloc.split("@")[-1].split(":")[0]
    return host[4:] if host.startswith("www.") else host


def same_domain(a: str, b: str) -> bool:
    return bool(a and b) and (a == b or a.endswith("." + b) or b.endswith("." + a))


def normalize_website(url: str) -> str:
    url = url.strip().split()[0] if url.strip() else ""
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}/" if p.netloc else ""


def classify_email(email: str) -> str:
    local = email.split("@")[0].lower().replace(".", "").replace("-", "").replace("_", "")
    if local in HR_LOCALS or any(local.startswith(h) for h in ("career", "jobs", "recruit", "karriere", "bewerb")):
        return "hr"
    if local in GENERAL_LOCALS:
        return "general"
    return "person"


def is_freemail(email: str) -> bool:
    return email.split("@")[-1].lower() in FREEMAIL


def _norm(s: str) -> str:
    return re.sub(r"[-_/+.]", " ", s.lower())


def pick_links(links, base_url: str, keywords: list[str], limit: int = 3, allow_ats: bool = False):
    base = domain_of(base_url)
    scored: dict[str, int] = {}
    for href, text in links:
        h = href.strip()
        if not h or h.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        url = urljoin(base_url, h).split("#")[0]
        if not url.startswith("http"):
            continue
        d = domain_of(url)
        ats = any(d == a or d.endswith("." + a) for a in ATS_DOMAINS)
        if not (same_domain(d, base) or (allow_ats and ats)):
            continue
        path, txt = _norm(urlparse(url).path), _norm(text)
        sc = sum(2 for k in keywords if k in txt) + sum(1 for k in keywords if k in path)
        if sc:
            scored[url] = max(scored.get(url, 0), sc)
    ranked = sorted(scored.items(), key=lambda kv: (-kv[1], len(kv[0])))
    return [u for u, _ in ranked[:limit]]


def find_ats_links(links) -> list[str]:
    out = []
    for href, _ in links:
        d = domain_of(href) if href.startswith("http") else ""
        if d and any(d == a or d.endswith("." + a) for a in ATS_DOMAINS) and href not in out:
            out.append(href)
    return out
