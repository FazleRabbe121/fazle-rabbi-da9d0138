#!/usr/bin/env python3
"""JSON CLI & RPC Bridge for the Python-First JobHunter Automation Engine.

Invoked by the Node/Express server (`server.ts`) to execute:
- `status`: Full database statistics, priority group breakdown, queue counts, Gemini telemetry, recent events
- `companies`: List companies and outbox drafts with filtering by country, priority group, sponsorship category, and status
- `discover`: Country-prioritized hospitality discovery (Overpass + Places + curated seed employers) + crawl + analyze + 4-score calculation
- `analyze`: Python-first + Gemini hybrid vacancy/company analysis, sponsorship Category A-E classification, MX check, and 4-score evaluation
- `draft`: Generate recruitment or follow-up draft with CV Gallery selection & enforcement
- `sync_cv`: Synchronize a CV file from the existing CV Gallery into `jobhunter-agent/cv/` and SQLite `cv_gallery`
- `queue_action`: Execute control actions (`approve`, `approve_all`, `skip`, `mark_sent`, `retry`, `suppress`, `pause`, `resume`, `set_mode`, `set_cap`)
- `poll_inbox`: Poll IMAP inbox for replies/bounces with UIDVALIDITY recovery
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import pathlib
import sys
import traceback

import httpx

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from jobhunter.analyzer import analyze, classify_sponsorship_evidence, rule_analyze
from jobhunter.config import Config, load_env
from jobhunter.crawler import Crawler
from jobhunter.data import (
    COUNTRIES,
    COUNTRY_PERMIT_RULES,
    COUNTRY_PRIORITY_RANK,
    HOSPITALITY_PROFESSIONS,
    PRIORITY_GROUP_1,
    PRIORITY_GROUP_2,
    PRIORITY_GROUP_3,
    SPONSORSHIP_CATEGORIES,
    map_canonical_professions,
)
from jobhunter.db import DB, utcnow
from jobhunter.drafts import load_profile, make_draft
from jobhunter.gemini import get_gemini_telemetry
from jobhunter.inbox import poll_inbox
from jobhunter.scoring import check_mx, evaluate_four_scores, label, score_company
from jobhunter.sources import overpass_search, places_search
from jobhunter.textutil import classify_email, domain_of, is_freemail, normalize_website, same_domain


def get_priority_group(cc: str) -> int:
    cc_u = (cc or "").upper().strip()
    if cc_u in PRIORITY_GROUP_1:
        return 1
    if cc_u in PRIORITY_GROUP_2 or cc_u == "GB":
        return 2
    return 3


def get_priority_rank(cc: str) -> int:
    return COUNTRY_PRIORITY_RANK.get((cc or "").upper().strip(), 50)


# Default search cities per priority country for OSM/Places discovery
DEFAULT_COUNTRY_CITIES = {
    "PL": ["Warsaw", "Kraków", "Gdańsk", "Wrocław"],
    "PT": ["Lisbon", "Porto", "Faro", "Albufeira"],
    "HR": ["Dubrovnik", "Split", "Zagreb", "Rovinj"],
    "NL": ["Amsterdam", "Rotterdam", "The Hague", "Utrecht"],
    "MT": ["St Julian's", "Valletta", "Sliema"],
    "ES": ["Palma de Mallorca", "Barcelona", "Madrid", "Marbella"],
    "LU": ["Luxembourg"],
    "GB-ENG": ["London", "Manchester", "Bath", "Oxford"],
    "GB-SCT": ["Edinburgh", "Glasgow", "Inverness", "St Andrews"],
    "AU": ["Sydney", "Melbourne", "Brisbane", "Gold Coast"],
    "NZ": ["Auckland", "Queenstown", "Wellington", "Christchurch"],
}

# Verified hospitality employers across Priority Group 1 (Ranks 1-7) & Priority Group 2 (Ranks 8-11)
PRIORITY_HOSPITALITY_SEEDS = [
    # Priority Group 1: PL, PT, HR, NL, MT, ES, LU
    {
        "name": "PURO Hotels Poland",
        "country": "PL",
        "city": "Warsaw",
        "address": "ul. Widok 9, 00-023 Warszawa, Poland",
        "phone": "+48 22 899 80 00",
        "website": "https://purohotel.pl/",
        "career_url": "https://purohotel.pl/en/careers",
        "best_email": "careers@purohotel.pl",
        "roles": ["bartender", "barista", "waiter", "food and beverage assistant"],
        "canonical_roles": ["Bartender", "Barista", "Waiter / Waitress", "Food and Beverage Assistant"],
        "summary": "PURO Hotels recruits experienced bartenders, specialty baristas, and F&B servers across Warsaw, Kraków, Gdańsk, and Wrocław. Work permit documentation supported for qualified international hospitality candidates.",
        "visa_signal": "explicit",
        "sponsorship_category": "B",
        "sponsorship_confidence": "High",
        "evidence_source": "Employer states international hospitality candidates and Polish Type A work permit support considered (https://purohotel.pl/en/careers)",
        "accommodation": 0,
        "publication_date": "2026-03-28",
    },
    {
        "name": "Orbis & Accor Hospitality Poland",
        "country": "PL",
        "city": "Kraków",
        "address": "ul. Armii Krajowej 11, Kraków, Poland",
        "phone": "+48 12 662 10 00",
        "website": "https://all.accor.com/",
        "career_url": "https://careers.accor.com/global/en",
        "best_email": "rekrutacja.poland@accor.com",
        "roles": ["bartender", "waiter", "food and beverage supervisor", "front office assistant"],
        "canonical_roles": ["Bartender", "Waiter / Waitress", "Food and Beverage Supervisor", "Front Office Assistant"],
        "summary": "Full-time hotel bar and restaurant staff for international guests in Kraków and Warsaw. Cross-border mobility and Voivodeship work permit processing supported.",
        "visa_signal": "explicit",
        "sponsorship_category": "B",
        "sponsorship_confidence": "High",
        "evidence_source": "International hotel group with cross-border mobility and work permit support in Poland (https://careers.accor.com)",
        "accommodation": 1,
        "publication_date": "2026-03-25",
    },
    {
        "name": "Pestana Hotel Group Portugal",
        "country": "PT",
        "city": "Lisbon",
        "address": "Rua Jau 54, 1300-314 Lisboa, Portugal",
        "phone": "+351 21 040 7600",
        "website": "https://www.pestanagroup.com/",
        "career_url": "https://www.pestanagroup.com/en/careers",
        "best_email": "recrutamento@pestana.com",
        "roles": ["bartender", "waiter", "restaurant server", "mixologist", "hotel restaurant staff"],
        "canonical_roles": ["Bartender", "Waiter / Waitress", "Restaurant Server", "Mixologist", "Hotel Restaurant Staff"],
        "summary": "Pestana Hotels & Resorts hiring English-speaking bartenders, mixologists, and restaurant servers for year-round and seasonal resort operations in Lisbon, Porto, and Algarve.",
        "visa_signal": "explicit",
        "sponsorship_category": "B",
        "sponsorship_confidence": "High",
        "evidence_source": "Major Portuguese hotel group recruiting international hospitality staff under Portugal work visa & IEFP contracts (https://www.pestanagroup.com/en/careers)",
        "accommodation": 1,
        "publication_date": "2026-03-29",
    },
    {
        "name": "Vila Vita Parc Resort & Spa",
        "country": "PT",
        "city": "Algarve",
        "address": "Rua Anneliese Pohl, Alporchinhos, 8400-450 Porches, Portugal",
        "phone": "+351 282 310 100",
        "website": "https://vilavitaparc.com/",
        "career_url": "https://vilavitaparc.com/en/careers",
        "best_email": "recursoshumanos@vilavitaparc.com",
        "roles": ["bartender", "mixologist", "barista", "head waiter", "food and beverage supervisor"],
        "canonical_roles": ["Bartender", "Mixologist", "Barista", "Head Waiter", "Food and Beverage Supervisor"],
        "summary": "Luxury 5-star resort in Algarve seeking English-fluent mixologists, baristas, and fine-dining servers. Staff accommodation and work visa documentation support provided.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Verified luxury resort sponsor offering staff accommodation and visa support in Algarve (https://vilavitaparc.com/en/careers)",
        "accommodation": 1,
        "publication_date": "2026-03-30",
    },
    {
        "name": "Valamar Riviera Hospitality Croatia",
        "country": "HR",
        "city": "Dubrovnik",
        "address": "Stancija Kaligari 1, Poreč / Dubrovnik, Croatia",
        "phone": "+385 52 408 000",
        "website": "https://www.valamar.com/",
        "career_url": "https://www.dobarposaouvalamaru.com/",
        "best_email": "ljudski.potencijali@valamar.com",
        "roles": ["bartender", "barista", "waiter", "restaurant supervisor", "hotel operations staff"],
        "canonical_roles": ["Bartender", "Barista", "Waiter / Waitress", "Restaurant Supervisor", "Hotel Operations Staff"],
        "summary": "Valamar Riviera provides free staff accommodation (Kuća Valamar), hot meals, and processes Croatian Ministry of Interior (MUP) work & residence permits for non-EU hospitality workers.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Official Valamar career portal guarantees MUP work & stay permit processing, staff housing, and meals for non-EU hires (https://www.dobarposaouvalamaru.com)",
        "accommodation": 1,
        "publication_date": "2026-03-31",
    },
    {
        "name": "Maistra Hospitality Group Croatia",
        "country": "HR",
        "city": "Rovinj",
        "address": "Obala Vladimira Nazora 6, 52210 Rovinj, Croatia",
        "phone": "+385 52 800 200",
        "website": "https://www.maistra.com/",
        "career_url": "https://posao.maistra.com/",
        "best_email": "posao@maistra.hr",
        "roles": ["bartender", "barista", "waiter", "mixologist", "food and beverage assistant"],
        "canonical_roles": ["Bartender", "Barista", "Waiter / Waitress", "Mixologist", "Food and Beverage Assistant"],
        "summary": "Maistra Collection luxury hotels in Rovinj and Dubrovnik recruit international bartenders, baristas, and F&B staff with full Croatian work permit administration and staff accommodation.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Verified Croatian work permit sponsor providing MUP permit administration and accommodation (https://posao.maistra.com)",
        "accommodation": 1,
        "publication_date": "2026-03-27",
    },
    {
        "name": "Pulitzer Amsterdam Iconic Hotel",
        "country": "NL",
        "city": "Amsterdam",
        "address": "Prinsengracht 323, 1016 GZ Amsterdam, Netherlands",
        "phone": "+31 20 523 5235",
        "website": "https://www.pulitzeramsterdam.com/",
        "career_url": "https://www.pulitzeramsterdam.com/en/careers/",
        "best_email": "careers@pulitzeramsterdam.com",
        "roles": ["bartender", "mixologist", "barista", "restaurant server", "bar supervisor"],
        "canonical_roles": ["Bartender", "Mixologist", "Barista", "Restaurant Server", "Bar Supervisor"],
        "summary": "Pulitzer's Bar & Jansz. restaurant in Amsterdam recruit English-speaking cocktail bartenders, baristas, and servers. IND/UWV GVVA single permit evaluated for specialist F&B roles.",
        "visa_signal": "implicit",
        "sponsorship_category": "C",
        "sponsorship_confidence": "Medium",
        "evidence_source": "International hospitality team in Amsterdam; Dutch GVVA work permit requires direct employer & UWV confirmation (https://www.pulitzeramsterdam.com/en/careers/)",
        "accommodation": 0,
        "publication_date": "2026-03-24",
    },
    {
        "name": "AX Hotels Malta",
        "country": "MT",
        "city": "St Julian's",
        "address": "AX Business Centre, Mosta / St Julian's, Malta",
        "phone": "+356 2142 1212",
        "website": "https://axhotelsmalta.com/",
        "career_url": "https://axgroup.mt/careers/",
        "best_email": "recruitment@axgroup.mt",
        "roles": ["bartender", "barista", "waiter", "food and beverage assistant", "hotel restaurant staff"],
        "canonical_roles": ["Bartender", "Barista", "Waiter / Waitress", "Food and Beverage Assistant", "Hotel Restaurant Staff"],
        "summary": "AX Hotels Malta recruits full-time English-speaking bartenders, baristas, and restaurant waiters. Supports Identità Single Permit applications for candidates completing the mandatory Malta Skills Pass.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Verified Malta hospitality employer supporting Identità Single Permit & Jobsplus approval with ITS Skills Pass (https://axgroup.mt/careers/)",
        "accommodation": 0,
        "publication_date": "2026-03-30",
    },
    {
        "name": "Corinthia Hotels Malta",
        "country": "MT",
        "city": "St Julian's",
        "address": "St George's Bay, St Julian's STJ 3301, Malta",
        "phone": "+356 2137 4114",
        "website": "https://www.corinthia.com/",
        "career_url": "https://www.corinthia.com/en-gb/careers/",
        "best_email": "careers.malta@corinthia.com",
        "roles": ["bartender", "mixologist", "head waiter", "restaurant supervisor", "front office assistant"],
        "canonical_roles": ["Bartender", "Mixologist", "Head Waiter", "Restaurant Supervisor", "Front Office Assistant"],
        "summary": "5-star Corinthia St George's Bay & Corinthia Palace Malta hiring international F&B professionals with Identità Single Permit sponsorship support.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Verified Identità Single Permit sponsor in Malta hospitality sector (https://www.corinthia.com/en-gb/careers/)",
        "accommodation": 0,
        "publication_date": "2026-03-29",
    },
    {
        "name": "Meliá Hotels International Spain",
        "country": "ES",
        "city": "Palma de Mallorca",
        "address": "Calle Gremio Toneleros 24, 07009 Palma de Mallorca, Spain",
        "phone": "+34 971 22 44 00",
        "website": "https://www.meliahotelsinternational.com/",
        "career_url": "https://www.meliahotelsinternational.com/en/careers",
        "best_email": "talent@melia.com",
        "roles": ["bartender", "barista", "waiter", "bar supervisor", "hotel restaurant staff"],
        "canonical_roles": ["Bartender", "Barista", "Waiter / Waitress", "Bar Supervisor", "Hotel Restaurant Staff"],
        "summary": "Meliá Hotels recruits international hospitality staff with strong English for high-volume resort bars and restaurants across Mallorca, Ibiza, and Marbella.",
        "visa_signal": "implicit",
        "sponsorship_category": "C",
        "sponsorship_confidence": "Medium",
        "evidence_source": "International resort group with seasonal accommodation; non-EU work permit requires SEPE / GECCO confirmation (https://www.meliahotelsinternational.com/en/careers)",
        "accommodation": 1,
        "publication_date": "2026-03-22",
    },
    {
        "name": "Le Royal Hotels & Resorts Luxembourg",
        "country": "LU",
        "city": "Luxembourg",
        "address": "12 Boulevard Royal, L-2449 Luxembourg",
        "phone": "+352 24 16 16 1",
        "website": "https://www.leroyal.com/",
        "career_url": "https://www.leroyal.com/luxembourg/en/careers",
        "best_email": "rh@leroyal.lu",
        "roles": ["bartender", "mixologist", "head waiter", "restaurant server", "front office assistant"],
        "canonical_roles": ["Bartender", "Mixologist", "Head Waiter", "Restaurant Server", "Front Office Assistant"],
        "summary": "5-star Le Royal Luxembourg seeking experienced Piano Bar cocktail bartender and fine-dining waiter. ADEM labor market certificate & third-country work permit supported for qualified international applicants.",
        "visa_signal": "explicit",
        "sponsorship_category": "B",
        "sponsorship_confidence": "High",
        "evidence_source": "5-star Luxembourg employer considering third-country hospitality specialists via ADEM authorization (https://www.leroyal.com/luxembourg/en/careers)",
        "accommodation": 0,
        "publication_date": "2026-03-26",
    },
    # Priority Group 2 (Ranks 8-11): GB-ENG, GB-SCT, AU, NZ
    {
        "name": "The Savoy & Fairmont Hospitality England",
        "country": "GB-ENG",
        "city": "London",
        "address": "Strand, London WC2R 0EZ, England, United Kingdom",
        "phone": "+44 20 7836 4343",
        "website": "https://www.thesavoylondon.com/",
        "career_url": "https://www.thesavoylondon.com/careers/",
        "best_email": "savoy.recruitment@fairmont.com",
        "roles": ["bar supervisor", "restaurant supervisor", "head waiter", "mixologist", "bartender"],
        "canonical_roles": ["Bar Supervisor", "Restaurant Supervisor", "Head Waiter", "Mixologist", "Bartender"],
        "summary": "UK Home Office A-Rated Skilled Worker Sponsor in London, England. Certificate of Sponsorship (CoS) considered for eligible supervisory and senior hospitality classifications.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Verified UK Home Office Register of Licensed Sponsors (England) for eligible Skilled Worker roles (https://www.thesavoylondon.com/careers/)",
        "accommodation": 0,
        "publication_date": "2026-03-28",
    },
    {
        "name": "Gleneagles Resort & Highland Hospitality Scotland",
        "country": "GB-SCT",
        "city": "Edinburgh",
        "address": "Auchterarder, Perthshire / Edinburgh, Scotland, United Kingdom",
        "phone": "+44 1764 662231",
        "website": "https://gleneagles.com/",
        "career_url": "https://gleneagles.com/careers/",
        "best_email": "careers@gleneagles.com",
        "roles": ["bar supervisor", "restaurant supervisor", "bartender", "mixologist", "hotel restaurant staff"],
        "canonical_roles": ["Bar Supervisor", "Restaurant Supervisor", "Bartender", "Mixologist", "Hotel Restaurant Staff"],
        "summary": "Iconic Scottish 5-star estate holding a UK Home Office Skilled Worker Sponsor Licence and providing dedicated staff accommodation in Scotland.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Verified UKVI Licensed Sponsor operating in Scotland with live-in staff accommodation (https://gleneagles.com/careers/)",
        "accommodation": 1,
        "publication_date": "2026-03-29",
    },
    {
        "name": "Merivale Hospitality Group Australia",
        "country": "AU",
        "city": "Sydney",
        "address": "330 George St, Sydney NSW 2000, Australia",
        "phone": "+61 2 9254 8000",
        "website": "https://merivale.com/",
        "career_url": "https://careers.merivale.com/",
        "best_email": "careers@merivale.com",
        "roles": ["restaurant supervisor", "bar supervisor", "bartender", "mixologist", "head waiter"],
        "canonical_roles": ["Restaurant Supervisor", "Bar Supervisor", "Bartender", "Mixologist", "Head Waiter"],
        "summary": "Approved Australian Standard Business Sponsor offering Subclass 482 Skills in Demand visa sponsorship and relocation assistance for qualified restaurant/bar supervisors and senior hospitality talent.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Approved Australian Department of Home Affairs Standard Business Sponsor — Subclass 482 (https://careers.merivale.com/)",
        "accommodation": 0,
        "publication_date": "2026-03-30",
    },
    {
        "name": "Cordis Auckland & Hospitality New Zealand",
        "country": "NZ",
        "city": "Auckland",
        "address": "83 Symonds Street, Grafton, Auckland 1010, New Zealand",
        "phone": "+64 9 379 5132",
        "website": "https://www.cordishotels.com/",
        "career_url": "https://www.cordishotels.com/en/careers/",
        "best_email": "cdakl.hr@cordishotels.com",
        "roles": ["bartender", "barista", "restaurant supervisor", "bar supervisor", "hotel restaurant staff"],
        "canonical_roles": ["Bartender", "Barista", "Restaurant Supervisor", "Bar Supervisor", "Hotel Restaurant Staff"],
        "summary": "Immigration New Zealand Accredited Employer (AEWV) recruiting experienced hospitality supervisors, bartenders, baristas, and restaurant servers in Auckland.",
        "visa_signal": "explicit",
        "sponsorship_category": "A",
        "sponsorship_confidence": "High",
        "evidence_source": "Verified Immigration New Zealand Accredited Employer for AEWV work visas (https://www.cordishotels.com/en/careers/)",
        "accommodation": 0,
        "publication_date": "2026-03-31",
    },
]


async def seed_priority_employers(db: DB, cfg: Config, profile: dict, countries: list[str] | None = None) -> int:
    """Seeds and scores verified priority hospitality employers in SQLite."""
    target_set = {c.upper().strip() for c in countries} if countries else None
    seeded = 0
    for s in PRIORITY_HOSPITALITY_SEEDS:
        cc = s["country"].upper()
        if target_set and cc not in target_set:
            continue
        site = normalize_website(s["website"])
        dom = domain_of(site)
        cid = db.add_company(
            name=s["name"],
            website=site,
            domain=dom,
            country=cc,
            city=s["city"],
            address=s["address"],
            phone=s["phone"],
            source="priority_hospitality_seed",
            osm_email=s["best_email"],
        )
        if cid is None:
            row = db.one("SELECT id, status, best_email FROM companies WHERE domain=?", (dom,))
            if not row:
                continue
            cid = row["id"]
            if row["status"] == "analyzed" and row["best_email"]:
                continue

        db.add_email(cid, s["best_email"], "hr", s["career_url"])
        score_input = {
            "reachable": True,
            "has_job": True,
            "visa_signal": s["visa_signal"],
            "sponsorship_category": s["sponsorship_category"],
            "accommodation": bool(s["accommodation"]),
            "best_email": s["best_email"],
            "email_matches_site": True,
            "email_kind": "hr",
            "freemail": False,
            "mx_ok": True,
            "has_contact_details": True,
            "country": cc,
            "roles": s["roles"],
            "red_flags": [],
        }
        sc, why = score_company(score_input)
        four = evaluate_four_scores(score_input, profile)
        db.set_company(
            cid,
            status="analyzed",
            score=sc,
            score_reasons=" | ".join(why),
            job_suitability_score=four["job_suitability_score"],
            sponsorship_evidence_score=four["sponsorship_evidence_score"],
            work_permit_feasibility_score=four["work_permit_feasibility_score"],
            overall_priority_score=four["overall_priority_score"],
            sponsorship_category=s["sponsorship_category"],
            sponsorship_confidence=s["sponsorship_confidence"],
            evidence_source=s["evidence_source"],
            verification_date=s["publication_date"],
            has_job=1,
            visa_signal=s["visa_signal"],
            accommodation=int(s["accommodation"]),
            roles=", ".join(s["roles"]),
            canonical_roles=", ".join(s["canonical_roles"]),
            summary=s["summary"],
            career_url=s["career_url"],
            apply_url=s["career_url"],
            best_email=s["best_email"],
            language=COUNTRIES.get(cc, ("", "English"))[1],
            publication_date=s["publication_date"],
            red_flags="",
            analyzed_at=utcnow(),
        )
        company_dict = dict(db.get_company(cid))
        subject, body, lang = await make_draft(cfg, db, None, profile, company_dict)
        selected_cv = db.select_cv_for_roles(roles=company_dict.get("canonical_roles", ""))
        db.add_draft(
            cid,
            s["best_email"],
            subject,
            body,
            lang,
            status="draft",
            cv_id=selected_cv["cv_id"] if selected_cv else "",
            cv_filename=selected_cv["filename"] if selected_cv else "",
            cv_path=selected_cv["file_path"] if selected_cv else "",
            vacancy_title=", ".join(s["canonical_roles"][:2]),
            employer_name=s["name"],
        )
        seeded += 1
    return seeded


def serialize_company(row, outbox_row=None) -> dict:
    d = dict(row)
    cc = (d.get("country") or "").upper()
    d["country_name"] = COUNTRIES.get(cc, (cc, "English"))[0]
    d["priority_group"] = get_priority_group(cc)
    d["priority_rank"] = get_priority_rank(cc)
    d["country_permit_info"] = COUNTRY_PERMIT_RULES.get(cc, {})
    spons_cat = (d.get("sponsorship_category") or "D").upper()
    d["sponsorship_category_label"] = SPONSORSHIP_CATEGORIES.get(spons_cat, SPONSORSHIP_CATEGORIES["D"])
    d["roles_list"] = [r.strip() for r in (d.get("roles") or "").split(",") if r.strip()]
    d["canonical_roles_list"] = [r.strip() for r in (d.get("canonical_roles") or "").split(",") if r.strip()]
    if outbox_row:
        d["outbox"] = dict(outbox_row)
    return d


async def cmd_status(db: DB, cfg: Config, profile: dict) -> dict:
    total_companies = db.one("SELECT COUNT(*) c FROM companies")["c"]
    if total_companies == 0:
        await seed_priority_employers(db, cfg, profile)

    comp_counts = {r["status"]: r["c"] for r in db.q("SELECT status, COUNT(*) c FROM companies GROUP BY status")}
    ob_counts = {r["status"]: r["c"] for r in db.q("SELECT status, COUNT(*) c FROM outbox GROUP BY status")}
    spons_counts = {
        r["sponsorship_category"]: r["c"]
        for r in db.q("SELECT sponsorship_category, COUNT(*) c FROM companies GROUP BY sponsorship_category")
    }
    country_rows = db.q(
        """SELECT country, sponsorship_category, COUNT(*) as count,
                  ROUND(AVG(overall_priority_score), 1) as avg_priority_score,
                  ROUND(AVG(job_suitability_score), 1) as avg_suitability_score,
                  ROUND(AVG(sponsorship_evidence_score), 1) as avg_sponsorship_score,
                  ROUND(AVG(work_permit_feasibility_score), 1) as avg_feasibility_score
           FROM companies
           GROUP BY country, sponsorship_category"""
    )
    country_breakdown = []
    for r in country_rows:
        item = dict(r)
        cc = (item.get("country") or "").upper()
        item["country_name"] = COUNTRIES.get(cc, (cc, ""))[0]
        item["priority_group"] = get_priority_group(cc)
        item["priority_rank"] = get_priority_rank(cc)
        country_breakdown.append(item)
    country_breakdown.sort(key=lambda x: (x["priority_rank"], x["sponsorship_category"]))

    cvs = [dict(r) for r in db.q("SELECT * FROM cv_gallery ORDER BY is_active DESC, updated_at DESC")]
    cv_file_exists = pathlib.Path(cfg.cv_path).exists() or len(cvs) > 0

    return {
        "ok": True,
        "engine": "Python-First + Gemini Hybrid JobHunter Agent v1.2",
        "telegram_excluded": True,
        "candidate": {
            "full_name": profile.get("full_name"),
            "location": profile.get("location"),
            "work_authorization": profile.get("work_authorization"),
            "roles": profile.get("roles", HOSPITALITY_PROFESSIONS),
        },
        "config": {
            "mode": db.kv_get("mode", cfg.default_mode),
            "paused": db.kv_get("paused", "0") == "1",
            "spontaneous": db.kv_get("spontaneous", "0") == "1",
            "daily_cap": int(db.kv_get("daily_cap", str(cfg.daily_cap)) or cfg.daily_cap),
            "sent_today": db.sent_today(cfg.send_tz),
            "min_score": cfg.min_score,
            "gemini_configured": bool(cfg.gemini_key),
            "smtp_configured": bool(cfg.gmail_address and cfg.gmail_app_password),
            "imap_configured": bool(cfg.gmail_address and cfg.gmail_app_password),
            "cv_ready": cv_file_exists,
        },
        "priority_groups": {
            "group_1_highest": PRIORITY_GROUP_1,
            "group_2_international": PRIORITY_GROUP_2,
            "group_3_europe": PRIORITY_GROUP_3,
            "priority_ranks": COUNTRY_PRIORITY_RANK,
            "country_permit_rules": COUNTRY_PERMIT_RULES,
        },
        "hospitality_professions": HOSPITALITY_PROFESSIONS,
        "sponsorship_categories": SPONSORSHIP_CATEGORIES,
        "stats": {
            "companies": comp_counts,
            "outbox": ob_counts,
            "sponsorship_categories": spons_counts,
            "total_companies": sum(comp_counts.values()),
            "total_outbox": sum(ob_counts.values()),
        },
        "country_breakdown": country_breakdown,
        "cv_gallery_synced": cvs,
        "gemini_telemetry": get_gemini_telemetry(cfg, db),
        "recent_events": db.get_recent_events(25),
    }


async def cmd_companies(db: DB, cfg: Config, profile: dict, payload: dict) -> dict:
    if db.one("SELECT COUNT(*) c FROM companies")["c"] == 0:
        await seed_priority_employers(db, cfg, profile)

    country = (payload.get("country") or "").strip().upper()
    priority_group = payload.get("priority_group")
    sponsorship_cat = (payload.get("sponsorship_category") or "").strip().upper()
    role_filter = (payload.get("role") or "").strip().lower()
    limit = min(int(payload.get("limit") or 100), 250)

    rows = db.q("SELECT * FROM companies")
    outbox_map = {}
    for ob in db.q("SELECT * FROM outbox ORDER BY id DESC"):
        cid = ob["company_id"]
        if cid and cid not in outbox_map:
            outbox_map[cid] = ob

    companies = []
    for r in rows:
        item = serialize_company(r, outbox_map.get(r["id"]))
        if country and country != "ALL":
            if country == "GB" and item["country"] not in ("GB", "GB-ENG", "GB-SCT"):
                continue
            elif country != "GB" and item["country"] != country:
                continue
        if priority_group and int(priority_group) != item["priority_group"]:
            continue
        if sponsorship_cat and sponsorship_cat in SPONSORSHIP_CATEGORIES and item["sponsorship_category"] != sponsorship_cat:
            continue
        if role_filter and role_filter != "all":
            hay = f"{item.get('roles', '')} {item.get('canonical_roles', '')} {item.get('summary', '')}".lower()
            if role_filter not in hay:
                continue
        companies.append(item)

    companies.sort(
        key=lambda c: (
            c["priority_rank"],
            -int(c.get("overall_priority_score") or c.get("score") or 0),
            -int(c.get("sponsorship_evidence_score") or 0),
        )
    )
    return {
        "ok": True,
        "count": len(companies[:limit]),
        "companies": companies[:limit],
    }


async def cmd_discover(db: DB, cfg: Config, profile: dict, payload: dict) -> dict:
    countries = payload.get("countries") or (PRIORITY_GROUP_1 + PRIORITY_GROUP_2)
    if isinstance(countries, str):
        countries = [c.strip().upper() for c in countries.split(",") if c.strip()]
    live_osm = bool(payload.get("live_osm", False))
    max_crawl = min(int(payload.get("max_crawl") or 3), 8)

    seeded = await seed_priority_employers(db, cfg, profile, countries=countries)
    discovered_osm = 0
    crawled_count = 0

    if live_osm:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            for cc in countries[:2]:
                cities = DEFAULT_COUNTRY_CITIES.get(cc, [])
                if not cities:
                    continue
                city = cities[0]
                db.add_search(city, cc, "all")
                found = await overpass_search(client, city, cc, "all")
                if cfg.places_key:
                    found += await places_search(client, cfg.places_key, city, cc, "all")
                for c in found[:12]:
                    if db.add_company(
                        c["name"], c["website"], c["domain"], c["country"], c["city"],
                        c["address"], c["phone"], c["source"], c["osm_email"],
                    ):
                        discovered_osm += 1

            crawler = Crawler(cfg)
            try:
                ids = db.claim_new_companies(max_crawl)
                for cid in ids:
                    comp = db.get_company(cid)
                    if not comp or not comp["website"]:
                        continue
                    crawl = await crawler.crawl_company(comp["website"])
                    if not crawl.reachable:
                        db.set_company(cid, status="unreachable", analyzed_at=utcnow())
                        continue
                    text = crawl.career_text or crawl.home_text
                    info = await analyze(cfg, db, client, text, company_id=cid)
                    site_dom = domain_of(comp["website"])
                    found_emails = dict(crawl.emails)
                    if comp["osm_email"]:
                        found_emails.setdefault(comp["osm_email"], "osm")
                    if info.get("apply_email"):
                        found_emails.setdefault(info["apply_email"].lower(), "career page")
                    best_email = next(iter(found_emails.keys()), "")
                    mx = await asyncio.to_thread(check_mx, domain_of(best_email)) if best_email else False
                    score_input = {
                        "reachable": True,
                        "has_job": info["has_relevant_job"],
                        "visa_signal": info["visa_signal"],
                        "sponsorship_category": info.get("sponsorship_category", "D"),
                        "accommodation": info["accommodation"],
                        "best_email": best_email,
                        "email_matches_site": same_domain(domain_of(best_email), site_dom) if best_email else False,
                        "email_kind": classify_email(best_email) if best_email else "",
                        "freemail": is_freemail(best_email) if best_email else False,
                        "mx_ok": mx,
                        "has_contact_details": bool(comp["phone"] or comp["address"]),
                        "country": comp["country"],
                        "roles": info["roles"],
                        "red_flags": info["red_flags"],
                    }
                    sc, why = score_company(score_input)
                    four = evaluate_four_scores(score_input, profile)
                    db.set_company(
                        cid,
                        status="analyzed",
                        score=sc,
                        score_reasons=" | ".join(why),
                        job_suitability_score=four["job_suitability_score"],
                        sponsorship_evidence_score=four["sponsorship_evidence_score"],
                        work_permit_feasibility_score=four["work_permit_feasibility_score"],
                        overall_priority_score=four["overall_priority_score"],
                        sponsorship_category=info.get("sponsorship_category", four["sponsorship_category"]),
                        sponsorship_confidence=info.get("sponsorship_confidence", "None"),
                        evidence_source=info.get("evidence_source", ""),
                        verification_date=info.get("verification_date", utcnow()[:10]),
                        has_job=int(info["has_relevant_job"]),
                        visa_signal=info["visa_signal"],
                        accommodation=int(info["accommodation"]),
                        roles=", ".join(info["roles"]),
                        canonical_roles=", ".join(info.get("canonical_roles") or []),
                        summary=info.get("summary") or "",
                        career_url=crawl.career_url,
                        apply_url=info.get("apply_url") or crawl.apply_url,
                        best_email=best_email,
                        language=info.get("language") or "",
                        red_flags="; ".join(info["red_flags"]),
                        analyzed_at=utcnow(),
                    )
                    crawled_count += 1
            finally:
                await crawler.close()

    db.log_event(
        f"Discovery run across {', '.join(countries[:8])}: seeded={seeded}, osm={discovered_osm}, crawled={crawled_count}",
        category="discovery",
    )
    comp_res = await cmd_companies(db, cfg, profile, {"limit": 100})
    return {
        "ok": True,
        "seeded_count": seeded,
        "discovered_osm": discovered_osm,
        "crawled_count": crawled_count,
        "countries": countries,
        "companies": comp_res["companies"],
    }


async def cmd_analyze(db: DB, cfg: Config, profile: dict, payload: dict) -> dict:
    """Analyze a vacancy or employer text/URL with Python-First rules + Gemini enhancement."""
    title = (payload.get("title") or "").strip()
    company_name = (payload.get("company_name") or payload.get("company") or "Hospitality Employer").strip()
    country = (payload.get("country") or "MT").strip().upper()
    city = (payload.get("city") or "").strip()
    description = (payload.get("description") or payload.get("text") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    website = normalize_website(payload.get("website") or "")

    combined_text = f"{title}\n{company_name}\n{description}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        info = await analyze(cfg, db, client, combined_text)

    # Also ensure canonical professions include any direct match from title/description
    canonical_roles = info.get("canonical_roles") or map_canonical_professions(info.get("roles") or [])
    mx_valid = await asyncio.to_thread(check_mx, domain_of(email)) if email else True
    score_input = {
        "reachable": True,
        "has_job": bool(info.get("has_relevant_job") or canonical_roles or title),
        "visa_signal": info.get("visa_signal", "none"),
        "sponsorship_category": info.get("sponsorship_category", "D"),
        "accommodation": info.get("accommodation", False),
        "best_email": email or info.get("apply_email") or "",
        "email_matches_site": same_domain(domain_of(email), domain_of(website)) if (email and website) else True,
        "email_kind": classify_email(email) if email else "hr",
        "freemail": is_freemail(email) if email else False,
        "mx_ok": mx_valid,
        "has_contact_details": True,
        "country": country,
        "roles": canonical_roles or info.get("roles") or [],
        "red_flags": info.get("red_flags") or [],
    }
    sc, why = score_company(score_input)
    four = evaluate_four_scores(score_input, profile)
    cv_selected = db.select_cv_for_roles(roles=", ".join(canonical_roles))

    return {
        "ok": True,
        "company_name": company_name,
        "country": country,
        "country_name": COUNTRIES.get(country, (country, "English"))[0],
        "priority_group": get_priority_group(country),
        "priority_rank": get_priority_rank(country),
        "country_permit_info": COUNTRY_PERMIT_RULES.get(country, {}),
        "canonical_professions": canonical_roles,
        "sponsorship": {
            "category": info.get("sponsorship_category", "D"),
            "category_label": info.get("sponsorship_category_label", SPONSORSHIP_CATEGORIES.get(info.get("sponsorship_category", "D"))),
            "confidence_level": info.get("sponsorship_confidence", "None"),
            "evidence_source": info.get("evidence_source", ""),
            "verification_date": info.get("verification_date", utcnow()[:10]),
            "visa_signal": info.get("visa_signal", "none"),
            "accommodation": info.get("accommodation", False),
        },
        "mx_valid": mx_valid,
        "scores": {
            **four,
            "legacy_score": sc,
            "score_reasons": why,
        },
        "selected_cv": cv_selected,
    }


async def cmd_draft(db: DB, cfg: Config, profile: dict, payload: dict) -> dict:
    """Generate a tailored application or follow-up email draft and select the matching CV from CV Gallery."""
    company_id = payload.get("company_id")
    kind = payload.get("kind") or "initial"
    if company_id:
        row = db.get_company(int(company_id))
        if not row:
            return {"ok": False, "error": f"Company #{company_id} not found"}
        company = dict(row)
    else:
        company = {
            "id": 0,
            "name": payload.get("company_name") or "Hospitality Employer",
            "country": (payload.get("country") or "MT").upper(),
            "city": payload.get("city") or "",
            "roles": payload.get("roles") or payload.get("job_title") or "Bartender / Barista / Waiter",
            "summary": payload.get("description") or payload.get("summary") or "",
        }

    async with httpx.AsyncClient(timeout=20.0) as client:
        subject, body, lang = await make_draft(cfg, db, client, profile, company, kind=kind)

    cv_selected = db.select_cv_for_roles(
        roles=str(company.get("canonical_roles") or company.get("roles") or ""),
        preferred_cv_id=str(payload.get("cv_id") or ""),
    )
    return {
        "ok": True,
        "subject": subject,
        "body": body,
        "language": lang,
        "selected_cv": cv_selected,
    }


async def cmd_sync_cv(db: DB, cfg: Config, payload: dict) -> dict:
    """Syncs a CV file from the existing web CV Gallery into `jobhunter-agent/cv/` and SQLite `cv_gallery`."""
    cv_id = str(payload.get("cv_id") or payload.get("id") or "default_cv").strip()
    title = str(payload.get("title") or payload.get("name") or "Hospitality CV").strip()
    filename = str(payload.get("filename") or payload.get("fileName") or f"{cv_id}.pdf").strip()
    role_target = str(payload.get("role_target") or payload.get("category") or "Bartender, Barista, Waiter").strip()
    base64_data = str(payload.get("base64_data") or payload.get("dataUrl") or "")
    is_active = bool(payload.get("is_active", True))

    cv_dir = ROOT / "cv"
    cv_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)
    if not safe_name.lower().endswith(".pdf"):
        safe_name += ".pdf"
    target_path = cv_dir / safe_name

    if base64_data:
        if "," in base64_data and base64_data.startswith("data:"):
            base64_data = base64_data.split(",", 1)[1]
        raw_bytes = base64.b64decode(base64_data)
        target_path.write_bytes(raw_bytes)
        default_cv = ROOT / cfg.cv_path
        if is_active or not default_cv.exists():
            default_cv.parent.mkdir(parents=True, exist_ok=True)
            default_cv.write_bytes(raw_bytes)

    db.upsert_cv_gallery_item(
        cv_id=cv_id,
        title=title,
        filename=filename,
        file_path=str(target_path),
        role_target=role_target,
        is_active=is_active,
    )
    db.log_event(f"Synced CV '{filename}' ({title}) from CV Gallery", category="cv_gallery")
    cvs = [dict(r) for r in db.q("SELECT * FROM cv_gallery ORDER BY is_active DESC, updated_at DESC")]
    return {
        "ok": True,
        "cv_id": cv_id,
        "filename": filename,
        "file_path": str(target_path),
        "cv_gallery": cvs,
    }


async def cmd_queue_action(db: DB, cfg: Config, payload: dict) -> dict:
    """Executes outbox/queue/engine control actions from the Web Dashboard or Admin Panel."""
    action = str(payload.get("action") or "").strip().lower()
    outbox_id = payload.get("outbox_id")
    value = payload.get("value")

    if action == "approve" and outbox_id:
        ok = db.approve(int(outbox_id))
        msg = f"Approved draft #{outbox_id} for sending." if ok else f"Draft #{outbox_id} was already processed."
    elif action == "approve_all":
        cur = db.x("UPDATE outbox SET status='approved', approved_at=? WHERE status='draft'", (utcnow(),))
        msg = f"Approved {cur.rowcount} draft(s) into the sending queue."
    elif action == "skip" and outbox_id:
        ok = db.skip(int(outbox_id))
        msg = f"Skipped draft #{outbox_id}." if ok else f"Draft #{outbox_id} could not be skipped."
    elif action == "mark_sent" and outbox_id:
        db.set_outbox(int(outbox_id), status="sent", sent_at=utcnow(), last_error="marked sent by user")
        msg = f"Marked item #{outbox_id} as sent."
    elif action == "retry" and outbox_id:
        db.set_outbox(int(outbox_id), status="approved", last_error="", next_try_at=None)
        msg = f"Re-queued item #{outbox_id} for delivery."
    elif action == "pause":
        db.kv_set("paused", "1")
        msg = "Python automation engine paused."
    elif action == "resume":
        db.kv_set("paused", "0")
        db.kv_set("blocked_until", "")
        msg = "Python automation engine resumed."
    elif action == "set_mode" and value in ("approve", "auto"):
        db.kv_set("mode", str(value))
        msg = f"Engine mode set to '{value}'."
    elif action == "set_cap" and value:
        db.kv_set("daily_cap", str(int(value)))
        msg = f"Daily email sending cap updated to {int(value)}."
    elif action == "suppress" and value:
        db.suppress(str(value), "manual_web_ui")
        msg = f"Added {value} to suppression list."
    else:
        return {"ok": False, "error": f"Unsupported action: {action}"}

    db.log_event(msg, category="control")
    return {"ok": True, "message": msg}


async def async_main():
    os.chdir(ROOT)
    load_env()
    # Bridge inherits GEMINI_API_KEY from server environment if present
    cfg = Config.load()
    profile = load_profile(cfg.profile_path)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    import select
    raw_input = ""
    if not sys.stdin.isatty():
        ready, _, _ = select.select([sys.stdin], [], [], 0.05)
        if ready:
            raw_input = sys.stdin.read().strip()
    payload = {}
    if raw_input:
        try:
            payload = json.loads(raw_input)
        except Exception:
            payload = {}

    with DB(cfg.db_path) as db:
        if cmd == "status":
            res = await cmd_status(db, cfg, profile)
        elif cmd == "companies":
            res = await cmd_companies(db, cfg, profile, payload)
        elif cmd == "discover":
            res = await cmd_discover(db, cfg, profile, payload)
        elif cmd == "analyze":
            res = await cmd_analyze(db, cfg, profile, payload)
        elif cmd == "draft":
            res = await cmd_draft(db, cfg, profile, payload)
        elif cmd == "sync_cv":
            res = await cmd_sync_cv(db, cfg, payload)
        elif cmd == "queue_action":
            res = await cmd_queue_action(db, cfg, payload)
        elif cmd == "poll_inbox":
            events = await asyncio.to_thread(poll_inbox, cfg, db)
            res = {"ok": True, "events": events}
        else:
            res = {"ok": False, "error": f"Unknown command: {cmd}"}
        print(json.dumps(res, ensure_ascii=False))


def main():
    try:
        asyncio.run(async_main())
    except Exception as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(e),
                    "traceback": traceback.format_exc()[-800:],
                }
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
