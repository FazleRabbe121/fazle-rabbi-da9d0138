/**
 * Central Immigration & Country Priority Service (Master Instruction Section 5, 6, 7)
 * 
 * Strict Evidence-Based Intelligence for Global Visa Sponsorship Research
 * Focus: International Hospitality Recruitment for Bangladeshi Passport Holder
 * 
 * Priority Group 1 (Group A) — Highest Search Priority (Ranks 1–7):
 *   1. Poland (PL — Type A / Type S Voivodeship Work Permit, PUP labor test)
 *   2. Portugal (PT — Work Visa D1 / Seasonal Hospitality Visa, AIMA & IEFP)
 *   3. Croatia (HR — Dozvola za boravak i rad, MUP & HZZ tourism work permits)
 *   4. Netherlands (NL — Single Permit GVVA, IND & UWV labor market test)
 *   5. Malta (MT — Identità Single Permit + Mandatory ITS Tourism & Hospitality Skills Pass)
 *   6. Spain (ES — Autorización de residencia y trabajo por cuenta ajena / GECCO)
 *   7. Luxembourg (LU — Autorisation de séjour temporaire pour salarié de pays tiers, ADEM)
 * 
 * Priority Group 2 (Group B) — Important International Destinations (Ranks 8–11):
 *   8. United Kingdom — England (GB-ENG — UKVI Skilled Worker Visa, Licensed Sponsors in England)
 *   9. United Kingdom — Scotland (GB-SCT — UKVI Skilled Worker Visa, Licensed Highland & Resort Sponsors in Scotland)
 *   10. Australia (AU — Skills in Demand / TSS Subclass 482 & Regional Subclass 494 / DAMA)
 *   11. New Zealand (NZ — Accredited Employer Work Visa AEWV, Immigration New Zealand)
 * 
 * Priority Group 3 (Group C) — Additional European & EURES Coverage (Ranks 12–20):
 *   12. Italy, 13. Greece, 14. Belgium, 15. France, 16. Germany, 17. Ireland, 18. Austria, 19. Romania, 20. Slovenia
 */

export type PriorityGroup = 'A' | 'B' | 'C' | 'Custom';

export type SponsorshipViabilityRating =
  | 'High Seasonal Feasibility'
  | 'Moderate Quota-Dependent'
  | 'Low / Specialist Only'
  | 'Strict Labor Market Test';

export type SponsorshipEvidenceCategory = 'A' | 'B' | 'C' | 'D' | 'E';

export const SPONSORSHIP_EVIDENCE_CATEGORIES: Record<SponsorshipEvidenceCategory, string> = {
  A: 'A. Verified sponsorship support',
  B: 'B. Employer explicitly states that international applicants or work-permit support may be considered',
  C: 'C. Potential sponsorship — requires direct employer confirmation',
  D: 'D. No sponsorship evidence',
  E: 'E. Not eligible or unsuitable for the candidate',
};

export const HOSPITALITY_SPECIALIZATION_ROLES: string[] = [
  'Bartender',
  'Barista',
  'Waiter / Waitress',
  'Restaurant Server',
  'Head Waiter',
  'Food and Beverage Assistant',
  'Food and Beverage Supervisor',
  'Restaurant Supervisor',
  'Bar Supervisor',
  'Mixologist',
  'Hotel Restaurant Staff',
  'Hospitality Assistant',
  'Front Office Assistant',
  'Hotel Operations Staff',
];

export interface CountryImmigrationProfile {
  id: string;
  countryName: string;
  isoCode: string; // 2-letter uppercase ISO code or regional code (GB-ENG, GB-SCT)
  flag: string;
  group: PriorityGroup;
  searchPriority: number; // 1 to 100 (1 is highest priority)
  activeSearch: boolean;

  // Official Immigration Intelligence
  officialImmigrationAuthority: string;
  officialImmigrationUrl: string;
  primaryWorkVisaRoute: string;
  routeType:
    | 'Seasonal Quota'
    | 'Employer-Sponsored Single Permit'
    | 'Accredited Employer'
    | 'Skilled Worker Points'
    | 'General Employment Permit';
  seasonalQuotaRules?: string;
  skillsPassRequired?: boolean;
  skillsPassDetails?: string;
  bangladeshiEligibilityNotes: string;
  currentSalaryOrLaborRequirement: string;
  recruitmentFeasibilityRating: SponsorshipViabilityRating;
  researchDate: string; // YYYY-MM-DD

  // Specific country checks
  criticalChecks: string[];
}

export const OFFICIAL_COUNTRY_IMMIGRATION_PROFILES: CountryImmigrationProfile[] = [
  // =========================================================================
  // PRIORITY GROUP 1 (GROUP A) — HIGHEST SEARCH PRIORITY (Ranks 1–7)
  // 1. Poland, 2. Portugal, 3. Croatia, 4. Netherlands, 5. Malta, 6. Spain, 7. Luxembourg
  // =========================================================================
  {
    id: 'poland',
    countryName: 'Poland',
    isoCode: 'PL',
    flag: '🇵🇱',
    group: 'A',
    searchPriority: 1,
    activeSearch: true,
    officialImmigrationAuthority: 'Voivodeship Office (Urząd Wojewódzki) & Powiatowy Urząd Pracy (PUP)',
    officialImmigrationUrl: 'https://www.gov.pl/web/rodzina/zezwolenia-na-prace-cudzoziemcow',
    primaryWorkVisaRoute: 'Zezwolenie na pracę Typ A (Standard Work Permit) or Typ S (Seasonal Work Permit)',
    routeType: 'Employer-Sponsored Single Permit',
    seasonalQuotaRules: 'Employer applies to the regional Voivode for a Type A work permit (up to 3 years) or PUP for a Type S seasonal hospitality/accommodation permit (up to 9 months).',
    bangladeshiEligibilityNotes: 'Employer obtains Voivode work permit for Bangladeshi employee. Requires labor market test (Informacja starosty / test rynku pracy) unless exempted by regional shortage occupation rules.',
    currentSalaryOrLaborRequirement: 'Polish statutory minimum wage (PLN 4,300+ gross/month, approx. €1,000/mo) and comparable contract terms to local hospitality staff.',
    recruitmentFeasibilityRating: 'Moderate Quota-Dependent',
    researchDate: '2026-03-31',
    criticalChecks: [
      'PUP test rynku pracy (starostwo labor market test) clearance',
      'Voivodeship issuance timeline for Type A / Type S work permit',
      'Verify employer KRS/NIP registration and hotel/restaurant operation in Warsaw, Kraków, Gdańsk, or Wrocław',
      'National D-type work visa submission requirements',
    ],
  },
  {
    id: 'portugal',
    countryName: 'Portugal',
    isoCode: 'PT',
    flag: '🇵🇹',
    group: 'A',
    searchPriority: 2,
    activeSearch: true,
    officialImmigrationAuthority: 'Agência para a Integração, Migrações e Asilo (AIMA) & IEFP',
    officialImmigrationUrl: 'https://aima.gov.pt/pt/trabalho',
    primaryWorkVisaRoute: 'Visto D1 (Trabalho Subordinado) / Visto de Trabalho Sazonal (Art. 56)',
    routeType: 'Employer-Sponsored Single Permit',
    seasonalQuotaRules: 'Hospitality & tourism are priority seasonal and subordinate work sectors under Portuguese immigration law; requires employment contract or formal promise of employment contract.',
    bangladeshiEligibilityNotes: 'Bangladeshi passport holders can obtain D1 subordinate work visas or seasonal hospitality visas with a signed employment contract or promise of contract registered with IEFP.',
    currentSalaryOrLaborRequirement: 'Portuguese national minimum monthly wage (€820–€870+/month across 14 payments) or applicable Algarve/Lisbon/Porto hospitality collective agreement.',
    recruitmentFeasibilityRating: 'High Seasonal Feasibility',
    researchDate: '2026-03-31',
    criticalChecks: [
      'IEFP declaration confirming vacancy publication',
      'Signed employment contract or formal promise of work contract',
      'Social Security (NISS) & tax number (NIF) onboarding readiness',
      'AIMA residence permit appointment scheduled with D1 visa issuance',
    ],
  },
  {
    id: 'croatia',
    countryName: 'Croatia',
    isoCode: 'HR',
    flag: '🇭🇷',
    group: 'A',
    searchPriority: 3,
    activeSearch: true,
    officialImmigrationAuthority: 'Ministarstvo unutarnjih poslova (MUP) & HZZ (Croatian Employment Service)',
    officialImmigrationUrl: 'https://mup.gov.hr/aliens-281621/281621',
    primaryWorkVisaRoute: 'Dozvola za boravak i rad (Stay and Work Permit) — Year-Round & Seasonal Tourism',
    routeType: 'Employer-Sponsored Single Permit',
    seasonalQuotaRules: 'Croatia operates an employer-led MUP & HZZ work permit system with strong demand across Adriatic coastal resorts (Dubrovnik, Split, Rovinj, Poreč, Istria) and Zagreb.',
    bangladeshiEligibilityNotes: 'Bangladeshi passport holders are actively sponsored by major Croatian hotel groups (e.g., Valamar, Maistra). Requires apostilled police clearance and MUP stay/work permit approval.',
    currentSalaryOrLaborRequirement: 'Gross monthly salary meeting Croatian statutory hospitality minimums (€840–€1,250+ gross) plus employer-provided accommodation and hot meals at coastal resorts.',
    recruitmentFeasibilityRating: 'High Seasonal Feasibility',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Check HZZ labor market test or seasonal tourism exemption',
      'MUP police station work & residence permit processing (typically 30–45 days)',
      'Verify employer OIB and written staff accommodation provision',
      'Verify direct hotel/resort HR contact (avoid fee-charging intermediaries)',
    ],
  },
  {
    id: 'netherlands',
    countryName: 'Netherlands',
    isoCode: 'NL',
    flag: '🇳🇱',
    group: 'A',
    searchPriority: 4,
    activeSearch: true,
    officialImmigrationAuthority: 'Immigratie- en Naturalisatiedienst (IND) & Uitvoeringsinstituut Werknemersverzekeringen (UWV)',
    officialImmigrationUrl: 'https://ind.nl/en/residence-permits/work/single-permit-gvva',
    primaryWorkVisaRoute: 'Gecombineerde Vergunning voor Verblijf en Arbeid (GVVA / Single Permit)',
    routeType: 'Employer-Sponsored Single Permit',
    seasonalQuotaRules: 'Requires combined residence and work permit (GVVA) assessed by IND with mandatory labor market advice from UWV.',
    bangladeshiEligibilityNotes: 'UWV conducts a strict labor market test requiring the employer to advertise the vacancy across the Netherlands and EEA/EURES for at least 5 weeks before sponsoring a non-EU national.',
    currentSalaryOrLaborRequirement: 'Must meet Dutch statutory full-time minimum wage and Horeca CAO collective labor agreement (€2,134+/month gross minimum).',
    recruitmentFeasibilityRating: 'Strict Labor Market Test',
    researchDate: '2026-03-31',
    criticalChecks: [
      'UWV labor market test verification (5-week EEA/EURES advertising)',
      'Employer compliance with Dutch Horeca CAO wage tiers',
      'Check whether employer is an IND Recognized Sponsor (Erkend Referent)',
      'Direct confirmation of GVVA sponsorship willingness before formal application',
    ],
  },
  {
    id: 'malta',
    countryName: 'Malta',
    isoCode: 'MT',
    flag: '🇲🇹',
    group: 'A',
    searchPriority: 5,
    activeSearch: true,
    officialImmigrationAuthority: 'Identità & Jobsplus & Institute of Tourism Studies (ITS)',
    officialImmigrationUrl: 'https://identita.gov.mt/single-permit-overview/',
    primaryWorkVisaRoute: 'Identità Single Permit + Mandatory ITS Tourism & Hospitality Skills Pass',
    routeType: 'Employer-Sponsored Single Permit',
    seasonalQuotaRules: 'Year-round Single Permit processing through Identità Expatriates Unit with Jobsplus labor market verification and mandatory ITS Skills Pass.',
    skillsPassRequired: true,
    skillsPassDetails: 'Mandatory ITS Tourism & Hospitality Skills Pass required for all third-country nationals working in hotels, bars, and restaurants in Malta. Includes online English, hospitality service, and Maltese tourism assessments.',
    bangladeshiEligibilityNotes: 'High hospitality recruitment volume in St Julian\'s, Valletta, and Sliema. Candidate must pass the ITS Skills Pass Phase 1 online assessment prior to Single Permit submission.',
    currentSalaryOrLaborRequirement: 'Malta statutory minimum wage (€835+/month gross) or hotel group collective rate plus Jobsplus vacancy verification.',
    recruitmentFeasibilityRating: 'High Seasonal Feasibility',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Verify candidate readiness for mandatory ITS Hospitality Skills Pass',
      'Jobsplus vacancy declaration & employer good standing with Identità',
      'Identità Still Approval letter issuance prior to visa biometrics',
      'Confirm legitimate licensed hotel/restaurant group in Malta',
    ],
  },
  {
    id: 'spain',
    countryName: 'Spain',
    isoCode: 'ES',
    flag: '🇪🇸',
    group: 'A',
    searchPriority: 6,
    activeSearch: true,
    officialImmigrationAuthority: 'Ministerio de Inclusión, Seguridad Social y Migraciones & SEPE',
    officialImmigrationUrl: 'https://inclusion.seg-social.es/web/migraciones/autorizaciones-de-trabajo',
    primaryWorkVisaRoute: 'Autorización de residencia temporal y trabajo por cuenta ajena / Orden GECCO',
    routeType: 'Seasonal Quota',
    seasonalQuotaRules: 'Regulated via annual seasonal migration campaigns (Orden GECCO) or SEPE certificate of insufficiency of local jobseekers (Certificado de Insuficiencia).',
    bangladeshiEligibilityNotes: 'Requires Spanish employer to obtain initial work & residence authorization or seasonal GECCO allocation, followed by national visa issuance.',
    currentSalaryOrLaborRequirement: 'Salario Mínimo Interprofesional (SMI — €1,134/month in 14 payments) or provincial Convenio Colectivo de Hostelería (Mallorca, Ibiza, Barcelona, Madrid, Marbella).',
    recruitmentFeasibilityRating: 'Moderate Quota-Dependent',
    researchDate: '2026-03-31',
    criticalChecks: [
      'SEPE labor market clearance or Orden GECCO seasonal quota inclusion',
      'Provincial Convenio Colectivo de Hostelería salary compliance',
      'Seasonal accommodation availability in Balearic/Canary Islands or Costa del Sol',
      'Direct employer confirmation of non-EU work permit sponsorship',
    ],
  },
  {
    id: 'luxembourg',
    countryName: 'Luxembourg',
    isoCode: 'LU',
    flag: '🇱🇺',
    group: 'A',
    searchPriority: 7,
    activeSearch: true,
    officialImmigrationAuthority: 'Direction de l\'immigration (Ministère des Affaires intérieures) & ADEM',
    officialImmigrationUrl: 'https://guichet.public.lu/en/citoyens/immigration/plus-3-mois/ressortissant-tiers/salarie/salarie-pays-tiers.html',
    primaryWorkVisaRoute: 'Autorisation de séjour temporaire pour salarié de pays tiers (ADEM Certificate)',
    routeType: 'Employer-Sponsored Single Permit',
    seasonalQuotaRules: 'Employer must declare the vacant hospitality role to ADEM (Agence pour le développement de l\'emploi). If no suitable EU/local candidate is referred within 3 weeks, the employer can request an ADEM certificate to hire a third-country national.',
    bangladeshiEligibilityNotes: 'Eligible once the Luxembourg employer obtains the ADEM certificate confirming labor market test completion and signs a compliant employment contract.',
    currentSalaryOrLaborRequirement: 'Luxembourg Social Minimum Wage (Salaire social minimum — €2,570.93/month gross for unskilled or €3,085.11/month gross for qualified staff).',
    recruitmentFeasibilityRating: 'Strict Labor Market Test',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Mandatory ADEM vacancy declaration & 3-week labor market test certificate',
      'Temporary authorization to stay (Autorisation de séjour temporaire) approved before entry',
      'English/French language capability for luxury hotel & restaurant venues in Luxembourg City',
      'Compliance with Luxembourg qualified/unqualified minimum wage thresholds',
    ],
  },

  // =========================================================================
  // PRIORITY GROUP 2 (GROUP B) — IMPORTANT INTERNATIONAL DESTINATIONS (Ranks 8–11)
  // 8. UK — England, 9. UK — Scotland, 10. Australia, 11. New Zealand
  // =========================================================================
  {
    id: 'uk_england',
    countryName: 'United Kingdom — England',
    isoCode: 'GB-ENG',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    group: 'B',
    searchPriority: 8,
    activeSearch: true,
    officialImmigrationAuthority: 'UK Visas and Immigration (UKVI — Home Office Register of Licensed Sponsors)',
    officialImmigrationUrl: 'https://www.gov.uk/skilled-worker-visa',
    primaryWorkVisaRoute: 'UK Skilled Worker Visa (England — Licensed A-Rated Hospitality Sponsors)',
    routeType: 'Skilled Worker Points',
    bangladeshiEligibilityNotes: 'England and Scotland operate under the UK Home Office immigration framework. Entry-level bartender/waiter roles (SOC 9264/9263) are not eligible for Skilled Worker sponsorship; prioritize licensed sponsors in London, Manchester, Bath, and Oxford recruiting Bar Supervisors, Restaurant Supervisors, Head Waiters, or F&B Managers under eligible SOC codes.',
    currentSalaryOrLaborRequirement: 'UK Skilled Worker general threshold (£38,700/year or going rate for eligible SOC code; £30,960 where new-entrant/discount rules apply).',
    recruitmentFeasibilityRating: 'Low / Specialist Only',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Verify employer holds an active A-Rated Skilled Worker Licence on the UK Home Office Register (England)',
      'Target supervisory/management hospitality classifications (Restaurant Supervisor, Bar Supervisor, F&B Supervisor)',
      'Verify Certificate of Sponsorship (CoS) allocation and salary threshold compliance',
      'UKVI approved English language test (IELTS for UKVI B1 minimum)',
    ],
  },
  {
    id: 'uk_scotland',
    countryName: 'United Kingdom — Scotland',
    isoCode: 'GB-SCT',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    group: 'B',
    searchPriority: 9,
    activeSearch: true,
    officialImmigrationAuthority: 'UK Visas and Immigration (UKVI — Scottish Hospitality & Highland Resort Sponsors)',
    officialImmigrationUrl: 'https://www.gov.uk/skilled-worker-visa',
    primaryWorkVisaRoute: 'UK Skilled Worker Visa (Scotland — Licensed Hospitality & Resort Sponsors)',
    routeType: 'Skilled Worker Points',
    bangladeshiEligibilityNotes: 'Represented as a separate searchable region under the UK immigration framework. Luxury Scottish Highland estates, Edinburgh, Glasgow, and St Andrews hotel groups frequently hold UKVI Sponsor Licences and provide live-in staff accommodation for eligible supervisory/skilled F&B roles.',
    currentSalaryOrLaborRequirement: 'UK Skilled Worker statutory salary threshold and eligible occupation SOC code requirements apply across Scotland.',
    recruitmentFeasibilityRating: 'Low / Specialist Only',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Verify Scottish hotel/resort holds active UK Home Office A-Rated Sponsor Licence',
      'Prioritize Bar Supervisor, Restaurant Supervisor, Head Waiter, and Senior Mixologist roles',
      'Check live-in staff accommodation availability in Highland/resort properties',
      'Confirm Certificate of Sponsorship (CoS) issuance before visa application',
    ],
  },
  {
    id: 'australia',
    countryName: 'Australia',
    isoCode: 'AU',
    flag: '🇦🇺',
    group: 'B',
    searchPriority: 10,
    activeSearch: true,
    officialImmigrationAuthority: 'Australian Department of Home Affairs',
    officialImmigrationUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-skill-shortage-482',
    primaryWorkVisaRoute: 'Skills in Demand / TSS Subclass 482 & Regional Subclass 494 / DAMA Concessions',
    routeType: 'Employer-Sponsored Single Permit',
    bangladeshiEligibilityNotes: 'Investigate Approved Standard Business Sponsors (SBS) in Sydney, Melbourne, Brisbane, and regional DAMA areas (Northern Territory, South Australia, Western Australia, Far North Queensland) where Café/Restaurant Supervisors, Bar Supervisors, and Hospitality Staff qualify under occupation lists or DAMA concessions.',
    currentSalaryOrLaborRequirement: 'Temporary Skilled Migration Income Threshold (TSMIT — AUD $73,150 + superannuation, or applicable regional DAMA TSMIT concession).',
    recruitmentFeasibilityRating: 'Low / Specialist Only',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Confirm employer is an Approved Standard Business Sponsor (SBS) or party to a Regional DAMA',
      'Prioritize Restaurant Supervisor / Cafe Manager (ANZSCO 141111) or regional DAMA hospitality concessions',
      'Verify minimum full-time experience and skills assessment requirements',
      'Ensure salary package meets TSMIT (AUD $73,150) or approved DAMA concession',
    ],
  },
  {
    id: 'new_zealand',
    countryName: 'New Zealand',
    isoCode: 'NZ',
    flag: '🇳🇿',
    group: 'B',
    searchPriority: 11,
    activeSearch: true,
    officialImmigrationAuthority: 'Immigration New Zealand (INZ — MBIE)',
    officialImmigrationUrl: 'https://www.immigration.govt.nz/new-zealand-visas/visas/visa/accredited-employer-work-visa',
    primaryWorkVisaRoute: 'Accredited Employer Work Visa (AEWV)',
    routeType: 'Accredited Employer',
    seasonalQuotaRules: 'Employer must hold active INZ Accreditation and an approved Job Check before inviting a candidate to apply for an AEWV.',
    bangladeshiEligibilityNotes: 'Bangladeshi passport holders are eligible where the New Zealand hospitality employer holds INZ Accreditation, completes the local Work and Income / labor market advertising requirements, and issues a valid Job Check token.',
    currentSalaryOrLaborRequirement: 'Must meet INZ AEWV median wage threshold (NZD $29.66+/hr) and minimum 30 hours/week guaranteed contract, plus English language requirement for ANZSCO Skill Level 4/5 roles.',
    recruitmentFeasibilityRating: 'Moderate Quota-Dependent',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Verify employer appears on the official INZ Accredited Employer list',
      'Confirm approved INZ Job Check token for the hospitality vacancy',
      'Check ANZSCO skill level and mandatory IELTS/PTE English threshold for Level 4/5 roles',
      'Ensure contract guarantees at least 30 hours per week at or above AEWV wage rate',
    ],
  },

  // =========================================================================
  // PRIORITY GROUP 3 (GROUP C) — ADDITIONAL EUROPEAN & EURES MARKETS (Ranks 12–20)
  // =========================================================================
  {
    id: 'italy',
    countryName: 'Italy',
    isoCode: 'IT',
    flag: '🇮🇹',
    group: 'C',
    searchPriority: 12,
    activeSearch: true,
    officialImmigrationAuthority: 'Ministero dell\'Interno & Ministero del Lavoro e delle Politiche Sociali',
    officialImmigrationUrl: 'https://www.interno.gov.it/it/temi/immigrazione-e-asilo/decreto-flussi',
    primaryWorkVisaRoute: 'Decreto Flussi — Lavoro Stagionale nel Settore Turistico-Alberghiero',
    routeType: 'Seasonal Quota',
    seasonalQuotaRules: 'Triennial quota decree (Decreto Flussi) with dedicated allocations for tourism and hospitality on designated click days.',
    bangladeshiEligibilityNotes: 'Eligible under Decreto Flussi seasonal and subordinate work quotas when Italian hospitality employer submits Nulla Osta clearance.',
    currentSalaryOrLaborRequirement: 'CCNL Turismo collective bargaining minimum wage and accommodation declaration.',
    recruitmentFeasibilityRating: 'High Seasonal Feasibility',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Decreto Flussi annual quota publication & click-day calendar',
      'Verify employer registered with Sportello Unico per l\'Immigrazione',
    ],
  },
  {
    id: 'greece',
    countryName: 'Greece',
    isoCode: 'GR',
    flag: '🇬🇷',
    group: 'C',
    searchPriority: 13,
    activeSearch: true,
    officialImmigrationAuthority: 'Ministry of Migration and Asylum',
    officialImmigrationUrl: 'https://migration.gov.gr/en/gas/metanastefsi/',
    primaryWorkVisaRoute: 'Seasonal Employment (Metaklisi) under Law 5038/2023',
    routeType: 'Seasonal Quota',
    bangladeshiEligibilityNotes: 'Eligible via employer-initiated Metaklisi approval across Greek island and mainland resorts.',
    currentSalaryOrLaborRequirement: 'Greek National Collective Agreement for Tourism and Hotel Employees + accommodation.',
    recruitmentFeasibilityRating: 'High Seasonal Feasibility',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Regional KYA quota allocation for hotel/bar staff',
      'Decentralized Administration Metaklisi approval',
    ],
  },
  {
    id: 'belgium',
    countryName: 'Belgium',
    isoCode: 'BE',
    flag: '🇧🇪',
    group: 'C',
    searchPriority: 14,
    activeSearch: true,
    officialImmigrationAuthority: 'Regional Migration Authorities & Federal Immigration Office',
    officialImmigrationUrl: 'https://dofi.ibz.be/en/themes/third-country-nationals/work',
    primaryWorkVisaRoute: 'Single Permit (Autorisation Unique / Gecombineerde Vergunning)',
    routeType: 'Employer-Sponsored Single Permit',
    bangladeshiEligibilityNotes: 'Requires regional labor market authorization in Flanders, Wallonia, or Brussels.',
    currentSalaryOrLaborRequirement: 'Regional minimum gross income thresholds and collective Horeca wage scales.',
    recruitmentFeasibilityRating: 'Strict Labor Market Test',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Regional employment agency authorization (VDAB, Actiris, Forem)',
    ],
  },
  {
    id: 'france',
    countryName: 'France',
    isoCode: 'FR',
    flag: '🇫🇷',
    group: 'C',
    searchPriority: 15,
    activeSearch: true,
    officialImmigrationAuthority: 'Ministère de l\'Intérieur & France-Visas',
    officialImmigrationUrl: 'https://administration-etrangers-en-france.interieur.gouv.fr/',
    primaryWorkVisaRoute: 'Titre de séjour Travailleur Temporaire / Saisonnier',
    routeType: 'Seasonal Quota',
    bangladeshiEligibilityNotes: 'Employer applies for online work authorization (autorisation de travail) after France Travail publication.',
    currentSalaryOrLaborRequirement: 'SMIC or HCR collective agreement wage scale.',
    recruitmentFeasibilityRating: 'Moderate Quota-Dependent',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Online MOE work authorization approval',
    ],
  },
  {
    id: 'germany',
    countryName: 'Germany',
    isoCode: 'DE',
    flag: '🇩🇪',
    group: 'C',
    searchPriority: 16,
    activeSearch: true,
    officialImmigrationAuthority: 'Bundesagentur für Arbeit (BA) & Auswärtiges Amt',
    officialImmigrationUrl: 'https://www.make-it-in-germany.com/en/visa-residence/types/work-qualified-professionals',
    primaryWorkVisaRoute: 'Fachkräfteeinwanderungsgesetz (Skilled Immigration Act)',
    routeType: 'Skilled Worker Points',
    bangladeshiEligibilityNotes: 'Requires recognized vocational qualification or Federal Employment Agency approval.',
    currentSalaryOrLaborRequirement: 'DEHOGA hospitality collective wage agreement.',
    recruitmentFeasibilityRating: 'Strict Labor Market Test',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Federal Employment Agency (BA) approval',
    ],
  },
  {
    id: 'ireland',
    countryName: 'Ireland',
    isoCode: 'IE',
    flag: '🇮🇪',
    group: 'C',
    searchPriority: 17,
    activeSearch: true,
    officialImmigrationAuthority: 'Department of Enterprise, Trade and Employment (DETE)',
    officialImmigrationUrl: 'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/',
    primaryWorkVisaRoute: 'General Employment Permit (GEP)',
    routeType: 'General Employment Permit',
    bangladeshiEligibilityNotes: 'Check DETE Ineligible List of Occupations; only eligible management/culinary roles qualify.',
    currentSalaryOrLaborRequirement: 'Minimum salary threshold €34,000+ and 28-day Labor Market Needs Test.',
    recruitmentFeasibilityRating: 'Low / Specialist Only',
    researchDate: '2026-03-31',
    criticalChecks: [
      'Check DETE Ineligible List of Occupations',
    ],
  },
  {
    id: 'austria',
    countryName: 'Austria',
    isoCode: 'AT',
    flag: '🇦🇹',
    group: 'C',
    searchPriority: 18,
    activeSearch: true,
    officialImmigrationAuthority: 'Arbeitsmarktservice Österreich (AMS) & BMI',
    officialImmigrationUrl: 'https://www.migration.gv.at/en/types-of-immigration/permanent-immigration/seasonal-workers/',
    primaryWorkVisaRoute: 'Saisonarbeitskräfte (Seasonal Workers in Tourism under § 5 AuslBG)',
    routeType: 'Seasonal Quota',
    bangladeshiEligibilityNotes: 'Seasonal tourism quota permits issued via AMS Sicherungsbescheinigung.',
    currentSalaryOrLaborRequirement: 'Austrian Hotel & Gastgewerbe Kollektivvertrag wages.',
    recruitmentFeasibilityRating: 'Moderate Quota-Dependent',
    researchDate: '2026-03-31',
    criticalChecks: [
      'AMS seasonal contingent quota confirmation',
    ],
  },
  {
    id: 'romania',
    countryName: 'Romania',
    isoCode: 'RO',
    flag: '🇷🇴',
    group: 'C',
    searchPriority: 19,
    activeSearch: true,
    officialImmigrationAuthority: 'Inspectoratul General pentru Imigrări (IGI)',
    officialImmigrationUrl: 'https://igi.mai.gov.ro/en/category/servicii/cetateni-non-ue/angajare-in-munca/',
    primaryWorkVisaRoute: 'Aviz de Angajare (Non-EU Employment Contingent)',
    routeType: 'Seasonal Quota',
    bangladeshiEligibilityNotes: 'Active annual non-EU work permit contingent for hospitality and service roles.',
    currentSalaryOrLaborRequirement: 'Romanian statutory minimum wage + accommodation.',
    recruitmentFeasibilityRating: 'High Seasonal Feasibility',
    researchDate: '2026-03-31',
    criticalChecks: [
      'IGI Aviz de Angajare contingent quota availability',
    ],
  },
  {
    id: 'slovenia',
    countryName: 'Slovenia',
    isoCode: 'SI',
    flag: '🇸🇮',
    group: 'C',
    searchPriority: 20,
    activeSearch: true,
    officialImmigrationAuthority: 'Zavod Republike Slovenije za zaposlovanje (ZRSZ) & Upravna Enota',
    officialImmigrationUrl: 'https://www.ess.gov.si/en/employers/employment-of-foreigners/',
    primaryWorkVisaRoute: 'Enotno dovoljenje za prebivanje in delo (Single Permit)',
    routeType: 'Employer-Sponsored Single Permit',
    bangladeshiEligibilityNotes: 'ZRSZ performs labor market test; shortages in coastal and Alpine resort hospitality allow single permits.',
    currentSalaryOrLaborRequirement: 'Slovenian statutory minimum wage (€1,253.90 gross/month).',
    recruitmentFeasibilityRating: 'Moderate Quota-Dependent',
    researchDate: '2026-03-31',
    criticalChecks: [
      'ZRSZ labor market check consent',
    ],
  },
];

const STORAGE_KEY_COUNTRY_PROFILES = 'ccd_country_immigration_profiles_v2';

export function loadCountryProfiles(): CountryImmigrationProfile[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_COUNTRY_PROFILES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse country profiles from storage, returning defaults:', e);
  }
  return [...OFFICIAL_COUNTRY_IMMIGRATION_PROFILES];
}

export function saveCountryProfiles(profiles: CountryImmigrationProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_COUNTRY_PROFILES, JSON.stringify(profiles));
  } catch (e) {
    console.error('Failed to save country profiles:', e);
  }
}

export function updateCountryProfile(
  id: string,
  updates: Partial<CountryImmigrationProfile>
): CountryImmigrationProfile[] {
  const current = loadCountryProfiles();
  const next = current.map((item) => (item.id === id ? { ...item, ...updates } : item));
  saveCountryProfiles(next);
  return next;
}

export function getCountryProfileById(id: string): CountryImmigrationProfile | undefined {
  const all = loadCountryProfiles();
  const norm = (id || '').toLowerCase().trim();
  if (norm === 'uk' || norm === 'gb' || norm === 'united kingdom' || norm === 'england') {
    return all.find((c) => c.id === 'uk_england' || c.isoCode === 'GB-ENG');
  }
  if (norm === 'scotland' || norm === 'gb-sct') {
    return all.find((c) => c.id === 'uk_scotland' || c.isoCode === 'GB-SCT');
  }
  return all.find(
    (c) =>
      c.id === norm ||
      c.isoCode.toLowerCase() === norm ||
      c.countryName.toLowerCase() === norm ||
      c.countryName.toLowerCase().includes(norm)
  );
}
