"""Company discovery: OpenStreetMap (free, no key) and Google Places (optional key) with strict country validation."""
from __future__ import annotations

import asyncio
import logging
import re

from .data import COUNTRIES
from .db import normalize_brand_key
from .textutil import domain_of, normalize_website

log = logging.getLogger("sources")
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# Country TLD and address validation hints
COUNTRY_TLD_MAP = {
    "PL": (".pl",),
    "PT": (".pt",),
    "HR": (".hr",),
    "NL": (".nl",),
    "MT": (".mt", ".com.mt"),
    "ES": (".es",),
    "LU": (".lu",),
    "GB-ENG": (".uk", ".co.uk", ".org.uk"),
    "GB-SCT": (".uk", ".co.uk", ".scot"),
    "GB": (".uk", ".co.uk", ".scot"),
    "AU": (".au", ".com.au"),
    "NZ": (".nz", ".co.nz"),
    "IT": (".it",),
    "GR": (".gr",),
    "AT": (".at",),
    "DE": (".de",),
    "FR": (".fr",),
    "BE": (".be",),
    "IE": (".ie",),
    "RO": (".ro",),
    "SI": (".si",),
    "CH": (".ch",),
    "CY": (".cy", ".com.cy"),
}


def _clean_city(city: str) -> str:
    return re.sub(r"[^\w\s\-\.']", "", city, flags=re.U).strip()


def _iso2(cc: str) -> str:
    """Returns 2-letter ISO country code (maps GB-ENG and GB-SCT to GB for ISO3166-1 checks)."""
    cc_u = (cc or "").upper().strip()
    if cc_u.startswith("GB-"):
        return "GB"
    return cc_u


def validate_company_country(cc: str, addr_country: str = "", formatted_address: str = "", domain: str = "") -> bool:
    """Validates that a discovered company actually belongs to the target country/region."""
    if not cc:
        return True
    target_iso = _iso2(cc)
    if addr_country:
        ac = addr_country.strip().upper()
        if len(ac) == 2 and ac != target_iso:
            return False
    # If formatted_address is present (e.g. from Google Places), check for conflicting country names
    if formatted_address:
        addr_low = formatted_address.lower()
        target_name = COUNTRIES.get(cc, (cc, ""))[0].lower()
        if cc == "GB-ENG" and "scotland" in addr_low and "england" not in addr_low:
            return False
        if cc == "GB-SCT" and "england" in addr_low and "scotland" not in addr_low:
            return False
        # Check if another known country name explicitly appears at the end of formatted_address
        for other_cc, (other_name, _) in COUNTRIES.items():
            if _iso2(other_cc) == target_iso:
                continue
            other_clean = other_name.split("—")[0].strip().lower()
            if other_clean and addr_low.endswith(other_clean) and target_name.split("—")[0].strip().lower() not in addr_low:
                return False
    return True


def build_overpass_query(city: str, kinds: str = "hotels", limit: int = 400, cc: str = "") -> str:
    c = re.escape(_clean_city(city))
    parts = [
        'nwr["tourism"~"^(hotel|resort|guest_house|hostel|motel|apartment)$"]["website"](area.a);',
        'nwr["tourism"~"^(hotel|resort|guest_house|hostel|motel|apartment)$"]["contact:website"](area.a);',
    ]
    if kinds == "all":
        parts += [
            'nwr["amenity"~"^(restaurant|bar|cafe|pub|biergarten)$"]["website"](area.a);',
            'nwr["amenity"~"^(restaurant|bar|cafe|pub|biergarten)$"]["contact:website"](area.a);',
        ]
    body = "\n  ".join(parts)
    cc_u = (cc or "").upper().strip()
    if cc_u in ("GB-ENG", "GB-SCT"):
        area_line = (
            f'area["ISO3166-2"="{cc_u}"]->.country;\n'
            f'area[~"^name(:en)?$"~"^{c}$",i]["boundary"="administrative"](area.country)->.a;'
        )
    elif cc_u and len(cc_u) == 2:
        area_line = (
            f'area["ISO3166-1"="{cc_u}"]->.country;\n'
            f'area[~"^name(:en)?$"~"^{c}$",i]["boundary"="administrative"](area.country)->.a;'
        )
    else:
        area_line = f'area[~"^name(:en)?$"~"^{c}$",i]["boundary"="administrative"]->.a;'
    return (
        f'[out:json][timeout:90];\n'
        f'{area_line}\n'
        f'(\n  {body}\n);\nout tags center {limit};'
    )


def parse_overpass(data: dict, city: str, cc: str) -> list[dict]:
    out, seen_dom, seen_brand = [], set(), set()
    for el in data.get("elements", []):
        t = el.get("tags", {})
        site = normalize_website(t.get("website") or t.get("contact:website") or t.get("url") or "")
        name = t.get("name")
        if not site or not name:
            continue
        dom = domain_of(site)
        if dom in seen_dom or any(b in dom for b in ("facebook.com", "instagram.com", "booking.com", "tripadvisor", "airbnb")):
            continue
        addr_country = t.get("addr:country") or t.get("ISO3166-1") or ""
        if not validate_company_country(cc, addr_country=addr_country, domain=dom):
            continue
        bkey = normalize_brand_key(name)
        if bkey and len(bkey) >= 6 and (bkey, dom) in seen_brand:
            continue
        seen_dom.add(dom)
        if bkey:
            seen_brand.add((bkey, dom))
        addr = " ".join(x for x in (t.get("addr:street"), t.get("addr:housenumber")) if x)
        out.append({
            "name": name, "website": site, "domain": dom, "country": cc, "city": t.get("addr:city") or city,
            "address": addr, "phone": t.get("phone") or t.get("contact:phone") or "",
            "osm_email": (t.get("email") or t.get("contact:email") or "").lower(), "source": "osm",
        })
    return out


async def overpass_search(client, city: str, cc: str, kinds: str = "hotels") -> list[dict]:
    query = build_overpass_query(city, kinds, cc=cc)
    last = None
    for attempt in range(3):
        ep = OVERPASS[attempt % len(OVERPASS)]
        try:
            r = await client.post(ep, data={"data": query}, timeout=120)
            if r.status_code == 200:
                res = parse_overpass(r.json(), city, cc)
                if res:
                    return res
                # Fallback without strict area nesting if OSM administrative hierarchy differs
                if cc:
                    q_fallback = build_overpass_query(city, kinds, cc="")
                    r2 = await client.post(ep, data={"data": q_fallback}, timeout=90)
                    if r2.status_code == 200:
                        return parse_overpass(r2.json(), city, cc)
                return res
            last = f"HTTP {r.status_code}"
        except Exception as e:
            last = str(e)
        await asyncio.sleep(5 * (attempt + 1))
    log.warning("Overpass failed for %s (%s): %s", city, cc, last)
    return []


async def places_search(client, key: str, city: str, cc: str, kinds: str = "hotels") -> list[dict]:
    """Google Places API (New) text search - up to 60 results per query. Needs GOOGLE_PLACES_API_KEY."""
    if not key:
        return []
    country_label = COUNTRIES.get(cc, (cc, ""))[0]
    if cc == "GB-ENG":
        country_label = "England, United Kingdom"
    elif cc == "GB-SCT":
        country_label = "Scotland, United Kingdom"
    queries = ["hotels", "resorts"] + (["restaurants", "bars", "cafes"] if kinds == "all" else [])
    out, seen = [], set()
    for what in queries:
        token = None
        for _ in range(3):
            body = {"textQuery": f"{what} in {city}, {country_label}", "pageSize": 20}
            if token:
                body["pageToken"] = token
            try:
                r = await client.post(
                    "https://places.googleapis.com/v1/places:searchText", json=body, timeout=30,
                    headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask":
                             "places.displayName,places.websiteUri,places.formattedAddress,"
                             "places.nationalPhoneNumber,nextPageToken"},
                )
            except Exception as e:
                log.warning("Places error: %s", e)
                break
            if r.status_code != 200:
                log.warning("Places HTTP %s %s", r.status_code, r.text[:200])
                break
            data = r.json()
            for p in data.get("places", []):
                site = normalize_website(p.get("websiteUri", ""))
                name = (p.get("displayName") or {}).get("text")
                f_addr = p.get("formattedAddress", "")
                if not site or not name:
                    continue
                dom = domain_of(site)
                if dom in seen or any(b in dom for b in ("facebook.com", "instagram.com", "booking.com", "tripadvisor")):
                    continue
                if not validate_company_country(cc, formatted_address=f_addr, domain=dom):
                    continue
                seen.add(dom)
                out.append({"name": name, "website": site, "domain": dom, "country": cc, "city": city,
                            "address": f_addr, "phone": p.get("nationalPhoneNumber", ""),
                            "osm_email": "", "source": "places"})
            token = data.get("nextPageToken")
            if not token:
                break
            await asyncio.sleep(1.5)
    return out
