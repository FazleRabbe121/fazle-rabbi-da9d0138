/**
 * Multi-Factor Sponsorship Evaluation & Candidate Matching Engine
 *
 * Uses transparent, evidence-backed sponsorship categories:
 * - Confirmed by Official Evidence
 * - Strong Evidence — Employer Confirmation Required
 * - Possible — Needs Verification
 * - Not Mentioned
 * - Not Eligible
 *
 * Never fabricates 100% sponsorship guarantees unless an actual verifiable guarantee exists.
 */

import { detectVisaSponsorship } from './sponsorshipDetection';
import { getCountryProfileById } from './countryPriorityService';

export type TransparentSponsorshipCategory =
  | 'Confirmed by Official Evidence'
  | 'Strong Evidence — Employer Confirmation Required'
  | 'Possible — Needs Verification'
  | 'Not Mentioned'
  | 'Not Eligible';

export interface EvaluatedSponsorshipRecord {
  // Score & Status
  sponsorshipScore: number; // 0 - 98 (never fabricates 100% guarantee)
  sponsorshipStatus: 'confirmed' | 'strong_evidence' | 'possible' | 'not_mentioned' | 'not_available';
  transparentCategory: TransparentSponsorshipCategory;
  statusBadgeLabel: TransparentSponsorshipCategory;
  badgeTone: 'emerald' | 'indigo' | 'amber' | 'slate' | 'rose';

  // Scoring Breakdown
  breakdown: {
    explicitTextEvidenceScore: number; // 0 - 35
    employerSponsorshipTrackRecordScore: number; // 0 - 20
    occupationImmigrationFeasibilityScore: number; // 0 - 25
    candidateProfileMatchScore: number; // 0 - 20
  };

  // Specific Evidence Quotes & Official Sources
  extractedEvidenceQuotes: string[];
  visaRouteDetected: string;
  officialRouteDescription: string;
  officialAuthorityUrl?: string;
  officialSourceName?: string;

  // Candidate Specific Feasibility for Non-EU / Bangladeshi Passport
  bangladeshiPassportFeasibility: 'High' | 'Moderate' | 'Low / Strict Rules' | 'Disqualified';
  feasibilityExplanation: string;

  // Red Flags & Cautions
  redFlagsDetected: string[];
  isAuthenticDirectEmployer: boolean;
  requiresExternalPortal: boolean;

  // Accommodation & Relocation Perks
  accommodationIncluded: boolean;
  relocationIncluded: boolean;
  skillsPassMandatory: boolean;
  industryDetected?: string;
}

export function detectJobIndustry(title: string, employer: string, notes: string = ''): string {
  const text = `${title} ${employer} ${notes}`.toLowerCase();
  if (/software|developer|engineer|data|devops|cloud|cyber|it support|frontend|backend|fullstack/i.test(text)) {
    return 'Technology & Engineering';
  }
  if (/nurse|caregiver|healthcare|medical|carer|hospital|clinic|pharmacy/i.test(text)) {
    return 'Healthcare & Caregiving';
  }
  if (/chef|cook|culinary|kitchen|pastry|sous chef|commis/i.test(text)) {
    return 'Culinary & Kitchen';
  }
  if (/logistics|warehouse|supply chain|driver|forklift|freight|shipping/i.test(text)) {
    return 'Logistics & Supply Chain';
  }
  if (/construction|electrician|plumber|welder|technician|carpenter|maintenance|hvac/i.test(text)) {
    return 'Skilled Trades & Technical';
  }
  if (/accountant|finance|marketing|sales|hr|operations|customer support|admin|analyst/i.test(text)) {
    return 'Business, Operations & Corporate';
  }
  if (/hotel|resort|front desk|concierge|housekeeping|guest relations|reception/i.test(text)) {
    return 'Hotel & Resort Operations';
  }
  return 'Hospitality, Beverage & Mixology';
}

export function evaluateHospitalitySponsorship(params: {
  title: string;
  employer: string;
  location: string;
  country: string;
  city?: string;
  jobDescription?: string;
  sourceNotes?: string;
  sponsorshipEvidence?: string;
  applicationUrl?: string;
  recipientEmail?: string;
}): EvaluatedSponsorshipRecord {
  const {
    title,
    employer,
    location,
    country,
    jobDescription = '',
    sourceNotes = '',
    sponsorshipEvidence = '',
    applicationUrl = '',
    recipientEmail = '',
  } = params;

  const combinedText = `${title} ${employer} ${location} ${country} ${jobDescription} ${sourceNotes} ${sponsorshipEvidence}`.toLowerCase();

  // 1. Audit Text via Strict Detection Engine
  const textAudit = detectVisaSponsorship(jobDescription, `${sourceNotes} ${sponsorshipEvidence}`);

  // 2. Fetch Official Country Immigration Intelligence
  const countryProfile = getCountryProfileById(country);

  // 3. Detect Industry & Target Role Alignment
  const industryDetected = detectJobIndustry(title, employer, `${jobDescription} ${sourceNotes}`);
  const candidateTargetKeywords = [
    'bartender',
    'barman',
    'barista',
    'mixologist',
    'cocktail',
    'hotel',
    'resort',
    'beverage',
    'sommelier',
    'hospitality',
    'chef',
    'waiter',
    'server',
    'supervisor',
    'manager',
    'operations',
    'specialist',
  ];
  const isTargetRole = candidateTargetKeywords.some(kw => combinedText.includes(kw));

  // 4. Red Flag Detection
  const redFlags: string[] = [];
  if (/whatsapp only|telegram only|pay for visa|visa processing fee|cash deposit|guaranteed visa 100%/i.test(combinedText)) {
    redFlags.push('High Risk Warning: Mentions upfront processing fees or unofficial messaging.');
  }
  if (!recipientEmail && !applicationUrl) {
    redFlags.push('No direct employer HR contact or career portal URL found.');
  }
  if (/recruitment agency fee|candidate pays|deducted from salary for visa/i.test(combinedText)) {
    redFlags.push('Illegal Fee Warning: Work authorization fees must be borne by employer.');
  }

  // Check if official registry / statutory permit evidence is explicitly cited
  const hasOfficialRegistryCitation =
    /licensed sponsor|home office|aewv|accredited employer|decreto flussi|metaklisi|identit[aà]|single permit|mup|hzz|aviz de angajare|lmia|subclass 482|gvva|visto d1|auslbg|work visa provided|visa sponsorship confirmed|sponsorship available for non-eu/i.test(
      `${sponsorshipEvidence} ${sourceNotes} ${jobDescription}`
    );

  const hasExplicitRestriction =
    textAudit.status === 'not_available' ||
    /eu citizens only|must have right to work in uk|must have existing right to work|no visa sponsorship|sponsorship not available/i.test(
      combinedText
    );

  // 5. Score Calculation
  let textScore = 0;
  if (hasExplicitRestriction) textScore = 0;
  else if (textAudit.status === 'confirmed' && hasOfficialRegistryCitation) textScore = 34;
  else if (textAudit.status === 'confirmed') textScore = 28;
  else if (textAudit.status === 'possible' || hasOfficialRegistryCitation) textScore = 20;
  else if (textAudit.status === 'not_mentioned') textScore = 8;

  // Employer Track Record & Reputation Score (0 - 20)
  let employerScore = 12;
  const isMajorInternationalSponsor =
    /ritz|marriott|fairmont|belmond|fourseasons|four seasons|hilton|kempinski|hyatt|accor|rocco forte|canaves|rosewood|mandarin oriental|corinthia|jumeirah|atlantis|nobu|bulgari|edition|waldorf|radisson|intercontinental|sofitel|raffles|badrutt/i.test(
      employer
    );
  if (isMajorInternationalSponsor) employerScore = 19;
  else if (/hotel|resort|palace|lounge|group|hospital|tech|logistics/i.test(employer)) employerScore = 15;

  // Immigration Feasibility Score (0 - 25)
  let immigrationScore = 15;
  let passportFeasibility: 'High' | 'Moderate' | 'Low / Strict Rules' | 'Disqualified' = 'Moderate';
  let feasibilityExplanation =
    'Eligible for third-country work-permit sponsorship subject to statutory employer authorization.';

  if (countryProfile) {
    if (countryProfile.recruitmentFeasibilityRating === 'High Seasonal Feasibility') {
      immigrationScore = 24;
      passportFeasibility = 'High';
      feasibilityExplanation = `${countryProfile.countryName} permits non-EU nationals via ${countryProfile.primaryWorkVisaRoute}.`;
    } else if (countryProfile.recruitmentFeasibilityRating === 'Moderate Quota-Dependent') {
      immigrationScore = 20;
      passportFeasibility = 'Moderate';
      feasibilityExplanation = `${countryProfile.countryName} allows work permit sponsorship within statutory quotas or labor market clearances.`;
    } else if (countryProfile.recruitmentFeasibilityRating === 'Strict Labor Market Test') {
      immigrationScore = 14;
      passportFeasibility = 'Moderate';
      feasibilityExplanation = `Labor market clearance required in ${countryProfile.countryName} before non-EU work permit issuance.`;
    } else {
      if (countryProfile.id === 'uk') {
        const meetsSkilledThreshold = /senior|head|lead|manager|supervisor|chef|engineer|nurse|specialist/i.test(title);
        if (meetsSkilledThreshold) {
          immigrationScore = 18;
          passportFeasibility = 'Moderate';
          feasibilityExplanation =
            'Qualifying supervisory/skilled roles can be sponsored under UK Skilled Worker Visa if salary thresholds (£38,700 or applicable going rate) are met by a Home Office Licensed Sponsor.';
        } else {
          immigrationScore = 7;
          passportFeasibility = 'Low / Strict Rules';
          feasibilityExplanation =
            'Standard entry-level bar roles face strict UK Skilled Worker occupation & salary thresholds unless sponsored under a qualifying supervisory classification.';
        }
      } else if (countryProfile.id === 'ireland') {
        const isEligibleIrishRole = /chef|manager|engineer|nurse|healthcare|specialist|analyst/i.test(title);
        if (isEligibleIrishRole) {
          immigrationScore = 18;
          passportFeasibility = 'Moderate';
          feasibilityExplanation = 'Eligible occupation for Ireland DETE General or Critical Skills Employment Permit.';
        } else {
          immigrationScore = 7;
          passportFeasibility = 'Low / Strict Rules';
          feasibilityExplanation =
            'Standard bar staff are listed on Ireland DETE Ineligible Categories of Employment unless hired under an eligible management or culinary classification.';
        }
      }
    }
  }

  // Candidate Match Score (0 - 20)
  let candidateScore = 13;
  if (isTargetRole) candidateScore += 4;
  if (/english/i.test(combinedText)) candidateScore += 2;

  // Final Total Score (capped at 96 — never fabricate a 100% guarantee)
  let totalScore = Math.min(96, textScore + employerScore + immigrationScore + candidateScore);
  if (hasExplicitRestriction) {
    totalScore = Math.min(totalScore, 18);
    passportFeasibility = 'Disqualified';
  }

  // Classify into the 5 transparent categories requested by user
  let transparentCategory: TransparentSponsorshipCategory = 'Not Mentioned';
  let finalStatus: EvaluatedSponsorshipRecord['sponsorshipStatus'] = 'not_mentioned';
  let badgeTone: EvaluatedSponsorshipRecord['badgeTone'] = 'slate';

  if (hasExplicitRestriction || passportFeasibility === 'Disqualified') {
    transparentCategory = 'Not Eligible';
    finalStatus = 'not_available';
    badgeTone = 'rose';
    totalScore = Math.min(totalScore, 20);
  } else if (textAudit.status === 'confirmed' && hasOfficialRegistryCitation) {
    transparentCategory = 'Confirmed by Official Evidence';
    finalStatus = 'confirmed';
    badgeTone = 'emerald';
    totalScore = Math.max(86, Math.min(96, totalScore));
  } else if (textAudit.status === 'confirmed' || hasOfficialRegistryCitation || (isMajorInternationalSponsor && immigrationScore >= 20)) {
    transparentCategory = 'Strong Evidence — Employer Confirmation Required';
    finalStatus = 'strong_evidence';
    badgeTone = 'indigo';
    totalScore = Math.max(76, Math.min(88, totalScore));
  } else if (textAudit.status === 'possible' || immigrationScore >= 14) {
    transparentCategory = 'Possible — Needs Verification';
    finalStatus = 'possible';
    badgeTone = 'amber';
    totalScore = Math.max(58, Math.min(75, totalScore));
  } else {
    transparentCategory = 'Not Mentioned';
    finalStatus = 'not_mentioned';
    badgeTone = 'slate';
    totalScore = Math.min(55, totalScore);
  }

  const quotes: string[] = [];
  if (sponsorshipEvidence) {
    quotes.push(sponsorshipEvidence);
  }
  if (textAudit.evidence && textAudit.evidence !== 'No sponsorship or right-to-work terms detected in posting.' && !quotes.includes(textAudit.evidence)) {
    quotes.push(textAudit.evidence);
  }
  if (quotes.length === 0) {
    if (transparentCategory === 'Strong Evidence — Employer Confirmation Required') {
      quotes.push(`International employer (${employer}) operating in ${country} with active third-country work permit route (${countryProfile?.primaryWorkVisaRoute || 'National Work Permit'}); confirm CoS/quota allocation directly with HR.`);
    } else if (transparentCategory === 'Possible — Needs Verification') {
      quotes.push(`Legally available work-permit pathway in ${country} (${countryProfile?.primaryWorkVisaRoute || 'Statutory Employer Work Permit'}), but posting does not explicitly state visa sponsorship.`);
    } else if (transparentCategory === 'Not Eligible') {
      quotes.push('Posting or national occupation rules restrict non-EU work permit sponsorship for this specific role.');
    } else {
      quotes.push('Sponsorship is not explicitly mentioned in the job listing; applicant should inquire with employer HR.');
    }
  }

  return {
    sponsorshipScore: totalScore,
    sponsorshipStatus: finalStatus,
    transparentCategory,
    statusBadgeLabel: transparentCategory,
    badgeTone,
    breakdown: {
      explicitTextEvidenceScore: textScore,
      employerSponsorshipTrackRecordScore: employerScore,
      occupationImmigrationFeasibilityScore: immigrationScore,
      candidateProfileMatchScore: candidateScore,
    },
    extractedEvidenceQuotes: quotes,
    visaRouteDetected: countryProfile?.primaryWorkVisaRoute || 'Employer-Sponsored Work Authorization',
    officialRouteDescription:
      countryProfile?.seasonalQuotaRules ||
      'Subject to national immigration and labor authority work-permit approval.',
    officialAuthorityUrl: countryProfile?.officialImmigrationUrl,
    officialSourceName: countryProfile?.officialImmigrationAuthority || `${country} Ministry of Labor / Immigration Portal`,
    bangladeshiPassportFeasibility: passportFeasibility,
    feasibilityExplanation,
    redFlagsDetected: redFlags,
    isAuthenticDirectEmployer: !redFlags.some(f => f.includes('High Risk')),
    requiresExternalPortal: Boolean(!recipientEmail && applicationUrl),
    accommodationIncluded:
      textAudit.accommodationProvided || /accommodation|housing|room and board|staff housing|lodging/i.test(combinedText),
    relocationIncluded: textAudit.relocationSupport || /relocation|flight|allowance/i.test(combinedText),
    skillsPassMandatory: Boolean(countryProfile?.skillsPassRequired),
    industryDetected,
  };
}
