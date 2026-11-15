export type JobMarket = 'cyprus' | 'europe' | 'sponsorship';

export type JobLifeCycleStatus =
  | 'discovered'
  | 'viewed'
  | 'verified'
  | 'needs_review'
  | 'ready_to_apply'
  | 'approved'
  | 'sent'
  | 'delivery_failed'
  | 'replied'
  | 'applied';

export interface PreparedJobApplication {
  id: string;
  searchId?: string;
  companyDomain?: string;
  market?: JobMarket;
  company: string;
  position: string;
  city?: string;
  country?: string;
  location: string;
  email?: string;
  recipientEmail: string;
  emailVerificationStatus: 'verified' | 'needs_review';
  emailVerificationReason?: string;
  contactSourceUrl?: string;
  contactFoundOnPage?: string;
  contactType?: string;
  contactVerificationDate?: string;
  contactConfidence?: 'High' | 'Medium' | 'None';
  contactStatus?: 'Verified Hiring Contact' | 'No verified hiring contact found';
  officialPortalUrl?: string;
  sendingAccount?: string;
  attemptCount?: number;
  lastAttemptAt?: string;
  jobPostingDate?: string;
  jobPostingDateVerified?: boolean;
  jobUrl?: string;
  applicationUrl?: string;
  jobStatus?: 'verified' | 'needs_review';
  subject: string;
  applicationMessage?: string;
  coverLetter: string;
  selectedCvId: string;
  cvTitle: string;
  sourceUrl?: string;
  sourceNotes?: string;
  verificationStatus: 'verified' | 'needs_review';
  reviewReason?: string;
  sponsorshipStatus?:
    | 'Confirmed by Official Evidence'
    | 'Possible — Needs Employer Confirmation'
    | 'Not Mentioned'
    | 'Not Available / Not Eligible'
    | 'Needs Review'
    | string;
  sponsorshipEvidence?: string;
  sponsorshipAssessment?: string;
  sponsorshipFeasibility?: 'High' | 'Medium' | 'Low' | 'Not Available' | string;
  sponsorshipRationale?: string;
  legalRoute?: string;
  isFastestRoute?: boolean;
  sixMonthSponsorshipScore?: number; // 0 - 100% feasibility score
  sixMonthTimelineViable?: boolean; // Can be completed before April 18, 2027
  targetDate?: string; // 'April 18, 2027'
  permitType?: string; // e.g. 'EU Seasonal Work Permit' | 'National Employment Work Permit' | 'Shortage Occupation'
  processingTimeline?: string; // e.g. '4–8 weeks (Well within 6-month goal)'
  quotaStatus?: string; // e.g. 'Active statutory quota allocation for 2026/2027 intake'
  nonEuHiringEvidence?: string; // e.g. 'Employer verified hiring international candidates with relocation support'
  roleMatchReason?: string;
  atsMatchScore?: number;
  atsMatchedSkills?: string[];
  verifiedBy: string; // e.g. 'Gemini AI (Verified)'
  isDuplicate: boolean;
  duplicateReason?: string;
  isApproved: boolean; // User manual approval flag
  status:
    | 'draft'
    | 'queued'
    | 'sending'
    | 'accepted_by_gmail'
    | 'delivery_unconfirmed'
    | 'temporary_delivery_failure'
    | 'delivered'
    | 'bounced'
    | 'failed'
    | 'failed_to_send'
    | 'rate_limited'
    | 'needs_action'
    | 'needs_review'
    | 'pending_approval'
    | 'approved'
    | 'sent'
    | 'delivery_failed'
    | 'applied';
  deliveryStatus?:
    | 'sent_accepted_by_gmail'
    | 'accepted_by_gmail'
    | 'delivery_unconfirmed'
    | 'temporary_delivery_failure'
    | 'delivered'
    | 'delivery_failed'
    | 'bounced'
    | 'failed_to_send'
    | 'rate_limited'
    | 'needs_action'
    | 'needs_review'
    | 'pending'
    | 'queued'
    | 'sending';
  sentTimestamp?: string;
  appliedAt?: number;
  isNewVacancy?: boolean;
  overrideCooldown?: boolean;
  firstDiscoveredAt?: number;
  lastSeenAt?: number;
  viewedAt?: number;
  lifeCycleStatus?: JobLifeCycleStatus;
  errorReason?: string;
  messageId?: string;
  threadId?: string;
  replyStatus?: 'none' | 'checked_no_reply' | 'reply_received' | 'bounced';
  replySnippet?: string;
  replyDate?: string;
}

export interface JobFilterSettings {
  market: JobMarket;
  roles: string[];
  locations: string[];
  selectedCvId: string;
  selectedCvTitle: string;
}

export const DEFAULT_HOSPITALITY_ROLES: string[] = [
  'Bartender',
  'Barman',
  'Barista',
  'Mixologist',
  'Hotel Bar',
  'Restaurant Bar',
  'Pool Bar',
  'Lobby Bar',
  'Café',
  'Hospitality/Beverage positions',
];

export const DEFAULT_CYPRUS_LOCATIONS: string[] = [
  'Limassol Marina & City, Cyprus',
  'Paphos, Cyprus',
  'Ayia Napa & Protaras, Cyprus',
  'Larnaca, Cyprus',
  'Nicosia, Cyprus',
  'Polis Chrysochous, Cyprus',
];

export const DEFAULT_EUROPE_LOCATIONS: string[] = [
  'Greece (Athens, Santorini, Mykonos, Crete, Rhodes)',
  'Malta (Valletta, St. Julian\'s)',
  'Italy (Rome, Milan, Venice, Amalfi Coast)',
  'Spain (Barcelona, Madrid, Ibiza, Mallorca)',
  'Portugal (Lisbon, Porto, Algarve)',
  'France (Paris, French Riviera, Nice, Cannes)',
  'Germany (Berlin, Munich, Hamburg)',
  'Austria (Vienna, Salzburg, Innsbruck)',
  'Netherlands (Amsterdam, Rotterdam)',
  'Belgium (Brussels, Antwerp)',
  'Ireland (Dublin, Cork, Galway)',
  'Switzerland (Zurich, Geneva, St. Moritz)',
  'Croatia (Dubrovnik, Split, Hvar)',
  'Poland, Czechia & Central Europe',
  'Nordics (Sweden, Denmark, Norway, Finland)',
  'United Kingdom (London, Edinburgh)',
];
