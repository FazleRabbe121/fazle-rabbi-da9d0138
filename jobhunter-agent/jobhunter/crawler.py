"""Polite website crawler: SSRF protection, safe redirect handling, robots.txt, per-site delay, careers + contact pages."""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
import time
from collections import defaultdict
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

from .analyzer import ROLE_RE
from .data import CAREER_KEYWORDS, CONTACT_KEYWORDS
from .textutil import (domain_of, extract_emails, find_ats_links, parse_html, pick_links)

log = logging.getLogger("crawler")

BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "169.254.169.254",
    "0.0.0.0",
}


def is_safe_ip(ip_str: str) -> bool:
    """Returns False if the IP address is private, loopback, link-local, multicast, or reserved (SSRF guard)."""
    try:
        ip = ipaddress.ip_address(ip_str)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
        return True
    except ValueError:
        return False


def is_safe_url(url: str, resolve_dns: bool = True) -> bool:
    """Validates URL scheme, hostname, and resolved IP addresses to prevent SSRF and unsafe redirects."""
    if not url or not isinstance(url, str):
        return False
    try:
        p = urlparse(url.strip())
    except Exception:
        return False
    if p.scheme not in ("http", "https"):
        return False
    host = (p.hostname or "").strip().lower()
    if not host or host in BLOCKED_HOSTS or host.endswith(".local") or host.endswith(".internal"):
        return False
    # Direct IP literal check
    try:
        ipaddress.ip_address(host)
        return is_safe_ip(host)
    except ValueError:
        pass
    if resolve_dns:
        try:
            infos = socket.getaddrinfo(host, p.port or (443 if p.scheme == "https" else 80), type=socket.SOCK_STREAM)
            if not infos:
                return False
            for info in infos:
                sockaddr = info[4]
                if sockaddr and not is_safe_ip(str(sockaddr[0])):
                    return False
        except OSError:
            return False
    return True


@dataclass
class CrawlResult:
    reachable: bool = False
    final_url: str = ""
    career_url: str = ""
    apply_url: str = ""
    career_text: str = ""
    home_text: str = ""
    emails: dict = field(default_factory=dict)  # email -> page url where found
    pages: list = field(default_factory=list)


class Crawler:
    def __init__(self, cfg):
        import httpx

        self.cfg = cfg
        # Disable automatic redirects so every redirect hop is validated against SSRF rules
        self.client = httpx.AsyncClient(
            follow_redirects=False, timeout=httpx.Timeout(20.0),
            headers={"User-Agent": cfg.user_agent, "Accept-Language": "en,*;q=0.5"},
        )
        self._robots: dict[str, RobotFileParser] = {}
        self._last: dict[str, float] = {}
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def close(self):
        await self.client.aclose()

    async def _safe_get(self, url: str, max_redirects: int = 5):
        """Performs GET with per-hop SSRF validation on redirects."""
        current = url
        for _ in range(max_redirects + 1):
            if not await asyncio.to_thread(is_safe_url, current, True):
                log.warning("SSRF guard blocked unsafe URL: %s", current)
                return None
            try:
                r = await self.client.get(current)
            except Exception:
                return None
            if r.status_code in (301, 302, 303, 307, 308):
                loc = r.headers.get("location", "").strip()
                if not loc:
                    return r
                next_url = urljoin(current, loc)
                if not await asyncio.to_thread(is_safe_url, next_url, True):
                    log.warning("SSRF guard blocked unsafe redirect from %s to %s", current, next_url)
                    return None
                current = next_url
                continue
            return r
        return None

    async def _allowed(self, url: str) -> bool:
        p = urlparse(url)
        dom = p.netloc
        if dom not in self._robots:
            rp = RobotFileParser()
            try:
                robots_url = f"{p.scheme}://{dom}/robots.txt"
                r = await self._safe_get(robots_url, max_redirects=3)
                rp.parse(r.text.splitlines() if (r is not None and r.status_code == 200) else [])
            except Exception:
                rp.parse([])
            rp.modified()  # without this, can_fetch() returns False for everything
            self._robots[dom] = rp
        return self._robots[dom].can_fetch(self.cfg.user_agent, url)

    async def fetch(self, url: str):
        """Returns (status, html, final_url) or None when blocked / unreachable."""
        if not await asyncio.to_thread(is_safe_url, url, True):
            log.warning("Blocked unsafe fetch URL: %s", url)
            return None
        dom = domain_of(url)
        async with self._locks[dom]:
            wait = self.cfg.crawl_delay - (time.monotonic() - self._last.get(dom, 0))
            if wait > 0:
                await asyncio.sleep(wait)
            self._last[dom] = time.monotonic()
        if not await self._allowed(url):
            log.info("robots.txt disallows %s", url)
            return None
        r = await self._safe_get(url, max_redirects=5)
        if r is None:
            return None
        ctype = r.headers.get("content-type", "").lower()
        if r.status_code >= 400 or ("html" not in ctype and "text" not in ctype):
            return (r.status_code, "", str(r.url))
        return (r.status_code, r.text[:600_000], str(r.url))

    async def _render(self, url: str) -> str | None:
        """Optional JavaScript rendering (pip install playwright && playwright install chromium)."""
        if not await asyncio.to_thread(is_safe_url, url, True):
            return None
        try:
            from playwright.async_api import async_playwright  # type: ignore
        except ImportError:
            return None
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch()
                page = await browser.new_page(user_agent=self.cfg.user_agent)
                await page.goto(url, wait_until="networkidle", timeout=30000)
                html = await page.content()
                await browser.close()
                return html
        except Exception as e:
            log.info("playwright failed for %s: %s", url, e)
            return None

    async def _page(self, url: str):
        got = await self.fetch(url)
        if got is None:
            return None
        status, html, final = got
        parsed = parse_html(html) if html else {"text": "", "links": [], "mailtos": [], "title": ""}
        if self.cfg.use_playwright and len(parsed["text"]) < 300 and status < 400:
            rendered = await self._render(final)
            if rendered:
                html = rendered
                parsed = parse_html(rendered)
        return status, html, final, parsed

    def _collect(self, res: CrawlResult, url: str, html: str, parsed: dict):
        for e in extract_emails(parsed["text"] + " " + html[:200_000], parsed["mailtos"]):
            res.emails.setdefault(e, url)

    async def crawl_company(self, website: str) -> CrawlResult:
        res = CrawlResult()
        home = await self._page(website)
        if home is None and website.startswith("https://"):
            home = await self._page("http://" + website[len("https://"):])
        if home is None or home[0] >= 400:
            return res
        status, html, final, parsed = home
        res.reachable, res.final_url, res.home_text = True, final, parsed["text"][:8000]
        self._collect(res, final, html, parsed)
        links = list(parsed["links"])

        ats = find_ats_links(links)
        if ats:
            res.apply_url = ats[0]

        career_urls = pick_links(links, final, CAREER_KEYWORDS, limit=3, allow_ats=False)
        contact_urls = pick_links(links, final, CONTACT_KEYWORDS, limit=2)
        texts = []
        for cu in career_urls:
            got = await self._page(cu)
            if not got or got[0] >= 400:
                continue
            _, chtml, cfinal, cparsed = got
            res.pages.append(cfinal)
            if not res.career_url:
                res.career_url = cfinal
            texts.append(cparsed["text"][:6000])
            self._collect(res, cfinal, chtml, cparsed)
            if not res.apply_url:
                a = find_ats_links(cparsed["links"])
                if a:
                    res.apply_url = a[0]
            # follow up to 2 links whose text names a role (e.g. "Bartender (m/f)")
            role_links = [(h, t) for h, t in cparsed["links"] if t and ROLE_RE.search(t)]
            for ju in self._role_urls(role_links, cfinal)[:2]:
                jg = await self._page(ju)
                if jg and jg[0] < 400:
                    texts.append(jg[3]["text"][:3000])
                    self._collect(res, jg[2], jg[1], jg[3])
        for ku in contact_urls:
            got = await self._page(ku)
            if got and got[0] < 400:
                self._collect(res, got[2], got[1], got[3])
        res.career_text = "\n\n".join(texts)
        return res

    @staticmethod
    def _role_urls(role_links, base_url: str) -> list[str]:
        base, out = domain_of(base_url), []
        for href, _ in role_links:
            if href.startswith(("#", "mailto:", "tel:", "javascript:")):
                continue
            u = urljoin(base_url, href).split("#")[0]
            d = domain_of(u)
            if u.startswith("http") and (d == base or d.endswith("." + base)) and u not in out:
                out.append(u)
        return out
