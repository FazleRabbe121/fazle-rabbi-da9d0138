// ========================================================
// Central Data Models for Job Search, Country Selection,
// Visa Sponsorship Verification, Cooperative AI, & Career Tracking
// ========================================================

export type CountryRegion =
  | 'European Union'
  | 'Schengen Area'
  | 'Europe (Non-EU)'
  | 'Oceania'
  | 'North America'
  | 'Middle East & Gulf'
  | 'Asia-Pacific'
  | 'Global';

export type VisaSponsorshipStatus =
  | 'confirmed'
  | 'possible'
  | 'not_mentioned'
  | 'not_available';

export type SponsorshipVerificationLevel =
  | 'level_1_confirmed'
  | 'level_2_mentioned'
  | 'level_3_unverified';

export type SponsorshipFilterMode =
  | 'all_jobs'
  | 'sponsorship_only'
  | 'work_permit_support'
  | 'visa_sponsorship'
  | 'employer_sponsored';

export interface CountryEntity {
  id: string;
  name: string;
  isoCode: string;
  region: CountryRegion;
  euMember: boolean;
  schengenMember: boolean;
  currency: string;
  currencySymbol: string;
  officialLanguages: string[];
  visaSponsorshipAvailable: boolean;
  workPermitRoutes: string[];
  flagEmoji: string;
}

export interface JobSourceEntity {
  id: string;
  name: string;
  type: 'official_government' | 'hospitality_board' | 'employer_direct' | 'global_job_board' | 'recruitment_agency';
  countryFocus: string;
  verified: boolean;
  url: string;
}

export interface JobSourceConfig {
  sourceId: string;
  sourceName: string;
  type: 'verified_employer' | 'curated_feed' | 'rss_aggregator' | 'gemini_grounded_search' | 'official_portal';
  active: boolean;
  rateLimitPerMinute: number;
  status: 'healthy' | 'degraded' | 'offline';
}

export function isDuplicateJob(a: Partial<JobEntity>, b: Partial<JobEntity>): boolean {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const urlNorm = (u?: string) =>
    (u || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  const aKey = `${norm(a.company)}_${norm(a.title)}_${norm(a.country || a.location)}`;
  const bKey = `${norm(b.company)}_${norm(b.title)}_${norm(b.country || b.location)}`;
  if (aKey.length > 4 && aKey === bKey) return true;
  const aUrl = urlNorm(a.sourceUrl || a.applicationUrl);
  const bUrl = urlNorm(b.sourceUrl || b.applicationUrl);
  if (aUrl && bUrl && aUrl === bUrl && norm(a.title) === norm(b.title) && norm(a.company) === norm(b.company)) {
    return true;
  }
  return false;
}

export interface AIVerificationRecord {
  geminiAnalysis?: {
    providerName: 'Gemini';
    model: string;
    processingTimeMs: number;
    sponsorshipLevel: SponsorshipVerificationLevel;
    sponsorshipEvidence: string;
    extractedRoleCategory: string;
    isDuplicateCandidate: boolean;
    summary: string;
  };
  openaiAnalysis?: {
    providerName: 'OpenAI';
    model: string;
    processingTimeMs: number;
    sponsorshipLevel: SponsorshipVerificationLevel;
    compatibilityScore: number;
    qualityPassed: boolean;
    missingOrSuspiciousFlags: string[];
    verificationNote: string;
  };
  consensusStatus:
    | 'verified_agreement'
    | 'conflict_flagged'
    | 'single_provider_verified'
    | 'source_evidence_only';
  providersUsed: string[];
  processingTimeMs: number;
  modelNames: string[];
  conflictNotes?: string[];
  verifiedAt: string;
}

export interface JobEntity {
  id: string;
  title: string;
  company: string;
  country: string;
  city: string;
  location: string;
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  jobType: 'full-time' | 'part-time' | 'seasonal' | 'contract' | 'permanent' | 'temporary';
  workplaceType: 'on-site' | 'hybrid' | 'remote';
  datePosted: string;
  applicationDeadline?: string;
  experienceRequired: string;
  requiredExperienceYears: number;
  visaSponsorshipStatus: VisaSponsorshipStatus;
  sponsorshipVerificationLevel?: SponsorshipVerificationLevel;
  sponsorshipEvidence: string | string[];
  sponsorshipReason: string;
  workPermitSupport: boolean;
  employerSponsored?: boolean;
  relocationSupport: boolean;
  accommodationProvided: boolean;
  mealsProvided?: boolean;
  immediateHiring?: boolean;
  matchScore: number;
  matchedReasons: string[];
  potentialIssues: string[];
  source: string;
  sourceId: string;
  sourceUrl: string;
  applicationUrl: string;
  recipientEmail: string;
  description: string;
  industry: string;
  jobCategory?: string;
  skillsRequired?: string[];
  languageRequirements?: string[];
  educationLevel?: string;
  verificationStatus?: 'verified_active' | 'ai_cooperative_verified' | 'conflict_review' | 'reported_invalid';
  aiVerificationRecord?: AIVerificationRecord;
  createdAt: string;
}

export interface SavedJobRecord {
  id: string;
  jobId: string;
  userId: string;
  job: JobEntity;
  savedAt: string;
  notes?: string;
}

export type ApplicationStatus =
  | 'new'
  | 'ready_to_apply'
  | 'preparing'
  | 'in_progress'
  | 'submitted'
  | 'submission_confirmed'
  | 'email_sent'
  | 'external_opened'
  | 'failed'
  | 'requires_manual_action'
  | 'rejected'
  | 'interview'
  | 'offer_received'
  // Legacy / compatible statuses preserved
  | 'viewed'
  | 'saved'
  | 'applied'
  | 'under_review'
  | 'offer'
  | 'withdrawn'
  | 'expired';

export interface ApplicationTimelineEvent {
  id: string;
  date: string;
  status: ApplicationStatus;
  note: string;
}

export interface ApplicationRecord {
  id: string;
  jobId: string;
  userId: string;
  jobTitle: string;
  company: string;
  location: string;
  country: string;
  appliedDate: string;
  appliedTimestamp: number;
  status: ApplicationStatus;
  submissionMethod?: 'official_external' | 'gmail_api' | 'authorized_platform';
  selectedCvId?: string;
  selectedCvTitle?: string;
  gmailMessageId?: string;
  externalConfirmed?: boolean;
  errorReason?: string;
  interviewDate?: string;
  salaryOffered?: string;
  contactPerson?: string;
  notes?: string;
  applicationUrl?: string;
  sourceUrl?: string;
  followUpDate?: string;
  timeline: ApplicationTimelineEvent[];
  updatedAt: string;
}

export interface JobAlertConfig {
  id: string;
  userId: string;
  name: string;
  jobTitle: string;
  countries: string[];
  sponsorshipRequired: boolean;
  minMatchScore: number;
  active: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
}

export interface SavedSearchQuery {
  id: string;
  userId: string;
  name: string;
  keywords: string;
  country: string;
  countries?: string[];
  visaSponsorshipOnly: boolean;
  sponsorshipMode?: SponsorshipFilterMode;
  jobType?: string;
  minSalary?: number;
  createdAt: string;
}

export interface UserSearchPreferences {
  preferredJobTitles: string[];
  preferredCountries: string[];
  excludedCountries: string[];
  sponsorshipOnly: boolean;
  sponsorshipFilterMode: SponsorshipFilterMode;
  preferredSponsorshipLevels: SponsorshipVerificationLevel[];
  preferredEmploymentTypes: string[];
  minSalaryExpectation: number;
  salaryCurrency: string;
  accommodationRequired: boolean;
  mealsRequired: boolean;
  experienceLevel: 'any' | 'entry' | 'mid' | 'senior';
  searchFrequencyMinutes: number;
  preferredJobSources: string[];
  minVisibleQueue: number;
  targetVisibleQueue: number;
  updatedAt: string;
}

export interface CareerProfile {
  id: string;
  fullName: string;
  targetJobTitles: string[];
  skills: string[];
  yearsOfExperience: number;
  preferredCountries: string[];
  languages: { language: string; proficiency: string }[];
  visaStatus: 'requires_sponsorship' | 'eu_citizen' | 'work_permit_holder';
  expectedSalaryMin: number;
  expectedSalaryCurrency: string;
  relocationWillingness: boolean;
  updatedAt: string;
}
