"""Static data: priority countries, hospitality professions, multilingual keywords, and work-permit rules."""
from __future__ import annotations

# Priority Group 1 — Highest Search Priority (Hospitality Sponsorship & Work Permit Pathways)
PRIORITY_GROUP_1 = ["PL", "PT", "HR", "NL", "MT", "ES", "LU"]

# Priority Group 2 — Important International Destinations (with England & Scotland as separate UK regions)
PRIORITY_GROUP_2 = ["GB-ENG", "GB-SCT", "AU", "NZ"]

# Priority Group 3 — Additional European & EURES Coverage
PRIORITY_GROUP_3 = [
    "IT", "GR", "AT", "DE", "FR", "BE", "IE", "RO", "SI", "CH", "CY",
    "CZ", "DK", "SE", "FI", "NO", "IS", "HU", "SK", "BG", "LT", "LV", "EE",
]

# ISO / Region code -> (country/region display name, language used for email drafts)
COUNTRIES = {
    # Priority Group 1
    "PL": ("Poland", "Polish"),
    "PT": ("Portugal", "Portuguese"),
    "HR": ("Croatia", "Croatian"),
    "NL": ("Netherlands", "English"),
    "MT": ("Malta", "English"),
    "ES": ("Spain", "Spanish"),
    "LU": ("Luxembourg", "French"),
    # Priority Group 2 (England and Scotland represented as separate searchable regions under UK)
    "GB-ENG": ("United Kingdom — England", "English"),
    "GB-SCT": ("United Kingdom — Scotland", "English"),
    "GB": ("United Kingdom", "English"),
    "AU": ("Australia", "English"),
    "NZ": ("New Zealand", "English"),
    # Additional European / EURES Destinations
    "RO": ("Romania", "Romanian"),
    "CZ": ("Czechia", "Czech"),
    "LT": ("Lithuania", "English"),
    "LV": ("Latvia", "English"),
    "EE": ("Estonia", "English"),
    "BG": ("Bulgaria", "Bulgarian"),
    "HU": ("Hungary", "Hungarian"),
    "SK": ("Slovakia", "Slovak"),
    "SI": ("Slovenia", "Slovenian"),
    "DE": ("Germany", "German"),
    "AT": ("Austria", "German"),
    "BE": ("Belgium", "English"),
    "IE": ("Ireland", "English"),
    "IT": ("Italy", "Italian"),
    "FR": ("France", "French"),
    "GR": ("Greece", "English"),
    "CY": ("Cyprus", "English"),
    "DK": ("Denmark", "English"),
    "SE": ("Sweden", "English"),
    "FI": ("Finland", "English"),
    "NO": ("Norway", "English"),
    "CH": ("Switzerland", "German"),
    "IS": ("Iceland", "English"),
}

# Country priority rank lookup (lower number = higher priority in resource allocation)
COUNTRY_PRIORITY_RANK: dict[str, int] = {}
for _idx, _code in enumerate(PRIORITY_GROUP_1, start=1):
    COUNTRY_PRIORITY_RANK[_code] = _idx
for _idx, _code in enumerate(PRIORITY_GROUP_2, start=8):
    COUNTRY_PRIORITY_RANK[_code] = _idx
COUNTRY_PRIORITY_RANK["GB"] = 8
for _idx, _code in enumerate(PRIORITY_GROUP_3, start=12):
    COUNTRY_PRIORITY_RANK[_code] = _idx

# Heuristic: countries where hospitality employers frequently recruit international staff under work permits
HIGH_DEMAND = {
    "PL", "PT", "HR", "NL", "MT", "ES", "LU",
    "GB-ENG", "GB-SCT", "GB", "AU", "NZ",
    "IT", "GR", "RO", "CZ", "LT", "LV", "EE", "BG", "HU", "SK", "SI", "AT",
}

# Country-specific work-permit & sponsorship verification metadata
COUNTRY_PERMIT_RULES = {
    "PL": {
        "group": 1,
        "priority": 1,
        "pathway": "Zezwolenie na pracę Typ A / Typ S (Voivodeship Work Permit)",
        "authority": "Urząd Wojewódzki & Powiatowy Urząd Pracy (PUP)",
        "feasibility_base": 82,
        "notes": "Employer applies for Type A or seasonal Type S permit; verify PUP labor test (test rynku pracy).",
    },
    "PT": {
        "group": 1,
        "priority": 2,
        "pathway": "Visto D1 (Subordinate Work) / Seasonal Work Visa (AIMA & IEFP)",
        "authority": "AIMA (Agência para a Integração, Migrações e Asilo) & IEFP",
        "feasibility_base": 80,
        "notes": "Requires employment contract or promise of contract registered with IEFP and Social Security.",
    },
    "HR": {
        "group": 1,
        "priority": 3,
        "pathway": "Dozvola za boravak i rad (MUP Stay & Work Permit / HZZ Seasonal)",
        "authority": "Ministarstvo unutarnjih poslova (MUP) & HZZ",
        "feasibility_base": 88,
        "notes": "Strong seasonal & year-round hospitality recruitment; verify employer OIB and accommodation provision.",
    },
    "NL": {
        "group": 1,
        "priority": 4,
        "pathway": "GVVA Single Permit (Combined Residence and Work Permit)",
        "authority": "IND & UWV (Uitvoeringsinstituut Werknemersverzekeringen)",
        "feasibility_base": 68,
        "notes": "Strict UWV labor market test (5-week EEA advertising requirement) and Horeca CAO salary compliance.",
    },
    "MT": {
        "group": 1,
        "priority": 5,
        "pathway": "Identità Single Permit + Mandatory ITS Hospitality Skills Pass",
        "authority": "Identità, Jobsplus & Institute of Tourism Studies (ITS)",
        "feasibility_base": 86,
        "notes": "High hospitality demand; candidate must complete mandatory ITS Tourism & Hospitality Skills Pass.",
    },
    "ES": {
        "group": 1,
        "priority": 6,
        "pathway": "Autorización de residencia y trabajo por cuenta ajena / Orden GECCO",
        "authority": "Ministerio de Inclusión, Seguridad Social y Migraciones & SEPE",
        "feasibility_base": 74,
        "notes": "Requires SEPE labor market clearance or seasonal GECCO campaign sponsorship.",
    },
    "LU": {
        "group": 1,
        "priority": 7,
        "pathway": "Autorisation de séjour temporaire pour salarié de pays tiers (ADEM)",
        "authority": "Direction de l'immigration & ADEM (Agence pour le développement de l'emploi)",
        "feasibility_base": 70,
        "notes": "Employer declares vacancy to ADEM; after 3-week test, ADEM issues certificate allowing third-country hire.",
    },
    "GB-ENG": {
        "group": 2,
        "priority": 8,
        "pathway": "UK Skilled Worker Visa (Home Office A-Rated Sponsor Register — England)",
        "authority": "UK Visas and Immigration (UKVI)",
        "feasibility_base": 62,
        "notes": "Prioritize Home Office licensed sponsors and eligible supervisory/skilled hospitality roles (SOC 5434/1223).",
    },
    "GB-SCT": {
        "group": 2,
        "priority": 9,
        "pathway": "UK Skilled Worker Visa (Home Office A-Rated Sponsor Register — Scotland)",
        "authority": "UK Visas and Immigration (UKVI)",
        "feasibility_base": 65,
        "notes": "Highland & luxury Scottish resorts often provide staff accommodation; requires UKVI licensed sponsor & eligible SOC.",
    },
    "GB": {
        "group": 2,
        "priority": 8,
        "pathway": "UK Skilled Worker Visa (Home Office A-Rated Sponsor Register)",
        "authority": "UK Visas and Immigration (UKVI)",
        "feasibility_base": 62,
        "notes": "Prioritize Home Office licensed sponsors and eligible supervisory/skilled hospitality roles.",
    },
    "AU": {
        "group": 2,
        "priority": 10,
        "pathway": "Skills in Demand / TSS Subclass 482 & Regional Subclass 494 / DAMA",
        "authority": "Australian Department of Home Affairs",
        "feasibility_base": 64,
        "notes": "Investigate Approved Standard Business Sponsors, Restaurant/Bar Supervisors, and Regional DAMA concessions.",
    },
    "NZ": {
        "group": 2,
        "priority": 11,
        "pathway": "Accredited Employer Work Visa (AEWV — Immigration New Zealand)",
        "authority": "Immigration New Zealand (INZ)",
        "feasibility_base": 75,
        "notes": "Employer must hold active INZ Accreditation and approved Job Check token; verify ANZSCO skill level & wage rate.",
    },
}

# Section 6: 14 Canonical Hospitality Professions & Synonym Mapping
HOSPITALITY_PROFESSIONS = [
    "Bartender",
    "Barista",
    "Waiter / Waitress",
    "Restaurant Server",
    "Head Waiter",
    "Food and Beverage Assistant",
    "Food and Beverage Supervisor",
    "Restaurant Supervisor",
    "Bar Supervisor",
    "Mixologist",
    "Hotel Restaurant Staff",
    "Hospitality Assistant",
    "Front Office Assistant",
    "Hotel Operations Staff",
]

ROLE_SYNONYMS: dict[str, list[str]] = {
    "Bartender": [
        "bartender", "barman", "barmaid", "barkeeper", "bar tender", "cocktail bartender",
        "pool bar bartender", "lounge bartender", "barmitarbeiter", "banconiere", "šanker",
        "bārmenis", "барман", "μπάρμαν", "empregado de bar", "bar attendant",
    ],
    "Barista": [
        "barista", "head barista", "specialty coffee barista", "coffee specialist", "coffee maker",
    ],
    "Waiter / Waitress": [
        "waiter", "waitress", "waitstaff", "kellner", "kellnerin", "cameriere", "cameriera",
        "camarero", "camarera", "serveur", "serveuse", "kelner", "kelnerka", "konobar",
        "konobarica", "ospătar", "chelner", "čašník", "číšník", "servírka", "pincér",
        "padavėjas", "viesmīlis", "ettekandja", "сервитьор", "ober", "serveerster",
        "empregado de mesa", "garçom", "σερβιτόρος", "σερβιτόρα", "commis waiter", "demi chef de rang",
    ],
    "Restaurant Server": [
        "restaurant server", "dining room server", "fine dining server", "banquet server",
        "food runner", "table server", "servicekraft", "servicemitarbeiter", "bediening",
    ],
    "Head Waiter": [
        "head waiter", "head waitress", "maître d", "maitre d", "chef de rang", "lead waiter",
        "senior waiter", "oberkellner", "primo cameriere",
    ],
    "Food and Beverage Assistant": [
        "food and beverage assistant", "food & beverage assistant", "f&b assistant",
        "f&b attendant", "food and beverage attendant", "f&b team member", "food and beverage",
        "food & beverage", "f&b",
    ],
    "Food and Beverage Supervisor": [
        "food and beverage supervisor", "food & beverage supervisor", "f&b supervisor",
        "f&b lead", "food and beverage team leader", "f&b manager", "assistant f&b manager",
    ],
    "Restaurant Supervisor": [
        "restaurant supervisor", "dining room supervisor", "floor supervisor",
        "assistant restaurant manager", "restaurant team leader",
    ],
    "Bar Supervisor": [
        "bar supervisor", "head bartender", "lead bartender", "bar team leader",
        "bar manager", "assistant bar manager", "beverage supervisor",
    ],
    "Mixologist": [
        "mixologist", "head mixologist", "cocktail specialist", "beverage artisan",
        "flair bartender", "sommelier & mixologist",
    ],
    "Hotel Restaurant Staff": [
        "hotel restaurant staff", "restaurant staff", "bar staff", "banquet staff",
        "breakfast server", "room service waiter", "room service attendant",
    ],
    "Hospitality Assistant": [
        "hospitality assistant", "hospitality worker", "hospitality team member",
        "hospitality staff", "catering assistant", "lounge attendant",
    ],
    "Front Office Assistant": [
        "front office assistant", "front desk agent", "hotel receptionist",
        "guest relations agent", "concierge assistant", "night auditor",
    ],
    "Hotel Operations Staff": [
        "hotel operations staff", "hotel operations assistant", "resort operations staff",
        "guest services associate", "hotelgeneralist", "allrounder hospitality",
    ],
}

# Section 7: Sponsorship Verification Categories
SPONSORSHIP_CATEGORIES = {
    "A": "A. Verified sponsorship support",
    "B": "B. Employer explicitly states that international applicants or work-permit support may be considered",
    "C": "C. Potential sponsorship — requires direct employer confirmation",
    "D": "D. No sponsorship evidence",
    "E": "E. Not eligible or unsuitable for the candidate",
}

# Normalised (lowercase, separators as spaces) words that signal a careers page link.
CAREER_KEYWORDS = [
    "career", "careers", "jobs", "job", "vacancies", "vacancy", "work with us", "join us",
    "join our team", "join the team", "employment", "recruitment", "hiring", "work for us",
    "karriere", "stellenangebote", "stellen", "jobangebote", "arbeiten bei", "offene stellen",
    "lavora con noi", "lavoro", "offerte di lavoro", "carriere", "posizioni aperte",
    "trabaja con nosotros", "empleo", "trabajo", "ofertas de empleo", "carrière", "emplois",
    "recrutement", "offres d emploi", "nous rejoindre", "kariera", "praca", "oferty pracy",
    "rekrutacja", "posao", "karijera", "zaposlenje", "slobodna radna mjesta", "cariere",
    "joburi", "angajari", "kariéra", "práce", "volná místa", "karrier", "állás",
    "darbas", "karjeras", "töö", "работа", "кариери", "свободни позиции",
    "vacatures", "werken bij", "carreiras", "emprego", "trabalhe connosco", "karriär",
    "lediga jobb", "ledige stillinger", "rekrytering", "työpaikat", "θέσεις εργασίας",
    "καριέρα",
]

CONTACT_KEYWORDS = [
    "contact", "contact us", "kontakt", "impressum", "contatti", "contacto", "contactez",
    "kontakty", "kontakti", "contacte", "kapcsolat", "kontaktai", "επικοινωνία", "контакти",
]

ATS_DOMAINS = (
    "greenhouse.io", "lever.co", "workable.com", "personio.de", "personio.com", "recruitee.com",
    "teamtailor.com", "smartrecruiters.com", "bamboohr.com", "join.com", "jobs.ch",
    "hotelcareer.com", "hosco.com", "softgarden.io", "breezy.hr", "applytojob.com",
)

# Role words in many languages (matched as whole words, case-insensitive)
ROLE_WORDS = sorted({
    w for words in ROLE_SYNONYMS.values() for w in words
} | {
    "bartender", "barman", "barmaid", "barista", "waiter", "waitress", "bar staff",
    "restaurant staff", "food and beverage", "food & beverage", "f&b", "server",
    "head waiter", "restaurant server", "mixologist", "bar supervisor", "restaurant supervisor",
    "food and beverage assistant", "food and beverage supervisor", "hospitality assistant",
    "front office assistant", "hotel operations staff", "hotel restaurant staff",
    "kellner", "kellnerin", "barkeeper", "servicekraft", "servicemitarbeiter", "barmitarbeiter",
    "cameriere", "cameriera", "banconiere", "camarero", "camarera", "garçon",
    "serveur", "serveuse", "kelner", "kelnerka", "konobar", "konobarica", "šanker",
    "ospătar", "chelner", "čašník", "číšník", "servírka", "pincér", "pultos",
    "padavėjas", "bārmenis", "viesmīlis", "ettekandja", "сервитьор", "барман", "ober",
    "serveerster", "bediening", "empregado de mesa", "empregado de bar", "garçom",
    "σερβιτόρος", "σερβιτόρα", "μπάρμαν",
})

HIRING_WORDS = [
    "we are hiring", "we're hiring", "now hiring", "join our team", "open positions", "vacancy",
    "vacancies", "apply now", "apply", "job offer", "we are looking for", "we're looking for",
    "looking for", "stellenangebot", "wir suchen", "bewirb", "cerchiamo", "stiamo cercando",
    "buscamos", "nous recherchons", "poszukujemy", "tražimo", "traži se", "căutăm", "hledáme",
    "keresünk", "ищем", "търсим", "vagas", "recrutamento", "vacature", "wij zoeken",
]

# Category A: Verified / official sponsorship register or guaranteed permit issuance
VISA_VERIFIED_A = [
    "licensed sponsor", "a-rated sponsor", "certificate of sponsorship", "skilled worker visa sponsor",
    "accredited employer work visa", "aewv accredited", "approved standard business sponsor",
    "subclass 482 sponsor", "dama sponsor", "guaranteed work permit", "official visa sponsor",
    "identità single permit sponsor", "jobsplus approved sponsor", "ind recognized sponsor",
]

# Category B: Employer explicitly states international applicants or work-permit support considered
VISA_EXPLICIT = [
    "visa sponsorship", "sponsor visa", "visa support", "visa assistance", "we sponsor",
    "sponsorship available", "work permit", "work visa", "non eu", "non-eu", "third country",
    "third-country", "arbeitserlaubnis", "arbeitsvisum", "visum", "permis de travail",
    "permesso di lavoro", "permiso de trabajo", "dozvola za rad", "radna dozvola",
    "zezwolenie na pracę", "permis de muncă", "povolení k pobytu", "visto de trabalho",
    "werkvergunning", "twv", "gvva", "international applicants welcome", "overseas applicants",
]

# Category C: Potential sponsorship — relocation/accommodation/international signals, needs confirmation
VISA_IMPLICIT = [
    "relocation", "relocate", "accommodation", "housing", "staff housing", "international team",
    "international candidates", "unterkunft", "personalunterkunft", "logement", "alloggio",
    "alojamiento", "smještaj", "smjestaj", "zakwaterowanie", "cazare", "ubytování", "szállás",
    "alojamento", "huisvesting", "live-in", "live in accommodation",
]

# Category E: Explicitly ineligible
VISA_NEGATIVE = [
    "no sponsorship", "unable to sponsor", "cannot sponsor", "not able to sponsor",
    "eu citizens only", "eu/eea citizens only", "must have the right to work",
    "must already have the right to work", "must already hold a valid work permit",
    "only candidates with eu", "nur eu", "keine visa", "no visa support",
]

FEE_WORDS = [
    "registration fee", "processing fee", "application fee", "pay for visa", "western union",
    "moneygram", "send money", "deposit required", "visa fee payable", "agency fee", "pay a fee",
]

FREEMAIL = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.de", "yahoo.it", "hotmail.com",
    "outlook.com", "live.com", "icloud.com", "aol.com", "gmx.de", "gmx.net", "gmx.at",
    "web.de", "proton.me", "protonmail.com", "mail.ru", "yandex.com", "yandex.ru", "abv.bg",
    "wp.pl", "o2.pl", "seznam.cz", "t-online.de", "libero.it", "alice.it", "orange.fr",
    "wanadoo.fr", "free.fr", "sapo.pt", "hotmail.it", "hotmail.es", "hotmail.fr",
}

HR_LOCALS = {
    "hr", "jobs", "job", "career", "careers", "recruitment", "recruiting", "karriere",
    "bewerbung", "bewerbungen", "personal", "lavora", "lavoraconnoi", "rrhh", "empleo",
    "praca", "kadry", "posao", "karijera", "work", "hiring", "humanresources", "people",
    "talent", "recrutamento", "rh", "recrutement", "vacatures", "werkenbij",
}
GENERAL_LOCALS = {
    "info", "contact", "kontakt", "hello", "hallo", "office", "mail", "reception", "recepcija",
    "rezervacije", "reservations", "booking", "welcome", "hotel", "admin", "contacto", "contatti",
}


def map_canonical_professions(raw_roles: list[str] | str) -> list[str]:
    """Maps matched role keywords in any supported language to canonical hospitality professions."""
    if isinstance(raw_roles, str):
        tokens = [r.strip().lower() for r in raw_roles.split(",") if r.strip()]
    else:
        tokens = [str(r).strip().lower() for r in (raw_roles or []) if str(r).strip()]
    canonical: list[str] = []
    for token in tokens:
        matched_any = False
        for prof, syns in ROLE_SYNONYMS.items():
            if token == prof.lower() or token in syns or any(s in token for s in syns):
                if prof not in canonical:
                    canonical.append(prof)
                matched_any = True
        if not matched_any and token.title() not in canonical:
            canonical.append(token.title())
    return canonical
