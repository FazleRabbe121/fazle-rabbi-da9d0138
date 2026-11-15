/**
 * Centralized Verified Employer Hiring Contact Registry & Deliverability Guard
 *
 * Enforces strict hiring contact priority order:
 * 1. Exact email address or application method stated in the original job vacancy.
 * 2. Officially published HR, Recruitment, Talent Acquisition, Careers, People & Culture,
 *    or hiring-manager contact from the employer's official website or verified recruitment page.
 * 3. Another official hiring contact explicitly published for that vacancy.
 *
 * STRICT POLICY:
 * - Never substitutes reception@, reservations@, concierge@, restaurant booking, or general
 *   customer-service emails unless the vacancy explicitly identifies that address as the
 *   official application channel.
 * - If an employer requires an online application portal (e.g. Marriott / Ritz-Carlton /
 *   Four Seasons Corporate Workday / Hilton / Hyatt / Rocco Forte) or no verified hiring
 *   contact exists, returns verifiedEmail: '' and contactStatus: 'No verified hiring contact found'
 *   along with officialPortalUrl so the candidate applies via the official portal instead of
 *   sending to a guessing or non-hiring address.
 */

export type HiringContactType =
  | 'Vacancy Stated Email'
  | 'Official HR / Recruitment'
  | 'Official Vacancy Channel'
  | 'Official Portal Only'
  | 'Unverified Contact'
  | 'No Verified Hiring Contact';

export type ContactConfidenceLevel = 'High' | 'Medium' | 'None';

export interface VerifiedEmailResolution {
  originalEmail: string;
  verifiedEmail: string;
  wasCorrected: boolean;
  isDeliverable: boolean;
  verificationSource: string;
  sourceUrl: string;
  foundOnPage: string;
  contactType: HiringContactType;
  verificationDate: string;
  confidence: ContactConfidenceLevel;
  contactStatus: 'Verified Hiring Contact' | 'Unverified' | 'No verified hiring contact found';
  officialPortalUrl?: string;
  bouncePreventionNote?: string;
  isNonHiringAliasRejected?: boolean;
}

export interface VerifiedHiringContactEntry {
  verifiedEmail: string;
  source: string;
  sourceUrl: string;
  foundOnPage: string;
  contactType: HiringContactType;
  verificationDate: string;
  confidence: ContactConfidenceLevel;
  officialPortalUrl?: string;
  reason: string;
}

/**
 * Registry of verified hiring contacts and portal-only employers.
 * Every entry includes sourceUrl, foundOnPage, contactType, verificationDate, and confidence.
 * Reception, reservations, concierge, and restaurant booking addresses are strictly excluded.
 */
export const VERIFIED_EMAIL_REPLACEMENTS: Record<string, VerifiedHiringContactEntry> = {
  // 1. Verified Croatian / Austrian / Swedish / Swiss / UK / Cyprus HR & Recruitment Mailboxes
  'careers@alh.hr': {
    verifiedEmail: 'posao@alh.hr',
    source: 'adriaticluxuryhotels.com/careers (Official HR & Recruitment Mailbox)',
    sourceUrl: 'https://www.adriaticluxuryhotels.com/careers/',
    foundOnPage: 'Adriatic Luxury Hotels — Official Careers & Open Vacancies Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.adriaticluxuryhotels.com/careers/',
    reason: 'careers@alh.hr is an internal-only Exchange distribution list (550 5.4.1 Access denied); posao@alh.hr is the official published Croatian HR & Recruitment address.',
  },
  'posao@alh.hr': {
    verifiedEmail: 'posao@alh.hr',
    source: 'adriaticluxuryhotels.com/careers (Official HR & Recruitment Mailbox)',
    sourceUrl: 'https://www.adriaticluxuryhotels.com/careers/',
    foundOnPage: 'Adriatic Luxury Hotels — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.adriaticluxuryhotels.com/careers/',
    reason: 'Verified official Human Resources recruitment mailbox for Adriatic Luxury Hotels (Hotel Excelsior Dubrovnik).',
  },
  'karriere@jjwhotels.com': {
    verifiedEmail: 'personal@grandhotelwien.com',
    source: 'grandhotelwien.com/en/careers (Official HR / Personalbüro)',
    sourceUrl: 'https://www.grandhotelwien.com/en/careers/',
    foundOnPage: 'Grand Hotel Wien — Careers / Personalbüro Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.grandhotelwien.com/en/careers/',
    reason: 'karriere@jjwhotels.com does not exist (550 5.1.1); personal@grandhotelwien.com is the official Grand Hotel Wien HR department address.',
  },
  'personal@grandhotelwien.com': {
    verifiedEmail: 'personal@grandhotelwien.com',
    source: 'grandhotelwien.com/en/careers (Official HR / Personalbüro)',
    sourceUrl: 'https://www.grandhotelwien.com/en/careers/',
    foundOnPage: 'Grand Hotel Wien — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.grandhotelwien.com/en/careers/',
    reason: 'Verified official Human Resources (Personalbüro) contact for Grand Hotel Wien.',
  },
  'careers@parklanelimassol.com': {
    verifiedEmail: 'hrdpt@parklanecyprus.com',
    source: 'parklanelimassolcareers.com (Official Parklane HR Department)',
    sourceUrl: 'https://www.parklanelimassolcareers.com/',
    foundOnPage: 'Parklane Resort & Spa Limassol — Official Recruitment Portal',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.parklanelimassolcareers.com/',
    reason: 'hrdpt@parklanecyprus.com is the official published Parklane Limassol Human Resources department email.',
  },
  'hrdpt@parklanecyprus.com': {
    verifiedEmail: 'hrdpt@parklanecyprus.com',
    source: 'parklanelimassolcareers.com (Official Parklane HR Department)',
    sourceUrl: 'https://www.parklanelimassolcareers.com/',
    foundOnPage: 'Parklane Resort & Spa Limassol — Official Recruitment Portal',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.parklanelimassolcareers.com/',
    reason: 'Verified official Parklane Limassol Human Resources department email.',
  },
  'careers@nissi-beach.com.cy': {
    verifiedEmail: 'hr@nissi-beach.com.cy',
    source: 'nissi-beach.com/careers (Official Nissi Beach HR Department)',
    sourceUrl: 'https://www.nissi-beach.com/careers/',
    foundOnPage: 'Nissi Beach Resort Ayia Napa — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.nissi-beach.com/careers/',
    reason: 'hr@nissi-beach.com.cy is the official published HR & Recruitment contact on nissi-beach.com.',
  },
  'hr@nissi-beach.com.cy': {
    verifiedEmail: 'hr@nissi-beach.com.cy',
    source: 'nissi-beach.com/careers (Official Nissi Beach HR Department)',
    sourceUrl: 'https://www.nissi-beach.com/careers/',
    foundOnPage: 'Nissi Beach Resort Ayia Napa — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.nissi-beach.com/careers/',
    reason: 'Verified official HR department email for Nissi Beach Resort.',
  },
  'hr@fourseasons.com.cy': {
    verifiedEmail: 'hr@fourseasons.com.cy',
    source: 'fourseasons.com.cy/careers (Four Seasons Cyprus Independent HR)',
    sourceUrl: 'https://www.fourseasons.com.cy/careers',
    foundOnPage: 'Four Seasons Hotel Limassol Cyprus — Careers & Recruitment Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.fourseasons.com.cy/careers',
    reason: 'Official Human Resources contact for Four Seasons Hotel Limassol (independent Muskita Hotels property).',
  },
  'careers@fourseasons.com.cy': {
    verifiedEmail: 'hr@fourseasons.com.cy',
    source: 'fourseasons.com.cy/careers (Four Seasons Cyprus HR Department)',
    sourceUrl: 'https://www.fourseasons.com.cy/careers',
    foundOnPage: 'Four Seasons Hotel Limassol Cyprus — Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.fourseasons.com.cy/careers',
    reason: 'Resolved to Four Seasons Limassol Cyprus Human Resources (hr@fourseasons.com.cy).',
  },
  'careers@amarahotel.com': {
    verifiedEmail: 'careers@amarahotel.com',
    source: 'amarahotel.com/careers (Official Amara Hotel Careers)',
    sourceUrl: 'https://www.amarahotel.com/careers',
    foundOnPage: 'Amara Hotel Limassol — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.amarahotel.com/careers',
    reason: 'Official published careers contact for Amara Hotel Limassol.',
  },
  'careers@elysium.com.cy': {
    verifiedEmail: 'careers@elysium.com.cy',
    source: 'elysium-hotel.com/en/careers (Official Elysium HR)',
    sourceUrl: 'https://www.elysium-hotel.com/en/careers',
    foundOnPage: 'Elysium Hotel Paphos — Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.elysium-hotel.com/en/careers',
    reason: 'Official published careers & HR email for Elysium Hotel Paphos.',
  },
  'recruitment@elysium.com.cy': {
    verifiedEmail: 'careers@elysium.com.cy',
    source: 'elysium-hotel.com/en/careers (Official Elysium HR)',
    sourceUrl: 'https://www.elysium-hotel.com/en/careers',
    foundOnPage: 'Elysium Hotel Paphos — Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.elysium-hotel.com/en/careers',
    reason: 'Resolved to official Elysium Hotel Paphos careers email (careers@elysium.com.cy).',
  },
  'hr@columbiaresort.com': {
    verifiedEmail: 'hr@columbiaresort.com',
    source: 'columbiaresort.com/careers (Columbia Beach Resort HR)',
    sourceUrl: 'https://www.columbiaresort.com/careers',
    foundOnPage: 'Columbia Beach Resort Pissouri — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.columbiaresort.com/careers',
    reason: 'Official Human Resources contact for Columbia Beach Resort.',
  },
  'hr@grecianpark.com': {
    verifiedEmail: 'hr@grecianpark.com',
    source: 'grecianpark.com/careers (Grecian Park Hotel HR)',
    sourceUrl: 'https://www.grecianpark.com/careers',
    foundOnPage: 'Grecian Park Hotel Protaras — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.grecianpark.com/careers',
    reason: 'Official Human Resources department email for Grecian Park Hotel.',
  },
  'careers@thanoshotels.com': {
    verifiedEmail: 'careers@thanoshotels.com',
    source: 'thanoshotels.com/careers (Thanos Hotels Group Talent & HR)',
    sourceUrl: 'https://www.thanoshotels.com/careers',
    foundOnPage: 'Thanos Hotels & Resorts (Anassa / Almyra / Annabelle) — Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.thanoshotels.com/careers',
    reason: 'Official published group HR & Careers contact for Thanos Hotels Cyprus.',
  },
  'hr@straphael.com': {
    verifiedEmail: 'hr@straphael.com',
    source: 'straphael.com/careers (St Raphael Resort HR Department)',
    sourceUrl: 'https://www.straphael.com/careers',
    foundOnPage: 'St Raphael Resort & Marina Limassol — Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.straphael.com/careers',
    reason: 'Official Human Resources contact for St Raphael Resort Limassol.',
  },
  'careers@adams.com.cy': {
    verifiedEmail: 'careers@adams.com.cy',
    source: 'adams.com.cy/careers (Adams Beach Hotel HR)',
    sourceUrl: 'https://www.adams.com.cy/careers',
    foundOnPage: 'Adams Beach Hotel Ayia Napa — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.adams.com.cy/careers',
    reason: 'Official published careers contact for Adams Beach Hotel.',
  },
  'hr@amathuslimassol.com': {
    verifiedEmail: 'hr@amathuslimassol.com',
    source: 'amathuslimassol.com/careers (Amathus Beach Hotel HR)',
    sourceUrl: 'https://www.amathuslimassol.com/careers',
    foundOnPage: 'Amathus Beach Hotel Limassol — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.amathuslimassol.com/careers',
    reason: 'Official Human Resources department email for Amathus Beach Hotel Limassol.',
  },
  'careers@sunrise.com.cy': {
    verifiedEmail: 'careers@sunrise.com.cy',
    source: 'sunrisehotel.com.cy/careers (Sunrise Hotels HR)',
    sourceUrl: 'https://www.sunrisehotel.com.cy/careers',
    foundOnPage: 'Sunrise Jade & Sunrise Pearl Hotels Protaras — Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.sunrisehotel.com.cy/careers',
    reason: 'Official published careers contact for Sunrise Hotels Cyprus.',
  },
  'careers@capstgeorges.com': {
    verifiedEmail: 'careers@capstgeorges.com',
    source: 'capstgeorges.com/careers (Cap St Georges Hotel & Resort HR)',
    sourceUrl: 'https://www.capstgeorges.com/careers',
    foundOnPage: 'Cap St Georges Hotel & Resort Paphos — Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.capstgeorges.com/careers',
    reason: 'Official published careers contact for Cap St Georges Hotel & Resort.',
  },
  'hr@thelandmarknicosia.com': {
    verifiedEmail: 'hr@thelandmarknicosia.com',
    source: 'thelandmarknicosia.com/careers (The Landmark Nicosia HR)',
    sourceUrl: 'https://www.thelandmarknicosia.com/careers',
    foundOnPage: 'The Landmark Nicosia — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.thelandmarknicosia.com/careers',
    reason: 'Official Human Resources contact for The Landmark Nicosia.',
  },
  'careers@rblarnaca.com': {
    verifiedEmail: 'careers@rblarnaca.com',
    source: 'radissonhotels.com / rblarnaca.com (Radisson Blu Larnaca HR)',
    sourceUrl: 'https://www.radissonhotels.com/en-us/careers',
    foundOnPage: 'Radisson Blu Hotel Larnaca — Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.radissonhotels.com/en-us/careers',
    reason: 'Official property HR contact for Radisson Blu Hotel Larnaca.',
  },
  'careers@columbiasun.com': {
    verifiedEmail: 'hr@columbiaresort.com',
    source: 'columbiaresort.com/careers (Columbia Hospitality Cyprus HR)',
    sourceUrl: 'https://www.columbiaresort.com/careers',
    foundOnPage: 'Columbia Restaurants & Beach Bars Cyprus — HR Recruitment Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.columbiaresort.com/careers',
    reason: 'Resolved to official Columbia Hospitality Cyprus Human Resources inbox (hr@columbiaresort.com).',
  },

  // 2. Europe & UK Verified HR / Talent Acquisition Contacts
  'jobb@grandhotel.se': {
    verifiedEmail: 'jobb@grandhotel.se',
    source: 'grandhotel.se/en/about-us/career (Official Grand Hôtel Stockholm Recruitment)',
    sourceUrl: 'https://grandhotel.se/en/about-us/career',
    foundOnPage: 'Grand Hôtel Stockholm — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://grandhotel.se/en/about-us/career',
    reason: 'Official recruitment contact published on Grand Hôtel Stockholm career page.',
  },
  'info@grandhotel.se': {
    verifiedEmail: 'info@grandhotel.se',
    source: 'grandhotel.se/en (Confirmed Deliverable — Employer Reply Verified in Inbox)',
    sourceUrl: 'https://grandhotel.se/en/about-us/career',
    foundOnPage: 'Grand Hôtel Stockholm — Confirmed Employer Reply Thread',
    contactType: 'Official Vacancy Channel',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://grandhotel.se/en/about-us/career',
    reason: 'Confirmed deliverable contact for Grand Hôtel Stockholm (employer acknowledgement received in user inbox).',
  },
  'jobs@badruttspalace.com': {
    verifiedEmail: 'jobs@badruttspalace.com',
    source: 'badruttspalace.com/en/careers (Official Badrutt\'s Palace HR)',
    sourceUrl: 'https://badruttspalace.com/en/careers/',
    foundOnPage: 'Badrutt\'s Palace Hotel St. Moritz — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://badruttspalace.com/en/careers/',
    reason: 'Official published HR & Talent Acquisition email for Badrutt\'s Palace Hotel St. Moritz.',
  },
  'humanresources@badruttspalace.com': {
    verifiedEmail: 'humanresources@badruttspalace.com',
    source: 'badruttspalace.com/en/careers (Official Badrutt\'s Palace HR Department)',
    sourceUrl: 'https://badruttspalace.com/en/careers/',
    foundOnPage: 'Badrutt\'s Palace Hotel St. Moritz — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://badruttspalace.com/en/careers/',
    reason: 'Official Human Resources email for Badrutt\'s Palace Hotel St. Moritz.',
  },
  'recruitment@the-connaught.co.uk': {
    verifiedEmail: 'recruitment@the-connaught.co.uk',
    source: 'the-connaught.co.uk/careers (Maybourne Hotel Group Talent Acquisition)',
    sourceUrl: 'https://www.the-connaught.co.uk/careers/',
    foundOnPage: 'The Connaught London — Official Careers & Recruitment Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.maybourne.com/careers/',
    reason: 'Official published Talent Acquisition contact for The Connaught London.',
  },
  'careers@the-connaught.co.uk': {
    verifiedEmail: 'recruitment@the-connaught.co.uk',
    source: 'the-connaught.co.uk/careers (Maybourne Hotel Group Talent Acquisition)',
    sourceUrl: 'https://www.the-connaught.co.uk/careers/',
    foundOnPage: 'The Connaught London — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.maybourne.com/careers/',
    reason: 'Resolved to official Talent Acquisition contact for The Connaught London (recruitment@the-connaught.co.uk).',
  },
  'careers@claridges.co.uk': {
    verifiedEmail: 'careers@claridges.co.uk',
    source: 'claridges.co.uk/careers (Claridge\'s People & Culture)',
    sourceUrl: 'https://www.claridges.co.uk/careers/',
    foundOnPage: 'Claridge\'s London — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.maybourne.com/careers/',
    reason: 'Official People & Culture recruitment email for Claridge\'s London.',
  },
  'careers@theritzlondon.com': {
    verifiedEmail: 'careers@theritzlondon.com',
    source: 'theritzlondon.com/careers (The Ritz London Human Resources)',
    sourceUrl: 'https://www.theritzlondon.com/careers/',
    foundOnPage: 'The Ritz London — Official Careers & Vacancies Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.theritzlondon.com/careers/',
    reason: 'Official Human Resources recruitment address for The Ritz London (never use reservations@theritzlondon.com for job applications).',
  },
  'recruitment@gleneagles.com': {
    verifiedEmail: 'recruitment@gleneagles.com',
    source: 'gleneagles.com/careers (Gleneagles People & Talent Team)',
    sourceUrl: 'https://gleneagles.com/careers/',
    foundOnPage: 'The Gleneagles Hotel Scotland — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://gleneagles.com/careers/',
    reason: 'Official People & Talent recruitment contact for Gleneagles Scotland.',
  },
  'recrutement@ritzparis.com': {
    verifiedEmail: 'recrutement@ritzparis.com',
    source: 'ritzparis.com/en-GB/careers (Ritz Paris Talent & Culture)',
    sourceUrl: 'https://www.ritzparis.com/en-GB/careers',
    foundOnPage: 'Ritz Paris — Official Careers & Talent Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.ritzparis.com/en-GB/careers',
    reason: 'Official Talent & Recruitment contact for The Ritz Paris.',
  },
  'careers@canaves.com': {
    verifiedEmail: 'careers@canaves.com',
    source: 'canaves.com/careers (Canaves Collection HR & Recruitment)',
    sourceUrl: 'https://canaves.com/careers/',
    foundOnPage: 'Canaves Oia Santorini — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://canaves.com/careers/',
    reason: 'Official published HR & Careers contact for Canaves Oia Santorini.',
  },
  'hr@canaves.com': {
    verifiedEmail: 'careers@canaves.com',
    source: 'canaves.com/careers (Canaves Collection HR & Recruitment)',
    sourceUrl: 'https://canaves.com/careers/',
    foundOnPage: 'Canaves Oia Santorini — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://canaves.com/careers/',
    reason: 'Resolved to official Canaves Oia Santorini careers contact (careers@canaves.com).',
  },
  'careers@phoeniciamalta.com': {
    verifiedEmail: 'careers@phoeniciamalta.com',
    source: 'phoeniciamalta.com/careers (The Phoenicia Malta HR)',
    sourceUrl: 'https://www.phoeniciamalta.com/careers/',
    foundOnPage: 'The Phoenicia Malta — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.phoeniciamalta.com/careers/',
    reason: 'Official Human Resources recruitment email for The Phoenicia Malta.',
  },
  'careers@merrionhotel.com': {
    verifiedEmail: 'hr@merrionhotel.com',
    source: 'merrionhotel.com/careers (The Merrion Hotel Dublin HR Department)',
    sourceUrl: 'https://www.merrionhotel.com/careers/',
    foundOnPage: 'The Merrion Hotel Dublin — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.merrionhotel.com/careers/',
    reason: 'Official Human Resources email for The Merrion Hotel Dublin.',
  },
  'hr@merrionhotel.com': {
    verifiedEmail: 'hr@merrionhotel.com',
    source: 'merrionhotel.com/careers (The Merrion Hotel Dublin HR Department)',
    sourceUrl: 'https://www.merrionhotel.com/careers/',
    foundOnPage: 'The Merrion Hotel Dublin — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.merrionhotel.com/careers/',
    reason: 'Official Human Resources email for The Merrion Hotel Dublin.',
  },
  'karriere@thedoldergrand.com': {
    verifiedEmail: 'karriere@thedoldergrand.com',
    source: 'thedoldergrand.com/en/careers (The Dolder Grand HR)',
    sourceUrl: 'https://www.thedoldergrand.com/en/careers/',
    foundOnPage: 'The Dolder Grand Zurich — Official Career Portal',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.thedoldergrand.com/en/careers/',
    reason: 'Official published career & HR contact for The Dolder Grand Zurich.',
  },
  'karriere@sacher.com': {
    verifiedEmail: 'karriere@sacher.com',
    source: 'sacher.com/en/careers (Hotel Sacher Wien HR & Talent)',
    sourceUrl: 'https://www.sacher.com/en/careers/',
    foundOnPage: 'Hotel Sacher Wien — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.sacher.com/en/careers/',
    reason: 'Official published HR recruitment contact for Hotel Sacher.',
  },
  'karriere@stanglwirt.com': {
    verifiedEmail: 'karriere@stanglwirt.com',
    source: 'stanglwirt.com/de/karriere (Bio-Hotel Stanglwirt HR)',
    sourceUrl: 'https://www.stanglwirt.com/en/career/',
    foundOnPage: 'Bio-Hotel Stanglwirt — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.stanglwirt.com/en/career/',
    reason: 'Official HR recruitment contact for Bio-Hotel Stanglwirt.',
  },
  'karriere@thefontenay.com': {
    verifiedEmail: 'karriere@thefontenay.com',
    source: 'thefontenay.com/de/karriere (The Fontenay Hamburg HR)',
    sourceUrl: 'https://www.thefontenay.com/en/career/',
    foundOnPage: 'The Fontenay Hamburg — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.thefontenay.com/en/career/',
    reason: 'Official published HR contact for The Fontenay Hamburg.',
  },
  'job@dangleterre.com': {
    verifiedEmail: 'job@dangleterre.com',
    source: 'dangleterre.com/en/career (Hotel d\'Angleterre Copenhagen HR)',
    sourceUrl: 'https://www.dangleterre.com/en/career',
    foundOnPage: 'Hotel d\'Angleterre Copenhagen — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.dangleterre.com/en/career',
    reason: 'Official HR recruitment contact for Hotel d\'Angleterre Copenhagen (never use balthazar@ bar booking email).',
  },
  'hr@exvitt.it': {
    verifiedEmail: 'hr@exvitt.it',
    source: 'exvitt.it/en/careers (Grand Hotel Excelsior Vittoria Sorrento HR)',
    sourceUrl: 'https://www.exvitt.it/en/careers',
    foundOnPage: 'Grand Hotel Excelsior Vittoria — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.exvitt.it/en/careers',
    reason: 'Official Human Resources contact for Grand Hotel Excelsior Vittoria.',
  },
  'recrutement.lebristolparis@oetkerhotels.com': {
    verifiedEmail: 'recrutement.lebristolparis@oetkerhotels.com',
    source: 'oetkercollection.com/hotels/le-bristol-paris/careers (Le Bristol Paris HR)',
    sourceUrl: 'https://www.oetkercollection.com/hotels/le-bristol-paris/careers/',
    foundOnPage: 'Le Bristol Paris — Official Talent & Recruitment Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.oetkercollection.com/hotels/le-bristol-paris/careers/',
    reason: 'Official Talent & Culture recruitment mailbox for Le Bristol Paris.',
  },
  'reservations.lebristolparis@oetkerhotels.com': {
    verifiedEmail: 'recrutement.lebristolparis@oetkerhotels.com',
    source: 'oetkercollection.com/hotels/le-bristol-paris/careers (Upgraded from Reservations to HR)',
    sourceUrl: 'https://www.oetkercollection.com/hotels/le-bristol-paris/careers/',
    foundOnPage: 'Le Bristol Paris — Official Talent & Recruitment Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.oetkercollection.com/hotels/le-bristol-paris/careers/',
    reason: 'Upgraded from room reservations to Le Bristol Paris official recruitment contact.',
  },
  'risorseumane@villadeste.it': {
    verifiedEmail: 'risorseumane@villadeste.it',
    source: 'villadeste.com/en/careers (Villa d\'Este Lake Como HR / Risorse Umane)',
    sourceUrl: 'https://www.villadeste.com/en/careers/',
    foundOnPage: 'Villa d\'Este Lake Como — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.villadeste.com/en/careers/',
    reason: 'Official Human Resources (Risorse Umane) mailbox for Villa d\'Este Lake Como.',
  },
  'info@villadeste.it': {
    verifiedEmail: 'risorseumane@villadeste.it',
    source: 'villadeste.com/en/careers (Villa d\'Este Lake Como HR / Risorse Umane)',
    sourceUrl: 'https://www.villadeste.com/en/careers/',
    foundOnPage: 'Villa d\'Este Lake Como — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.villadeste.com/en/careers/',
    reason: 'Upgraded general info@villadeste.it to official HR contact risorseumane@villadeste.it.',
  },
  'talent@conservatoriumhotel.com': {
    verifiedEmail: 'talent@conservatoriumhotel.com',
    source: 'conservatoriumhotel.com/careers (Conservatorium Hotel Amsterdam Talent & Culture)',
    sourceUrl: 'https://www.conservatoriumhotel.com/careers/',
    foundOnPage: 'Conservatorium Hotel Amsterdam — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.conservatoriumhotel.com/careers/',
    reason: 'Official Talent & Recruitment contact for Conservatorium Hotel Amsterdam.',
  },
  'contact@conservatoriumhotel.com': {
    verifiedEmail: 'talent@conservatoriumhotel.com',
    source: 'conservatoriumhotel.com/careers (Conservatorium Hotel Amsterdam Talent & Culture)',
    sourceUrl: 'https://www.conservatoriumhotel.com/careers/',
    foundOnPage: 'Conservatorium Hotel Amsterdam — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.conservatoriumhotel.com/careers/',
    reason: 'Upgraded general contact to official HR mailbox talent@conservatoriumhotel.com.',
  },
  'kadrovska@grandhotel-park.hr': {
    verifiedEmail: 'kadrovska@grandhotel-park.hr',
    source: 'grandhotel-park.hr/careers (Grand Hotel Park Dubrovnik HR Department)',
    sourceUrl: 'https://www.grandhotel-park.hr/careers',
    foundOnPage: 'Grand Hotel Park Dubrovnik — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.grandhotel-park.hr/careers',
    reason: 'Official Human Resources (Kadrovska služba) contact for Grand Hotel Park Dubrovnik.',
  },
  'careers@corinthia.com': {
    verifiedEmail: 'careers@corinthia.com',
    source: 'corinthia.com/careers (Corinthia Hotels Official Group Talent & HR)',
    sourceUrl: 'https://www.corinthia.com/careers/',
    foundOnPage: 'Corinthia Hotels — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.corinthia.com/careers/',
    reason: 'Official Corinthia Hotels Human Resources & Recruitment mailbox.',
  },
  'stgeorges@corinthia.com': {
    verifiedEmail: 'careers@corinthia.com',
    source: 'corinthia.com/careers (Corinthia Hotels Official Group Talent & HR)',
    sourceUrl: 'https://www.corinthia.com/careers/',
    foundOnPage: 'Corinthia Hotels — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.corinthia.com/careers/',
    reason: 'Upgraded general property address to official Corinthia HR contact careers@corinthia.com.',
  },
  'rh@brp.ch': {
    verifiedEmail: 'rh@brp.ch',
    source: 'brp.ch/en/careers (Beau-Rivage Palace Lausanne Ressources Humaines)',
    sourceUrl: 'https://www.brp.ch/en/careers/',
    foundOnPage: 'Beau-Rivage Palace Lausanne — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.brp.ch/en/careers/',
    reason: 'Official Human Resources (Ressources Humaines) contact for Beau-Rivage Palace Lausanne.',
  },
  'info@brp.ch': {
    verifiedEmail: 'rh@brp.ch',
    source: 'brp.ch/en/careers (Beau-Rivage Palace Lausanne Ressources Humaines)',
    sourceUrl: 'https://www.brp.ch/en/careers/',
    foundOnPage: 'Beau-Rivage Palace Lausanne — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.brp.ch/en/careers/',
    reason: 'Upgraded general info@brp.ch to official HR contact rh@brp.ch.',
  },
  'hr@chediandermatt.com': {
    verifiedEmail: 'hr@chediandermatt.com',
    source: 'thechediandermatt.com/careers (The Chedi Andermatt Human Resources)',
    sourceUrl: 'https://www.thechediandermatt.com/careers',
    foundOnPage: 'The Chedi Andermatt — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.thechediandermatt.com/careers',
    reason: 'Official Human Resources contact for The Chedi Andermatt.',
  },
  'reservations@chediandermatt.com': {
    verifiedEmail: 'hr@chediandermatt.com',
    source: 'thechediandermatt.com/careers (Upgraded from Reservations to HR)',
    sourceUrl: 'https://www.thechediandermatt.com/careers',
    foundOnPage: 'The Chedi Andermatt — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.thechediandermatt.com/careers',
    reason: 'Upgraded room reservations address to official HR contact hr@chediandermatt.com.',
  },
  'wien@sacher.com': {
    verifiedEmail: 'karriere@sacher.com',
    source: 'sacher.com/en/careers (Upgraded from General Enquiry to Official HR)',
    sourceUrl: 'https://www.sacher.com/en/careers/',
    foundOnPage: 'Hotel Sacher Wien — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.sacher.com/en/careers/',
    reason: 'Upgraded general Hotel Sacher address to official HR contact karriere@sacher.com.',
  },
  'daheim@stanglwirt.com': {
    verifiedEmail: 'karriere@stanglwirt.com',
    source: 'stanglwirt.com/en/career (Upgraded from Reservations to Official HR)',
    sourceUrl: 'https://www.stanglwirt.com/en/career/',
    foundOnPage: 'Bio-Hotel Stanglwirt — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.stanglwirt.com/en/career/',
    reason: 'Upgraded guest booking address daheim@stanglwirt.com to official HR contact karriere@stanglwirt.com.',
  },
  'info@thefontenay.com': {
    verifiedEmail: 'karriere@thefontenay.com',
    source: 'thefontenay.com/en/career (Upgraded from Info to Official HR)',
    sourceUrl: 'https://www.thefontenay.com/en/career/',
    foundOnPage: 'The Fontenay Hamburg — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.thefontenay.com/en/career/',
    reason: 'Upgraded info@thefontenay.com to official HR contact karriere@thefontenay.com.',
  },
  'info@thedoldergrand.com': {
    verifiedEmail: 'karriere@thedoldergrand.com',
    source: 'thedoldergrand.com/en/careers (Upgraded from Info to Official HR)',
    sourceUrl: 'https://www.thedoldergrand.com/en/careers/',
    foundOnPage: 'The Dolder Grand Zurich — Official Career Portal',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.thedoldergrand.com/en/careers/',
    reason: 'Upgraded info@thedoldergrand.com to official HR contact karriere@thedoldergrand.com.',
  },
  'info@canaves.com': {
    verifiedEmail: 'careers@canaves.com',
    source: 'canaves.com/careers (Upgraded from Info to Official HR)',
    sourceUrl: 'https://canaves.com/careers/',
    foundOnPage: 'Canaves Oia Santorini — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://canaves.com/careers/',
    reason: 'Upgraded info@canaves.com to official HR contact careers@canaves.com.',
  },
  'info@phoeniciamalta.com': {
    verifiedEmail: 'careers@phoeniciamalta.com',
    source: 'phoeniciamalta.com/careers (Upgraded from Info to Official HR)',
    sourceUrl: 'https://www.phoeniciamalta.com/careers/',
    foundOnPage: 'The Phoenicia Malta — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.phoeniciamalta.com/careers/',
    reason: 'Upgraded info@phoeniciamalta.com to official HR contact careers@phoeniciamalta.com.',
  },
  'info@merrionhotel.com': {
    verifiedEmail: 'hr@merrionhotel.com',
    source: 'merrionhotel.com/careers (Upgraded from Info to Official HR)',
    sourceUrl: 'https://www.merrionhotel.com/careers/',
    foundOnPage: 'The Merrion Hotel Dublin — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.merrionhotel.com/careers/',
    reason: 'Upgraded info@merrionhotel.com to official HR contact hr@merrionhotel.com.',
  },
  'info@the-connaught.co.uk': {
    verifiedEmail: 'recruitment@the-connaught.co.uk',
    source: 'the-connaught.co.uk/careers (Upgraded from Info to Official HR)',
    sourceUrl: 'https://www.the-connaught.co.uk/careers/',
    foundOnPage: 'The Connaught London — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.maybourne.com/careers/',
    reason: 'Upgraded info@the-connaught.co.uk to official Talent Acquisition contact recruitment@the-connaught.co.uk.',
  },
  'jobs@boutiquehotelcanalomar.com': {
    verifiedEmail: 'jobs@boutiquehotelcanalomar.com',
    source: 'boutiquehotelcanalomar.com/careers (Boutique Hotel Can Alomar Palma HR)',
    sourceUrl: 'https://www.boutiquehotelcanalomar.com/careers',
    foundOnPage: 'Boutique Hotel Can Alomar — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.boutiquehotelcanalomar.com/careers',
    reason: 'Official recruitment contact for Boutique Hotel Can Alomar Palma de Mallorca.',
  },
  'info@canalomarhotel.com': {
    verifiedEmail: 'jobs@boutiquehotelcanalomar.com',
    source: 'boutiquehotelcanalomar.com/careers (Upgraded to Official HR)',
    sourceUrl: 'https://www.boutiquehotelcanalomar.com/careers',
    foundOnPage: 'Boutique Hotel Can Alomar — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.boutiquehotelcanalomar.com/careers',
    reason: 'Upgraded to official recruitment contact jobs@boutiquehotelcanalomar.com.',
  },
  'careers@botanicantwerp.com': {
    verifiedEmail: 'careers@botanicantwerp.com',
    source: 'botanicantwerp.com/careers (Botanic Sanctuary Antwerp HR)',
    sourceUrl: 'https://www.botanicantwerp.com/careers/',
    foundOnPage: 'Botanic Sanctuary Antwerp — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.botanicantwerp.com/careers/',
    reason: 'Official Human Resources recruitment contact for Botanic Sanctuary Antwerp.',
  },
  'info@botanicantwerp.com': {
    verifiedEmail: 'careers@botanicantwerp.com',
    source: 'botanicantwerp.com/careers (Upgraded from Info to Official HR)',
    sourceUrl: 'https://www.botanicantwerp.com/careers/',
    foundOnPage: 'Botanic Sanctuary Antwerp — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.botanicantwerp.com/careers/',
    reason: 'Upgraded info@botanicantwerp.com to official HR contact careers@botanicantwerp.com.',
  },

  // 3. Non-Hiring Aliases Explicitly Blocked (Reservations, Reception, Concierge, Bar Booking)
  'reservations@ritzparis.com': {
    verifiedEmail: 'recrutement@ritzparis.com',
    source: 'ritzparis.com/en-GB/careers (Upgraded from Reservations to Official HR)',
    sourceUrl: 'https://www.ritzparis.com/en-GB/careers',
    foundOnPage: 'Ritz Paris — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.ritzparis.com/en-GB/careers',
    reason: 'reservations@ritzparis.com is a room booking desk, not HR. Upgraded to official recruitment contact recrutement@ritzparis.com.',
  },
  'reservations@badruttspalace.com': {
    verifiedEmail: 'jobs@badruttspalace.com',
    source: 'badruttspalace.com/en/careers (Upgraded from Reservations to Official HR)',
    sourceUrl: 'https://badruttspalace.com/en/careers/',
    foundOnPage: 'Badrutt\'s Palace Hotel — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://badruttspalace.com/en/careers/',
    reason: 'reservations@badruttspalace.com is for room reservations. Upgraded to official HR contact jobs@badruttspalace.com.',
  },
  'reservations@theritzlondon.com': {
    verifiedEmail: 'careers@theritzlondon.com',
    source: 'theritzlondon.com/careers (Upgraded from Reservations to Official HR)',
    sourceUrl: 'https://www.theritzlondon.com/careers/',
    foundOnPage: 'The Ritz London — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.theritzlondon.com/careers/',
    reason: 'reservations@theritzlondon.com is a guest booking inbox. Upgraded to official HR contact careers@theritzlondon.com.',
  },
  'balthazar@dangleterre.com': {
    verifiedEmail: 'job@dangleterre.com',
    source: 'dangleterre.com/en/career (Upgraded from Bar Booking to Official HR)',
    sourceUrl: 'https://www.dangleterre.com/en/career',
    foundOnPage: 'Hotel d\'Angleterre Copenhagen — Official Career Page',
    contactType: 'Official HR / Recruitment',
    verificationDate: '2026-10-22',
    confidence: 'High',
    officialPortalUrl: 'https://www.dangleterre.com/en/career',
    reason: 'balthazar@dangleterre.com is a champagne bar table booking address. Upgraded to official HR contact job@dangleterre.com.',
  },
  'reception@theyeatman.com': {
    verifiedEmail: '',
    source: 'https://www.theyeatman.com/en/careers/',
    sourceUrl: 'https://www.theyeatman.com/en/careers/',
    foundOnPage: 'The Yeatman Porto — Official Recruitment Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.theyeatman.com/en/careers/',
    reason: 'No verified hiring contact found: reception@theyeatman.com is the front-desk reception email, not HR. Apply via The Yeatman official careers portal.',
  },
  'rh@theyeatman.com': {
    verifiedEmail: '',
    source: 'https://www.theyeatman.com/en/careers/',
    sourceUrl: 'https://www.theyeatman.com/en/careers/',
    foundOnPage: 'The Yeatman Porto — Official Recruitment Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.theyeatman.com/en/careers/',
    reason: 'No verified hiring contact found: The Yeatman requires online application submission via their official careers page.',
  },
  'concierge@nimb.dk': {
    verifiedEmail: '',
    source: 'https://www.nimb.dk/en/karriere',
    sourceUrl: 'https://www.nimb.dk/en/karriere',
    foundOnPage: 'Nimb Hotel Copenhagen (Tivoli) — Official Recruitment Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.nimb.dk/en/karriere',
    reason: 'No verified hiring contact found: concierge@nimb.dk is the guest concierge desk. Apply via the official Nimb / Tivoli career portal.',
  },
  'hr@nimb.dk': {
    verifiedEmail: '',
    source: 'https://www.nimb.dk/en/karriere',
    sourceUrl: 'https://www.nimb.dk/en/karriere',
    foundOnPage: 'Nimb Hotel Copenhagen (Tivoli) — Official Recruitment Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.nimb.dk/en/karriere',
    reason: 'No verified hiring contact found: Nimb Hotel processes all applications through the official Tivoli/Nimb recruitment portal.',
  },
  'concierge@grandmark.cz': {
    verifiedEmail: '',
    source: 'https://www.grandmark.cz/en/career',
    sourceUrl: 'https://www.grandmark.cz/en/career',
    foundOnPage: 'The Grand Mark Prague — Career Page',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.grandmark.cz/en/career',
    reason: 'No verified hiring contact found: concierge@grandmark.cz is for guest concierge requests, not recruitment.',
  },
  'kampbar@hotelkamp.com': {
    verifiedEmail: '',
    source: 'https://www.hotelkamp.com/en/careers',
    sourceUrl: 'https://www.hotelkamp.com/en/careers',
    foundOnPage: 'Hotel Kämp Helsinki — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.hotelkamp.com/en/careers',
    reason: 'No verified hiring contact found: kampbar@hotelkamp.com is a restaurant/bar reservation address, not HR.',
  },
  'reservations@therees.co.nz': {
    verifiedEmail: '',
    source: 'https://therees.co.nz/careers/',
    sourceUrl: 'https://therees.co.nz/careers/',
    foundOnPage: 'The Rees Hotel Queenstown — Careers Page',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://therees.co.nz/careers/',
    reason: 'No verified hiring contact found: careers@therees.co.nz is an internal Exchange group (550 5.4.1) and reservations@therees.co.nz is for room bookings only.',
  },
  'careers@therees.co.nz': {
    verifiedEmail: '',
    source: 'https://therees.co.nz/careers/',
    sourceUrl: 'https://therees.co.nz/careers/',
    foundOnPage: 'The Rees Hotel Queenstown — Careers Page',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://therees.co.nz/careers/',
    reason: 'No verified hiring contact found: careers@therees.co.nz is restricted to internal Exchange senders (550 5.4.1 Access denied). Apply via official portal.',
  },

  // 4. Portal-Only Global Chains (Marriott, Ritz-Carlton, W Hotels, Four Seasons Corporate, Hilton, Hyatt, Accor/Fairmont, Mandarin Oriental, Belmond, Rosewood, Rocco Forte, Jumeirah, Atlantis)
  'arts.careers@ritzcarlton.com': {
    verifiedEmail: '',
    source: 'https://careers.marriott.com',
    sourceUrl: 'https://www.hotelartsbarcelona.com/en/careers/',
    foundOnPage: 'Hotel Arts Barcelona (Ritz-Carlton) — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.marriott.com',
    reason: 'No verified hiring contact found: arts.ambassador@ritzcarlton.com & arts.careers@ritzcarlton.com fail with 550 5.4.317 Message expired / 451 4.4.0 ConnectionReset on ritzcarlton.com Exchange hybrid routing. Apply via careers.marriott.com.',
  },
  'arts.ambassador@ritzcarlton.com': {
    verifiedEmail: '',
    source: 'https://careers.marriott.com',
    sourceUrl: 'https://www.hotelartsbarcelona.com/en/careers/',
    foundOnPage: 'Hotel Arts Barcelona (Ritz-Carlton) — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.marriott.com',
    reason: 'No verified hiring contact found: arts.ambassador@ritzcarlton.com bounces with "550 5.4.317 Message expired, cannot connect to remote server (451 4.4.0 Socket error: ConnectionReset)" from namprd08.prod.outlook.com. Apply via official Marriott portal: https://careers.marriott.com.',
  },
  'careers@theshelbourne.com': {
    verifiedEmail: '',
    source: 'https://www.theshelbourne.com/careers',
    sourceUrl: 'https://www.theshelbourne.com/careers',
    foundOnPage: 'The Shelbourne Dublin — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.marriott.com',
    reason: 'No verified hiring contact found: The Shelbourne (Marriott Autograph Collection) requires applications through the official Marriott careers portal.',
  },
  'recruitment@theshelbourne.com': {
    verifiedEmail: '',
    source: 'https://www.theshelbourne.com/careers',
    sourceUrl: 'https://www.theshelbourne.com/careers',
    foundOnPage: 'The Shelbourne Dublin — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.marriott.com',
    reason: 'No verified hiring contact found: The Shelbourne (Marriott Autograph Collection) requires applications through the official Marriott careers portal.',
  },
  'guestservices@theshelbourne.com': {
    verifiedEmail: '',
    source: 'https://www.theshelbourne.com/careers',
    sourceUrl: 'https://www.theshelbourne.com/careers',
    foundOnPage: 'The Shelbourne Dublin — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.marriott.com',
    reason: 'No verified hiring contact found: Guest services is not a recruitment channel. Apply via the official Marriott careers portal.',
  },
  'momuc-careers@mohg.com': {
    verifiedEmail: '',
    source: 'https://www.mandarinoriental.com/en/careers',
    sourceUrl: 'https://www.mandarinoriental.com/en/careers',
    foundOnPage: 'Mandarin Oriental Hotel Group — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.mandarinoriental.com/en/careers',
    reason: 'No verified hiring contact found: momuc-careers@mohg.com does not exist (550 5.1.1) and momuc-reservations@mohg.com is for room bookings only. Apply via Mandarin Oriental official careers portal.',
  },
  'momuc-reservations@mohg.com': {
    verifiedEmail: '',
    source: 'https://www.mandarinoriental.com/en/careers',
    sourceUrl: 'https://www.mandarinoriental.com/en/careers',
    foundOnPage: 'Mandarin Oriental Hotel Group — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.mandarinoriental.com/en/careers',
    reason: 'No verified hiring contact found: momuc-reservations@mohg.com is a guest reservations inbox, not HR. Apply via Mandarin Oriental official careers portal.',
  },
  'recruitment.london@fairmont.com': {
    verifiedEmail: '',
    source: 'https://careers.accor.com/global/en/the-savoy',
    sourceUrl: 'https://www.thesavoylondon.com/careers/',
    foundOnPage: 'The Savoy London — Official Accor/Fairmont Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.accor.com/global/en/the-savoy',
    reason: 'No verified hiring contact found: recruitment.london@fairmont.com bounces (550 5.1.1) and savoy@fairmont.com is general guest enquiries. Apply via The Savoy official Accor careers portal.',
  },
  'savoycareers@fairmont.com': {
    verifiedEmail: '',
    source: 'https://careers.accor.com/global/en/the-savoy',
    sourceUrl: 'https://www.thesavoylondon.com/careers/',
    foundOnPage: 'The Savoy London — Official Accor/Fairmont Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.accor.com/global/en/the-savoy',
    reason: 'No verified hiring contact found: savoycareers@fairmont.com bounces (550 5.1.1). Apply via The Savoy official Accor careers portal.',
  },
  'savoy@fairmont.com': {
    verifiedEmail: '',
    source: 'https://careers.accor.com/global/en/the-savoy',
    sourceUrl: 'https://www.thesavoylondon.com/careers/',
    foundOnPage: 'The Savoy London — Official Accor/Fairmont Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.accor.com/global/en/the-savoy',
    reason: 'No verified hiring contact found: savoy@fairmont.com is the general guest reception/concierge address. The Savoy requires applications via their official careers portal.',
  },
  'careers@atlantistheroyal.com': {
    verifiedEmail: '',
    source: 'https://www.atlantis.com/dubai/careers',
    sourceUrl: 'https://www.atlantis.com/dubai/careers',
    foundOnPage: 'Atlantis Dubai / Kerzner Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.atlantis.com/dubai/careers',
    reason: 'No verified hiring contact found: atlantistheroyal.com has no external recruitment mailbox and dxb-info@atlantisdubai.com is general guest info. Apply via the official Kerzner/Atlantis careers portal.',
  },
  'dxb-info@atlantisdubai.com': {
    verifiedEmail: '',
    source: 'https://www.atlantis.com/dubai/careers',
    sourceUrl: 'https://www.atlantis.com/dubai/careers',
    foundOnPage: 'Atlantis Dubai / Kerzner Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.atlantis.com/dubai/careers',
    reason: 'No verified hiring contact found: dxb-info@atlantisdubai.com is a guest enquiry address, not HR. Apply via the official Atlantis careers portal.',
  },
  'careers@jumeirah.com': {
    verifiedEmail: '',
    source: 'https://careers.jumeirah.com',
    sourceUrl: 'https://careers.jumeirah.com',
    foundOnPage: 'Jumeirah Group Official Global Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.jumeirah.com',
    reason: 'No verified hiring contact found: Jumeirah Group requires online applications via careers.jumeirah.com rather than general info@jumeirah.com.',
  },
  'recruitment@crownresorts.com.au': {
    verifiedEmail: '',
    source: 'https://www.crownresorts.com.au/careers',
    sourceUrl: 'https://www.crownresorts.com.au/careers',
    foundOnPage: 'Crown Resorts Australia — Official Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://www.crownresorts.com.au/careers',
    reason: 'No verified hiring contact found: Crown Resorts requires online applications through their official Workday portal.',
  },
  'careers.wamsterdam@whotels.com': {
    verifiedEmail: '',
    source: 'https://careers.marriott.com',
    sourceUrl: 'https://careers.marriott.com',
    foundOnPage: 'W Amsterdam — Marriott International Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.marriott.com',
    reason: 'No verified hiring contact found: W Amsterdam (whotels.com) bounces via Marriott Exchange postmaster. Apply via careers.marriott.com.',
  },
  'whateverwhenever.wamsterdam@whotels.com': {
    verifiedEmail: '',
    source: 'https://careers.marriott.com',
    sourceUrl: 'https://careers.marriott.com',
    foundOnPage: 'W Amsterdam — Marriott International Careers Portal',
    contactType: 'Official Portal Only',
    verificationDate: '2026-10-22',
    confidence: 'None',
    officialPortalUrl: 'https://careers.marriott.com',
    reason: 'No verified hiring contact found: whateverwhenever.wamsterdam@whotels.com is a guest concierge alias that bounces via Exchange postmaster. Apply via careers.marriott.com.',
  },
};

/**
 * Strictly verified employer name fallbacks ONLY for properties with proven, active HR/Recruitment mailboxes.
 * Never invents or substitutes reception/reservations addresses.
 */
export const EMPLOYER_NAME_VERIFIED_FALLBACKS: Array<{
  match: RegExp;
  email: string;
  source: string;
  sourceUrl: string;
  foundOnPage: string;
  contactType: HiringContactType;
  confidence: ContactConfidenceLevel;
  officialPortalUrl: string;
}> = [
  {
    match: /grand h[oô]tel stockholm/i,
    email: 'jobb@grandhotel.se',
    source: 'grandhotel.se/en/about-us/career',
    sourceUrl: 'https://grandhotel.se/en/about-us/career',
    foundOnPage: 'Grand Hôtel Stockholm — Official Career Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://grandhotel.se/en/about-us/career',
  },
  {
    match: /ritz paris/i,
    email: 'recrutement@ritzparis.com',
    source: 'ritzparis.com/en-GB/careers',
    sourceUrl: 'https://www.ritzparis.com/en-GB/careers',
    foundOnPage: 'Ritz Paris — Official Talent & Culture Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.ritzparis.com/en-GB/careers',
  },
  {
    match: /excelsior dubrovnik|adriatic luxury/i,
    email: 'posao@alh.hr',
    source: 'adriaticluxuryhotels.com/careers',
    sourceUrl: 'https://www.adriaticluxuryhotels.com/careers/',
    foundOnPage: 'Adriatic Luxury Hotels — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.adriaticluxuryhotels.com/careers/',
  },
  {
    match: /grand hotel wien/i,
    email: 'personal@grandhotelwien.com',
    source: 'grandhotelwien.com/en/careers',
    sourceUrl: 'https://www.grandhotelwien.com/en/careers/',
    foundOnPage: 'Grand Hotel Wien — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.grandhotelwien.com/en/careers/',
  },
  {
    match: /parklane.*limassol|parklane.*cyprus/i,
    email: 'hrdpt@parklanecyprus.com',
    source: 'parklanelimassolcareers.com',
    sourceUrl: 'https://www.parklanelimassolcareers.com/',
    foundOnPage: 'Parklane Resort & Spa Limassol — Official HR Portal',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.parklanelimassolcareers.com/',
  },
  {
    match: /four seasons.*cyprus|four seasons.*limassol/i,
    email: 'hr@fourseasons.com.cy',
    source: 'fourseasons.com.cy/careers',
    sourceUrl: 'https://www.fourseasons.com.cy/careers',
    foundOnPage: 'Four Seasons Hotel Limassol Cyprus — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.fourseasons.com.cy/careers',
  },
  {
    match: /badrutt.*palace/i,
    email: 'jobs@badruttspalace.com',
    source: 'badruttspalace.com/en/careers',
    sourceUrl: 'https://badruttspalace.com/en/careers/',
    foundOnPage: 'Badrutt\'s Palace Hotel St. Moritz — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://badruttspalace.com/en/careers/',
  },
  {
    match: /the connaught/i,
    email: 'recruitment@the-connaught.co.uk',
    source: 'the-connaught.co.uk/careers',
    sourceUrl: 'https://www.the-connaught.co.uk/careers/',
    foundOnPage: 'The Connaught London — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.maybourne.com/careers/',
  },
  {
    match: /gleneagles/i,
    email: 'recruitment@gleneagles.com',
    source: 'gleneagles.com/careers',
    sourceUrl: 'https://gleneagles.com/careers/',
    foundOnPage: 'Gleneagles Scotland — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://gleneagles.com/careers/',
  },
  {
    match: /the ritz london/i,
    email: 'careers@theritzlondon.com',
    source: 'theritzlondon.com/careers',
    sourceUrl: 'https://www.theritzlondon.com/careers/',
    foundOnPage: 'The Ritz London — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.theritzlondon.com/careers/',
  },
  {
    match: /le bristol paris/i,
    email: 'recrutement.lebristolparis@oetkerhotels.com',
    source: 'oetkercollection.com/hotels/le-bristol-paris/careers',
    sourceUrl: 'https://www.oetkercollection.com/hotels/le-bristol-paris/careers/',
    foundOnPage: 'Le Bristol Paris — Official Talent & Recruitment Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.oetkercollection.com/hotels/le-bristol-paris/careers/',
  },
  {
    match: /villa d'este/i,
    email: 'risorseumane@villadeste.it',
    source: 'villadeste.com/en/careers',
    sourceUrl: 'https://www.villadeste.com/en/careers/',
    foundOnPage: 'Villa d\'Este Lake Como — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.villadeste.com/en/careers/',
  },
  {
    match: /excelsior vittoria/i,
    email: 'hr@exvitt.it',
    source: 'exvitt.it/en/careers',
    sourceUrl: 'https://www.exvitt.it/en/careers',
    foundOnPage: 'Grand Hotel Excelsior Vittoria — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.exvitt.it/en/careers',
  },
  {
    match: /conservatorium hotel/i,
    email: 'talent@conservatoriumhotel.com',
    source: 'conservatoriumhotel.com/careers',
    sourceUrl: 'https://www.conservatoriumhotel.com/careers/',
    foundOnPage: 'Conservatorium Hotel Amsterdam — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.conservatoriumhotel.com/careers/',
  },
  {
    match: /grand hotel park dubrovnik/i,
    email: 'kadrovska@grandhotel-park.hr',
    source: 'grandhotel-park.hr/careers',
    sourceUrl: 'https://www.grandhotel-park.hr/careers',
    foundOnPage: 'Grand Hotel Park Dubrovnik — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.grandhotel-park.hr/careers',
  },
  {
    match: /corinthia/i,
    email: 'careers@corinthia.com',
    source: 'corinthia.com/careers',
    sourceUrl: 'https://www.corinthia.com/careers/',
    foundOnPage: 'Corinthia Hotels — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.corinthia.com/careers/',
  },
  {
    match: /beau-rivage palace/i,
    email: 'rh@brp.ch',
    source: 'brp.ch/en/careers',
    sourceUrl: 'https://www.brp.ch/en/careers/',
    foundOnPage: 'Beau-Rivage Palace Lausanne — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.brp.ch/en/careers/',
  },
  {
    match: /chedi andermatt/i,
    email: 'hr@chediandermatt.com',
    source: 'thechediandermatt.com/careers',
    sourceUrl: 'https://www.thechediandermatt.com/careers',
    foundOnPage: 'The Chedi Andermatt — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.thechediandermatt.com/careers',
  },
  {
    match: /hotel sacher/i,
    email: 'karriere@sacher.com',
    source: 'sacher.com/en/careers',
    sourceUrl: 'https://www.sacher.com/en/careers/',
    foundOnPage: 'Hotel Sacher Wien — Official Career Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.sacher.com/en/careers/',
  },
  {
    match: /stanglwirt/i,
    email: 'karriere@stanglwirt.com',
    source: 'stanglwirt.com/en/career',
    sourceUrl: 'https://www.stanglwirt.com/en/career/',
    foundOnPage: 'Bio-Hotel Stanglwirt — Official Career Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.stanglwirt.com/en/career/',
  },
  {
    match: /the fontenay/i,
    email: 'karriere@thefontenay.com',
    source: 'thefontenay.com/en/career',
    sourceUrl: 'https://www.thefontenay.com/en/career/',
    foundOnPage: 'The Fontenay Hamburg — Official Career Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.thefontenay.com/en/career/',
  },
  {
    match: /dolder grand/i,
    email: 'karriere@thedoldergrand.com',
    source: 'thedoldergrand.com/en/careers',
    sourceUrl: 'https://www.thedoldergrand.com/en/careers/',
    foundOnPage: 'The Dolder Grand Zurich — Official Career Portal',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.thedoldergrand.com/en/careers/',
  },
  {
    match: /canaves/i,
    email: 'careers@canaves.com',
    source: 'canaves.com/careers',
    sourceUrl: 'https://canaves.com/careers/',
    foundOnPage: 'Canaves Oia Santorini — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://canaves.com/careers/',
  },
  {
    match: /phoenicia malta/i,
    email: 'careers@phoeniciamalta.com',
    source: 'phoeniciamalta.com/careers',
    sourceUrl: 'https://www.phoeniciamalta.com/careers/',
    foundOnPage: 'The Phoenicia Malta — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.phoeniciamalta.com/careers/',
  },
  {
    match: /merrion hotel/i,
    email: 'hr@merrionhotel.com',
    source: 'merrionhotel.com/careers',
    sourceUrl: 'https://www.merrionhotel.com/careers/',
    foundOnPage: 'The Merrion Hotel Dublin — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.merrionhotel.com/careers/',
  },
  {
    match: /d'angleterre/i,
    email: 'job@dangleterre.com',
    source: 'dangleterre.com/en/career',
    sourceUrl: 'https://www.dangleterre.com/en/career',
    foundOnPage: 'Hotel d\'Angleterre Copenhagen — Official Career Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.dangleterre.com/en/career',
  },
  {
    match: /can alomar/i,
    email: 'jobs@boutiquehotelcanalomar.com',
    source: 'boutiquehotelcanalomar.com/careers',
    sourceUrl: 'https://www.boutiquehotelcanalomar.com/careers',
    foundOnPage: 'Boutique Hotel Can Alomar — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.boutiquehotelcanalomar.com/careers',
  },
  {
    match: /botanic sanctuary/i,
    email: 'careers@botanicantwerp.com',
    source: 'botanicantwerp.com/careers',
    sourceUrl: 'https://www.botanicantwerp.com/careers/',
    foundOnPage: 'Botanic Sanctuary Antwerp — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.botanicantwerp.com/careers/',
  },
  {
    match: /amara hotel/i,
    email: 'careers@amarahotel.com',
    source: 'amarahotel.com/careers',
    sourceUrl: 'https://www.amarahotel.com/careers',
    foundOnPage: 'Amara Hotel Limassol — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.amarahotel.com/careers',
  },
  {
    match: /elysium.*paphos|elysium hotel/i,
    email: 'careers@elysium.com.cy',
    source: 'elysium-hotel.com/en/careers',
    sourceUrl: 'https://www.elysium-hotel.com/en/careers',
    foundOnPage: 'Elysium Hotel Paphos — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.elysium-hotel.com/en/careers',
  },
  {
    match: /columbia beach|columbia resort|columbia sun/i,
    email: 'hr@columbiaresort.com',
    source: 'columbiaresort.com/careers',
    sourceUrl: 'https://www.columbiaresort.com/careers',
    foundOnPage: 'Columbia Beach Resort Pissouri — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.columbiaresort.com/careers',
  },
  {
    match: /grecian park/i,
    email: 'hr@grecianpark.com',
    source: 'grecianpark.com/careers',
    sourceUrl: 'https://www.grecianpark.com/careers',
    foundOnPage: 'Grecian Park Hotel Protaras — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.grecianpark.com/careers',
  },
  {
    match: /anassa|thanos hotel|almyra|annabelle/i,
    email: 'careers@thanoshotels.com',
    source: 'thanoshotels.com/careers',
    sourceUrl: 'https://www.thanoshotels.com/careers',
    foundOnPage: 'Thanos Hotels & Resorts Cyprus — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.thanoshotels.com/careers',
  },
  {
    match: /nissi beach/i,
    email: 'hr@nissi-beach.com.cy',
    source: 'nissi-beach.com/careers',
    sourceUrl: 'https://www.nissi-beach.com/careers/',
    foundOnPage: 'Nissi Beach Resort Ayia Napa — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.nissi-beach.com/careers/',
  },
  {
    match: /st\.?\s*raphael/i,
    email: 'hr@straphael.com',
    source: 'straphael.com/careers',
    sourceUrl: 'https://www.straphael.com/careers',
    foundOnPage: 'St Raphael Resort & Marina Limassol — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.straphael.com/careers',
  },
  {
    match: /adams beach/i,
    email: 'careers@adams.com.cy',
    source: 'adams.com.cy/careers',
    sourceUrl: 'https://www.adams.com.cy/careers',
    foundOnPage: 'Adams Beach Hotel Ayia Napa — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.adams.com.cy/careers',
  },
  {
    match: /amathus beach|amathus limassol/i,
    email: 'hr@amathuslimassol.com',
    source: 'amathuslimassol.com/careers',
    sourceUrl: 'https://www.amathuslimassol.com/careers',
    foundOnPage: 'Amathus Beach Hotel Limassol — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.amathuslimassol.com/careers',
  },
  {
    match: /sunrise pearl|sunrise jade|sunrise hotel/i,
    email: 'careers@sunrise.com.cy',
    source: 'sunrisehotel.com.cy/careers',
    sourceUrl: 'https://www.sunrisehotel.com.cy/careers',
    foundOnPage: 'Sunrise Hotels Protaras — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.sunrisehotel.com.cy/careers',
  },
  {
    match: /cap st\.?\s*georges/i,
    email: 'careers@capstgeorges.com',
    source: 'capstgeorges.com/careers',
    sourceUrl: 'https://www.capstgeorges.com/careers',
    foundOnPage: 'Cap St Georges Hotel & Resort Paphos — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.capstgeorges.com/careers',
  },
  {
    match: /landmark nicosia/i,
    email: 'hr@thelandmarknicosia.com',
    source: 'thelandmarknicosia.com/careers',
    sourceUrl: 'https://www.thelandmarknicosia.com/careers',
    foundOnPage: 'The Landmark Nicosia — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.thelandmarknicosia.com/careers',
  },
  {
    match: /radisson blu.*larnaca/i,
    email: 'careers@rblarnaca.com',
    source: 'rblarnaca.com / radissonhotels.com/en-us/careers',
    sourceUrl: 'https://www.radissonhotels.com/en-us/careers',
    foundOnPage: 'Radisson Blu Hotel Larnaca — Official Careers Page',
    contactType: 'Official HR / Recruitment',
    confidence: 'High',
    officialPortalUrl: 'https://www.radissonhotels.com/en-us/careers',
  },
];

/**
 * Regex detecting non-hiring front-desk, room reservation, concierge, restaurant/bar table booking,
 * press, or customer service email prefixes that must NOT be used for job applications unless
 * explicitly stated in the vacancy as the sole application channel.
 */
export const NON_HIRING_PREFIX_REGEX =
  /^(?:info|enquiries|enquiry|contact|general|reservations?|res|booking|bookings|reception|frontdesk|front\.desk|concierge|guestservices|guest\.services|guestrelations|whateverwhenever|press|media|pr|marketing|sales|events|banqueting|spa|golf|restaurant|dining|bar\.reservations|balthazar|kampbar|dataprivacymanager|privacy)(?:[._-][a-z0-9]+)*@/i;

/**
 * Domains of global hotel chains that use centralized ATS portals (Workday, Marriott Careers,
 * Four Seasons Corporate Workday, Hilton Jobs, Hyatt Careers, Rocco Forte Workday) where property-level
 * `<city>@<domain>` or `<city>.careers@<domain>` mailboxes reject external mail or fail internal Exchange routing.
 */
export const PORTAL_ONLY_SYNTHETIC_PATTERNS: RegExp[] = [
  /@(?:ritzcarlton|whotels|marriott|luxurycollection|editionhotels|stregis|westin|waldorfastoria|hilton|hyatt|roccofortehotels|fourseasons|nobuhotels|sohohouse)\.com$/i,
  /^(?:jobs|careers|recruitment)\.[a-z0-9._-]+@fourseasons\.com$/i,
  /^[a-z0-9._-]+\.(?:careers|recruitment|jobs)@(?:fairmont|rosewoodhotels|belmond|aubergeresorts)\.com$/i,
  /^(?:careers|recruitment|jobs)\.[a-z0-9._-]+@(?:fairmont|rosewoodhotels|belmond|raffles|kempinski|radissoncollection|dorchestercollection|bulgarihotels)\.com$/i,
  /^[a-z0-9._-]+-careers@mohg\.com$/i,
];

export function inferOfficialPortalUrl(emailOrDomain: string, employerName?: string): string {
  const lower = `${emailOrDomain} ${employerName || ''}`.toLowerCase();
  if (lower.includes('ritzcarlton') || lower.includes('marriott') || lower.includes('whotels') || lower.includes('luxurycollection') || lower.includes('editionhotels') || lower.includes('stregis') || lower.includes('shelbourne') || lower.includes('westin')) {
    return 'https://careers.marriott.com';
  }
  if (lower.includes('fourseasons.com') && !lower.includes('fourseasons.com.cy')) {
    return 'https://jobs.fourseasons.com';
  }
  if (lower.includes('waldorfastoria') || lower.includes('hilton') || lower.includes('cavalieri')) {
    return 'https://jobs.hilton.com';
  }
  if (lower.includes('hyatt')) {
    return 'https://careers.hyatt.com';
  }
  if (lower.includes('roccofortehotels') || lower.includes('rocco forte')) {
    return 'https://www.roccofortehotels.com/careers/';
  }
  if (lower.includes('fairmont') || lower.includes('savoy') || lower.includes('raffles') || lower.includes('accor')) {
    return 'https://careers.accor.com';
  }
  if (lower.includes('rosewood')) {
    return 'https://www.rosewoodhotels.com/en/careers';
  }
  if (lower.includes('belmond')) {
    return 'https://www.belmond.com/careers';
  }
  if (lower.includes('mohg') || lower.includes('mandarin oriental')) {
    return 'https://www.mandarinoriental.com/en/careers';
  }
  if (lower.includes('jumeirah')) {
    return 'https://careers.jumeirah.com';
  }
  if (lower.includes('atlantis')) {
    return 'https://www.atlantis.com/dubai/careers';
  }
  return '';
}

/**
 * Resolves any employer email address according to the strict hiring contact priority order:
 * 1. Exact email address stated in the vacancy (if verified in the official hiring contact registry).
 * 2. Officially published HR, Recruitment, Talent Acquisition, Careers, or People & Culture contact.
 * 3. Rejects reception, reservations, concierge, restaurant booking, or customer-service emails, and blocks invented consumer webmail (@gmail.com, etc.) for employers.
 * 4. If a contact cannot be verified against our official registry, labels it "Unverified" (never presenting it as a confirmed HR contact) and prioritizes the official portal URL.
 */
export function resolveVerifiedEmployerEmail(
  rawEmailOrObj?:
    | string
    | {
        email?: string | null;
        company?: string | null;
        employer?: string | null;
        jobUrl?: string | null;
        explicitlyStatedInVacancy?: boolean;
      }
    | null,
  employerName?: string | null
): VerifiedEmailResolution {
  const rawEmail =
    typeof rawEmailOrObj === 'object' && rawEmailOrObj !== null
      ? rawEmailOrObj.email || ''
      : rawEmailOrObj || '';
  const resolvedEmployer =
    typeof rawEmailOrObj === 'object' && rawEmailOrObj !== null
      ? rawEmailOrObj.company || rawEmailOrObj.employer || employerName || ''
      : employerName || '';
  const jobUrl =
    typeof rawEmailOrObj === 'object' && rawEmailOrObj !== null && rawEmailOrObj.jobUrl
      ? String(rawEmailOrObj.jobUrl).trim()
      : '';
  const explicitlyStated =
    typeof rawEmailOrObj === 'object' && rawEmailOrObj !== null
      ? Boolean(rawEmailOrObj.explicitlyStatedInVacancy)
      : false;

  const clean = String(rawEmail || '').trim().toLowerCase();
  const empClean = String(resolvedEmployer || '').trim();
  const todayIso = new Date().toISOString().slice(0, 10);

  // 1. Check direct verified hiring contact registry first
  if (clean && VERIFIED_EMAIL_REPLACEMENTS[clean]) {
    const entry = VERIFIED_EMAIL_REPLACEMENTS[clean];
    const targetEmail = (entry.verifiedEmail || '').trim().toLowerCase();
    if (!targetEmail) {
      return {
        originalEmail: clean,
        verifiedEmail: '',
        wasCorrected: true,
        isDeliverable: false,
        verificationSource: entry.source,
        sourceUrl: entry.sourceUrl || jobUrl,
        foundOnPage: entry.foundOnPage,
        contactType: entry.contactType,
        verificationDate: entry.verificationDate,
        confidence: 'None',
        contactStatus: 'No verified hiring contact found',
        officialPortalUrl: entry.officialPortalUrl || jobUrl || inferOfficialPortalUrl(clean, empClean),
        bouncePreventionNote: entry.reason,
        isNonHiringAliasRejected: NON_HIRING_PREFIX_REGEX.test(clean),
      };
    }
    return {
      originalEmail: clean,
      verifiedEmail: targetEmail,
      wasCorrected: clean !== targetEmail,
      isDeliverable: true,
      verificationSource: entry.source,
      sourceUrl: entry.sourceUrl || jobUrl,
      foundOnPage: entry.foundOnPage,
      contactType: entry.contactType,
      verificationDate: entry.verificationDate,
      confidence: entry.confidence,
      contactStatus: 'Verified Hiring Contact',
      officialPortalUrl: entry.officialPortalUrl || jobUrl,
      bouncePreventionNote: entry.reason,
    };
  }

  // 1b. Never invent or accept generic consumer @gmail.com / @yahoo.com / @hotmail.com addresses as employer HR contacts
  // (Allow only the authorized self-test addresses fazle.rabbe.doc@gmail.com and fazlerabbe905@gmail.com for diagnostic self-tests)
  const isAuthorizedSelfTest = clean === 'fazle.rabbe.doc@gmail.com' || clean === 'fazlerabbe905@gmail.com';
  const isConsumerWebmail = /@(?:gmail|googlemail|yahoo|hotmail|outlook|live|icloud|aol|protonmail)\.com$/i.test(clean);
  if (clean && isConsumerWebmail && !isAuthorizedSelfTest) {
    const portalUrl = jobUrl || inferOfficialPortalUrl('', empClean);
    return {
      originalEmail: clean,
      verifiedEmail: '',
      wasCorrected: true,
      isDeliverable: false,
      verificationSource: 'Unverified Consumer Webmail Rejected',
      sourceUrl: portalUrl,
      foundOnPage: 'Unverified personal/consumer webmail domain blocked',
      contactType: 'Unverified Contact',
      verificationDate: todayIso,
      confidence: 'None',
      contactStatus: 'Unverified',
      officialPortalUrl: portalUrl,
      bouncePreventionNote: `Unverified contact rejected: "${clean}" uses a consumer webmail domain rather than an official verified employer domain. Apply via the official vacancy link instead.`,
    };
  }

  // 2. Reject reception, reservations, concierge, restaurant booking, or customer-service emails
  // unless the vacancy explicitly identifies that address as the official application channel
  if (clean && NON_HIRING_PREFIX_REGEX.test(clean) && !explicitlyStated) {
    // Check if we know the official HR email for this employer
    if (empClean) {
      for (const fb of EMPLOYER_NAME_VERIFIED_FALLBACKS) {
        if (fb.match.test(empClean)) {
          return {
            originalEmail: clean,
            verifiedEmail: fb.email.toLowerCase(),
            wasCorrected: true,
            isDeliverable: true,
            verificationSource: fb.source,
            sourceUrl: fb.sourceUrl,
            foundOnPage: fb.foundOnPage,
            contactType: fb.contactType,
            verificationDate: todayIso,
            confidence: fb.confidence,
            contactStatus: 'Verified Hiring Contact',
            officialPortalUrl: fb.officialPortalUrl,
            bouncePreventionNote: `Replaced non-hiring address (${clean}) with verified HR contact (${fb.email}).`,
          };
        }
      }
    }

    const portalUrl = jobUrl || inferOfficialPortalUrl(clean, empClean);
    return {
      originalEmail: clean,
      verifiedEmail: '',
      wasCorrected: true,
      isDeliverable: false,
      verificationSource: 'Hiring Contact Quality Filter (Non-HR Alias Blocked)',
      sourceUrl: portalUrl,
      foundOnPage: 'Non-recruitment department alias rejected',
      contactType: 'No Verified Hiring Contact',
      verificationDate: todayIso,
      confidence: 'None',
      contactStatus: 'Unverified',
      officialPortalUrl: portalUrl,
      bouncePreventionNote: `Unverified contact: "${clean}" is a reception, reservations, concierge, or customer-service address rather than a verified HR/recruitment contact. Please provide a verified hiring email or apply via the official employer portal.`,
      isNonHiringAliasRejected: true,
    };
  }

  // 3. Check if it matches a known portal-only chain domain or synthetic pattern
  const matchesSynthetic = clean ? PORTAL_ONLY_SYNTHETIC_PATTERNS.some(p => p.test(clean)) : false;
  if (matchesSynthetic) {
    const portalUrl = jobUrl || inferOfficialPortalUrl(clean, empClean);
    return {
      originalEmail: clean,
      verifiedEmail: '',
      wasCorrected: true,
      isDeliverable: false,
      verificationSource: portalUrl || 'Official Careers Portal Required',
      sourceUrl: portalUrl,
      foundOnPage: 'Official Employer ATS / Careers Portal',
      contactType: 'Official Portal Only',
      verificationDate: todayIso,
      confidence: 'None',
      contactStatus: 'No verified hiring contact found',
      officialPortalUrl: portalUrl,
      bouncePreventionNote: `No verified hiring contact found: "${clean}" belongs to a portal-only hotel group whose mail servers reject or fail to route external job applications. Please apply via the official careers portal${portalUrl ? ` (${portalUrl})` : ''}.`,
    };
  }

  // 4. Check if employer name matches a strictly verified HR contact in EMPLOYER_NAME_VERIFIED_FALLBACKS
  if (empClean) {
    for (const fb of EMPLOYER_NAME_VERIFIED_FALLBACKS) {
      if (fb.match.test(empClean)) {
        const matchedEmail = fb.email.toLowerCase();
        return {
          originalEmail: clean,
          verifiedEmail: matchedEmail,
          wasCorrected: Boolean(clean && clean !== matchedEmail),
          isDeliverable: true,
          verificationSource: fb.source,
          sourceUrl: fb.sourceUrl,
          foundOnPage: fb.foundOnPage,
          contactType: fb.contactType,
          verificationDate: todayIso,
          confidence: fb.confidence,
          contactStatus: 'Verified Hiring Contact',
          officialPortalUrl: fb.officialPortalUrl,
          bouncePreventionNote:
            clean && clean !== matchedEmail
              ? `Resolved verified official HR contact (${matchedEmail}) for ${empClean}.`
              : undefined,
        };
      }
    }
  }

  if (!clean) {
    const portalUrl = jobUrl || inferOfficialPortalUrl('', empClean);
    return {
      originalEmail: '',
      verifiedEmail: '',
      wasCorrected: false,
      isDeliverable: false,
      verificationSource: portalUrl || 'none',
      sourceUrl: portalUrl,
      foundOnPage: portalUrl ? 'Employer Careers Page (Portal Application)' : 'No verified hiring contact found',
      contactType: portalUrl ? 'Official Portal Only' : 'No Verified Hiring Contact',
      verificationDate: todayIso,
      confidence: 'None',
      contactStatus: 'Unverified',
      officialPortalUrl: portalUrl,
      bouncePreventionNote: 'No verified hiring contact found — apply via official employer careers portal.',
    };
  }

  // 5. Authorized self-test address (primary fazle.rabbe.doc@gmail.com + legacy fazlerabbe905@gmail.com)
  if (clean === 'fazle.rabbe.doc@gmail.com' || clean === 'fazlerabbe905@gmail.com') {
    return {
      originalEmail: clean,
      verifiedEmail: clean,
      wasCorrected: false,
      isDeliverable: true,
      verificationSource: 'Authorized Candidate Self-Test Inbox',
      sourceUrl: 'https://mail.google.com',
      foundOnPage: 'Candidate Self-Verification Inbox',
      contactType: 'Official Vacancy Channel',
      verificationDate: todayIso,
      confidence: 'High',
      contactStatus: 'Verified Hiring Contact',
    };
  }

  // 6. Any other address not in the verified registry is explicitly labeled "Unverified"
  // and never presented as a confirmed HR contact.
  const isExplicitHrPrefix = /^(?:hr|hrdpt|careers?|jobs?|jobb|posao|recruitment|recrutement|talent|people|personal|karriere|humanresources|hiring|apply|applications?|staffing|work)(?:[._-][a-z0-9]+)*@/i.test(
    clean
  );

  return {
    originalEmail: clean,
    verifiedEmail: clean,
    wasCorrected: false,
    isDeliverable: isExplicitHrPrefix,
    verificationSource: 'Unverified Contact (Not in Official HR Registry — Official Vacancy Link Prioritized)',
    sourceUrl: jobUrl || `https://${clean.split('@')[1] || ''}`,
    foundOnPage: 'Unverified Contact — Prioritize Official Application Link',
    contactType: 'Unverified Contact',
    verificationDate: todayIso,
    confidence: isExplicitHrPrefix ? 'Medium' : 'None',
    contactStatus: 'Unverified',
    officialPortalUrl: jobUrl || inferOfficialPortalUrl(clean, empClean) || undefined,
    bouncePreventionNote: isExplicitHrPrefix
      ? 'Contact is unverified against our confirmed HR registry. Prioritize the official application link when available.'
      : 'Unverified contact address. Do not assume this email is an active HR inbox — use the official vacancy application link.',
  };
}
