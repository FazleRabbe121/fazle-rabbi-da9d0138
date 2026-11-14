import { PreparedJobApplication } from '../types/jobApplication';
import { auth } from './firebase';
import { persistAppliedJobs } from './userDataPersistenceService';
import { resolveVerifiedEmployerEmail } from '../utils/verifiedEmployerEmails';

export const APPLIED_JOB_COOLDOWN_MS = 10 * 24 * 60 * 60 * 1000; // 10 Days in milliseconds for general jobs
export const SPONSORSHIP_FOLLOWUP_COOLDOWN_MS = 4 * 24 * 60 * 60 * 1000; // 4-5 Days in milliseconds for sponsorship follow-up

export type JobMarketType = 'cyprus' | 'europe' | 'sponsorship';

export interface PreviousSubmissionEntry {
  timestamp: number;
  dateStr: string;
  gmailMessageId?: string;
  cvId?: string;
  cvTitle?: string;
  subject?: string;
  recipientEmail?: string;
  responseStatus?: 'awaiting_response' | 'reply_received' | 'rejected' | 'bounced';
}

export interface AppliedJobRecord {
  id: string;
  jobId: string;
  company: string;
  position: string;
  country?: string;
  location?: string;
  jobUrl: string;
  sourceUrl?: string;
  recipientEmail: string;
  applicationDate: string; // Human / ISO date string
  appliedTimestamp: number; // Epoch timestamp (ms)
  appliedAt: number; // Epoch timestamp (ms) alias
  gmailMessageId?: string;
  applicationStatus: string;
  market: 'cyprus' | 'europe' | 'sponsorship';
  cvId?: string;
  cvTitle?: string;
  subject?: string;
  coverLetter?: string;
  coverLetterSnippet?: string;
  employerResponseReceived?: boolean;
  employerResponded?: boolean;
  employerResponseSnippet?: string;
  employerResponseDate?: string;
  email?: string;
  responseStatus?: 'awaiting_response' | 'reply_received' | 'interview_invited' | 'rejected' | 'bounced';
  responseHistory?: Array<{ timestamp: string; status: string; note: string }>;
  submissionCount?: number;
  previousSubmissions?: PreviousSubmissionEntry[];
}

export type GranularSubmissionStatus =
  | 'prepared'
  | 'sending'
  | 'accepted_by_provider'
  | 'accepted_by_gmail'
  | 'delivery_confirmed'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'submitted_portal'
  | 'submitted'
  | 'pending';

export interface BackendJobRecord {
  id: string;
  sourceId?: string;
  canonicalKey: string;
  employer: string;
  title: string;
  position: string;
  city: string;
  country: string;
  location: string;
  sourceName: string;
  sourceUrl?: string;
  originalJobUrl: string;
  applicationUrl: string;
  applicationMethod?: 'email' | 'portal' | 'both';
  recipientEmail: string;
  emailVerificationStatus: 'verified' | 'unverified' | 'needs_review';
  contactLabel?: 'Verified HR Contact' | 'Unverified' | 'Official Portal Only';
  emailVerificationReason?: string;
  market: JobMarketType;
  sponsorshipEvidence?: string;
  sponsorshipStatus: 'confirmed' | 'possible' | 'unverified' | 'not_available';
  firstDiscoveredDate: string;
  lastCheckedDate: string;
  lastVerificationTime?: string;
  jobStatus: 'active' | 'expired' | 'closed' | 'needs_review';
  status?: 'unapplied' | 'applied' | 'dismissed' | 'archived';
  applicationStatus:
    | 'discovered'
    | 'new_eligible'
    | 'saved'
    | 'selected'
    | 'prepared'
    | 'sending'
    | 'queued'
    | 'accepted_by_provider'
    | 'delivery_confirmed'
    | 'submitted_portal'
    | 'submitted'
    | 'bounced'
    | 'failed'
    | 'hidden'
    | 'expired';
  submissionLifecycleStatus?: GranularSubmissionStatus;
  applicationHistory: Array<{
    timestamp: string;
    method: 'gmail' | 'portal';
    status: GranularSubmissionStatus;
    statusLabel?: string;
    cvId?: string;
    cvTitle?: string;
    subject?: string;
    coverLetter?: string;
    coverLetterSnippet?: string;
    sourceUrl?: string;
    attachments?: string[];
    gmailMessageId?: string;
    errorReason?: string;
    notes?: string;
    responseStatus?: string;
  }>;
  responseStatus?: 'awaiting_response' | 'reply_received' | 'interview_invited' | 'rejected' | 'bounced';
  responseHistory?: Array<{ timestamp: string; status: string; note: string }>;
  isDisplayed: boolean;
  displayBatchIndex?: number;
  sourceNotes?: string;
  sponsorshipScore?: number;
  visaRouteDetected?: string;
  bangladeshiPassportFeasibility?: 'High' | 'Moderate' | 'Low / Strict Rules' | 'Disqualified';
  feasibilityExplanation?: string;
  accommodationIncluded?: boolean;
  relocationIncluded?: boolean;
  skillsPassMandatory?: boolean;
  redFlagsDetected?: string[];
  postingDate?: string;
  postingDateVerified?: boolean;
  postingDateStatus?: 'Verified Recent' | 'Needs Review';
  followUpEligible?: boolean;
  daysSinceApplied?: number;
  lastErrorReason?: string;
  company?: string;
  source?: string;
  sourcePortal?: string;
  discoveredAt?: string;
  lastUsedCoverLetter?: string;
  lastUsedCvId?: string;
  lastUsedCvTitle?: string;
  lastUsedSubject?: string;
}

export interface BatchResponse {
  market: JobMarketType;
  batch: BackendJobRecord[];
  batchSize: number;
  currentBatchIndex: number;
  totalEligibleRemaining: number;
  allBatchCompleted: boolean;
  noMoreJobsAvailable?: boolean;
  totalDiscovered: number;
  backgroundPoolCount?: number;
  lastSearchTime: string;
}

const STORAGE_KEY_APPLIED = 'ccd_applied_jobs_history_v2';
const STORAGE_KEY_JOBS_DB = 'ccd_persistent_job_database_v2';
const STORAGE_KEY_ACTIVE_MARKET = 'ccd_selected_job_market_v2';

// ----------------------------------------------------
// Backend API Services for 5-Job Batches & Discovery
// ----------------------------------------------------

export async function fetchJobBatch(
  market: JobMarketType,
  batchSize: number = 5
): Promise<BatchResponse> {
  try {
    const res = await fetch(`/api/jobs/batch?market=${market}&batchSize=${batchSize}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.batch)) {
        data.batch = data.batch.map((job: BackendJobRecord) => {
          const emailRes = resolveVerifiedEmployerEmail({
            email: job.recipientEmail,
            employer: job.employer,
            jobUrl: job.applicationUrl || job.originalJobUrl,
          });
          if (emailRes.contactStatus === 'Verified Hiring Contact' && emailRes.isDeliverable && emailRes.verifiedEmail) {
            return {
              ...job,
              recipientEmail: emailRes.verifiedEmail,
              emailVerificationStatus: 'verified' as const,
              contactLabel: 'Verified HR Contact' as const,
              emailVerificationReason: emailRes.bouncePreventionNote || `Verified official contact (${emailRes.verificationSource})`,
            };
          }
          if (emailRes.contactStatus === 'Unverified') {
            return {
              ...job,
              recipientEmail: emailRes.isDeliverable ? emailRes.verifiedEmail : '',
              emailVerificationStatus: 'unverified' as const,
              contactLabel: 'Unverified' as const,
              emailVerificationReason: emailRes.bouncePreventionNote || 'Unverified contact — prioritize official vacancy link.',
            };
          }
          return {
            ...job,
            recipientEmail: '',
            emailVerificationStatus: 'needs_review' as const,
            contactLabel: 'Official Portal Only' as const,
          };
        });
      }
      return data;
    }
  } catch (err) {
    console.warn('Backend fetchJobBatch error:', err);
  }

  // Graceful fallback if offline
  return {
    market,
    batch: [],
    batchSize,
    currentBatchIndex: 0,
    totalEligibleRemaining: 0,
    allBatchCompleted: false,
    noMoreJobsAvailable: false,
    totalDiscovered: 0,
    lastSearchTime: new Date().toLocaleTimeString(),
  };
}

export async function submitApplicationToBackend(params: {
  jobId: string;
  market?: JobMarketType;
  method?: 'gmail' | 'portal';
  status?: GranularSubmissionStatus;
  submissionLifecycleStatus?: GranularSubmissionStatus;
  employer?: string;
  title?: string;
  country?: string;
  city?: string;
  location?: string;
  sourceUrl?: string;
  applicationUrl?: string;
  recipientEmail?: string;
  sponsorshipEvidence?: string | string[];
  cvId?: string;
  cvTitle?: string;
  subject?: string;
  coverLetter?: string;
  attachments?: string[];
  gmailMessageId?: string;
  errorReason?: string;
  notes?: string;
  allowResend?: boolean;
  responseStatus?: 'awaiting_response' | 'reply_received' | 'interview_invited' | 'rejected' | 'bounced';
}): Promise<{
  success: boolean;
  job?: BackendJobRecord;
  batchCompleted: boolean;
  nextBatch?: BackendJobRecord[];
  duplicatePrevented?: boolean;
  errorReason?: string;
  totalEligibleRemaining?: number;
  noMoreJobsAvailable?: boolean;
  lastSearchTime?: string;
}> {
  try {
    const res = await fetch('/api/jobs/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend submitApplication error:', err);
  }
  return { success: false, batchCompleted: false };
}

export async function markJobExpiredInBackend(params: {
  jobId: string;
  status?: 'expired' | 'closed';
  reason?: string;
  market?: JobMarketType;
}): Promise<{ success: boolean; job?: BackendJobRecord; nextBatch?: BackendJobRecord[] }> {
  try {
    const res = await fetch('/api/jobs/mark-expired', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('markJobExpiredInBackend error:', err);
  }
  return { success: false };
}

export async function updateJobApplicationState(
  jobId: string,
  applicationStatus: BackendJobRecord['applicationStatus'],
  meta?: { employer?: string; title?: string; country?: string; applicationUrl?: string; market?: JobMarketType }
): Promise<boolean> {
  try {
    const res = await fetch('/api/jobs/update-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, applicationStatus, ...(meta || {}) }),
    });
    return res.ok;
  } catch (err) {
    console.warn('updateJobApplicationState error:', err);
    return false;
  }
}

export async function advanceJobBatch(market: JobMarketType): Promise<any> {
  try {
    const res = await fetch('/api/jobs/advance-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('advanceJobBatch error:', err);
  }
  return null;
}

export async function dismissJobFromBackend(
  jobId: string,
  market: JobMarketType = 'sponsorship',
  meta?: { employer?: string; title?: string; country?: string; applicationUrl?: string }
): Promise<{ success: boolean; nextBatch?: BackendJobRecord[] }> {
  try {
    const res = await fetch('/api/jobs/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, market, ...(meta || {}) }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('dismissJobFromBackend error:', err);
  }
  return { success: false };
}

export async function fetchApplicationHistoryFromBackend(
  statusFilter?: string | { includeAllStatuses?: boolean }
): Promise<BackendJobRecord[]> {
  try {
    const filterStr =
      typeof statusFilter === 'string' && !statusFilter.includes('[object') && statusFilter !== 'all'
        ? statusFilter.trim()
        : '';
    const url = filterStr
      ? `/api/jobs/application-history?status=${encodeURIComponent(filterStr)}`
      : '/api/jobs/application-history';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.history) ? data.history : [];
    }
  } catch (err) {
    console.warn('fetchApplicationHistory error:', err);
  }
  return [];
}

export async function fetchDaemonStatus(): Promise<any> {
  try {
    const res = await fetch('/api/jobs/continuous-status');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('fetchDaemonStatus error:', err);
  }
  return { active: true, status: 'Active (Local Fallback)' };
}

export async function triggerManualDiscovery(market?: JobMarketType): Promise<any> {
  try {
    const res = await fetch('/api/jobs/trigger-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('triggerManualDiscovery error:', err);
  }
  return null;
}

// ----------------------------------------------------
// Applied Jobs Tracking (10-Day Rule Persistence)
// ----------------------------------------------------

export function loadAppliedJobRecords(): AppliedJobRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_APPLIED);
    if (!raw) return [];
    const list: any[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const seenJobIds = new Set<string>();
    const deduped: AppliedJobRecord[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) continue;
      const company = String(item.company || item.employer || 'Hospitality Employer');
      const position = String(item.position || item.jobTitle || item.title || 'Hospitality Professional');
      const jobId = String(item.jobId || item.id || `app-${item.appliedTimestamp || Date.now()}-${i}`).trim();
      if (seenJobIds.has(jobId)) continue;
      seenJobIds.add(jobId);
      deduped.push({
        ...item,
        id: String(item.id || jobId),
        jobId,
        company,
        employer: company,
        position,
        jobTitle: position,
        jobUrl: String(item.jobUrl || item.applicationUrl || ''),
        recipientEmail: String(item.recipientEmail || item.email || ''),
        appliedAt: item.appliedAt || item.appliedTimestamp || Date.now(),
        appliedTimestamp: item.appliedTimestamp || item.appliedAt || Date.now(),
      });
    }
    return deduped;
  } catch (err) {
    console.warn('Failed to load applied jobs history:', err);
    return [];
  }
}

export function saveAppliedJobRecords(records: AppliedJobRecord[]): void {
  const seenJobIds = new Set<string>();
  const deduped = (Array.isArray(records) ? records : []).filter(r => {
    if (!r) return false;
    const key = String(r.jobId || r.id || '').trim();
    if (!key || seenJobIds.has(key)) return false;
    seenJobIds.add(key);
    return true;
  });
  try {
    localStorage.setItem(STORAGE_KEY_APPLIED, JSON.stringify(deduped));
    window.dispatchEvent(new CustomEvent('application_history_updated', { detail: deduped }));
  } catch (err) {
    console.warn('Failed to save applied jobs history:', err);
  }

  if (auth.currentUser?.uid) {
    persistAppliedJobs(auth.currentUser.uid, deduped).catch(err =>
      console.warn('Could not persist applied jobs to Firestore:', err)
    );
  }
}

export function recordAppliedJob(params: {
  job: Partial<PreparedJobApplication> | Partial<BackendJobRecord>;
  gmailMessageId?: string;
  status?: string;
  cvId?: string;
  cvTitle?: string;
  subject?: string;
  coverLetter?: string;
  sourceUrl?: string;
}): AppliedJobRecord {
  const existing = loadAppliedJobRecords();
  const now = Date.now();
  const dateStr = new Date().toISOString();

  const company = String((params.job as any).employer || (params.job as any).company || 'Hospitality Employer').trim();
  const position = String((params.job as any).position || (params.job as any).title || 'Senior Bartender').trim();
  const country = String((params.job as any).country || '').trim();
  const location = String((params.job as any).location || country || 'Europe').trim();
  const jobUrl = String((params.job as any).jobUrl || (params.job as any).applicationUrl || (params.job as any).originalJobUrl || (params.job as any).sourceUrl || '').trim();
  const recipientEmail = String((params.job as any).recipientEmail || (params.job as any).email || '').trim().toLowerCase();
  const jobId = String((params.job as any).id || `job-${now}`);

  const market: 'cyprus' | 'europe' | 'sponsorship' =
    params.job.market ||
    ((params.job as any).sponsorshipEvidence || (params.job as any).visaRouteDetected
      ? 'sponsorship'
      : String(params.job.location || '').toLowerCase().includes('cyprus')
      ? 'cyprus'
      : 'europe');

  const prevRecord = existing.find(
    r =>
      r.jobId === jobId ||
      (recipientEmail && r.recipientEmail?.toLowerCase() === recipientEmail && r.company?.toLowerCase() === company.toLowerCase()) ||
      (r.company?.toLowerCase() === company.toLowerCase() && r.position?.toLowerCase() === position.toLowerCase())
  );

  const newSubEntry: PreviousSubmissionEntry = {
    timestamp: now,
    dateStr,
    gmailMessageId: params.gmailMessageId,
    cvId: params.cvId,
    cvTitle: params.cvTitle || (params.job as any).cvTitle || 'Fazle Rabbi CV',
    subject: params.subject || (params.job as any).subject,
    recipientEmail,
    responseStatus: 'awaiting_response',
  };

  const previousSubmissions: PreviousSubmissionEntry[] = [
    newSubEntry,
    ...(prevRecord?.previousSubmissions || []),
  ];

  const newRecord: AppliedJobRecord = {
    id: prevRecord?.id || jobId,
    jobId: jobId,
    company,
    position,
    country,
    location,
    jobUrl,
    sourceUrl: jobUrl,
    recipientEmail,
    applicationDate: dateStr,
    appliedTimestamp: now,
    appliedAt: now,
    gmailMessageId: params.gmailMessageId,
    applicationStatus: params.status || 'applied',
    market,
    cvId: params.cvId || prevRecord?.cvId,
    cvTitle: params.cvTitle || (params.job as any).cvTitle || prevRecord?.cvTitle || 'Fazle Rabbi CV',
    subject: params.subject || (params.job as any).subject || prevRecord?.subject,
    coverLetter: params.coverLetter || (params.job as any).coverLetter || prevRecord?.coverLetter,
    coverLetterSnippet: (params.coverLetter || (params.job as any).coverLetter || prevRecord?.coverLetter || '').slice(0, 260),
    employerResponseReceived: false,
    responseStatus: 'awaiting_response',
    responseHistory: [
      {
        timestamp: dateStr,
        status: 'awaiting_response',
        note: params.gmailMessageId
          ? `Confirmed Gmail submission (${params.gmailMessageId}) — Awaiting employer response`
          : 'Confirmed portal submission — Awaiting employer response',
      },
      ...(prevRecord?.responseHistory || []),
    ],
    submissionCount: previousSubmissions.length,
    previousSubmissions,
  };

  const filtered = existing.filter(r => r.jobId !== jobId && r.id !== newRecord.id);
  const updated = [newRecord, ...filtered];
  saveAppliedJobRecords(updated);

  return newRecord;
}

export interface SponsorshipFollowUpEvaluation {
  status: 'fresh' | 'cooldown_active' | 'followup_ready' | 'response_received' | 'policy_restricted';
  canApply: boolean;
  isFollowUp: boolean;
  daysSinceApplied: number;
  daysUntilReappearance: number;
  employerPolicyPermitsResend: boolean;
  employerPolicyNote: string;
  record?: AppliedJobRecord;
}

/**
 * Evaluates a sponsorship job for Smart Reappearance (4-5 days rule):
 * - Checks if previously applied
 * - Checks if employer has already replied
 * - Checks employer's application policy before permitting resend
 * - Allows reappearance after ~4-5 days when no employer response has been received
 */
export function evaluateSponsorshipJobFollowUpEligibility(
  job: any,
  appliedRecords?: AppliedJobRecord[]
): SponsorshipFollowUpEvaluation {
  const records = appliedRecords || loadAppliedJobRecords();
  const now = Date.now();

  const targetId = String(job?.id || '').trim();
  const targetEmail = String(job?.recipientEmail || job?.contactEmail || job?.email || '').trim().toLowerCase();
  const targetCompany = String(job?.employer || job?.company || '').trim().toLowerCase();
  const targetPosition = String(job?.title || job?.position || '').trim().toLowerCase();

  // Check employer policy from job notes / redFlags / description
  const combinedPolicyText = [
    job?.sourceNotes || '',
    job?.sponsorshipEvidence || '',
    job?.feasibilityExplanation || '',
    ...(Array.isArray(job?.redFlagsDetected) ? job.redFlagsDetected : []),
    job?.applicationPolicy || '',
  ]
    .join(' ')
    .toLowerCase();

  const policyRestrictsRepeat =
    /do not reapply|single application only|duplicate applications will be disqualified|strictly one application|no follow-up emails/i.test(
      combinedPolicyText
    );

  const employerPolicyNote = policyRestrictsRepeat
    ? 'Employer policy states single submission only — repeat email applications are restricted.'
    : 'Employer recruitment policy permits polite follow-up after 4–5 days if no response is received.';

  let matchedRecord: AppliedJobRecord | undefined;
  for (const record of records) {
    if (!record) continue;
    const prevRecEmail = String(record.recipientEmail || '').trim().toLowerCase();
    // If previous application was sent to a legacy bouncing alias that has now been upgraded to a different verified email, allow immediate re-application!
    if (prevRecEmail && targetEmail && prevRecEmail !== targetEmail) {
      const prevRes = resolveVerifiedEmployerEmail(prevRecEmail, record.company);
      if (prevRes.wasCorrected || !prevRes.isDeliverable) {
        continue;
      }
    }
    const matchId = targetId && (record.jobId === targetId || record.id === targetId);
    const matchEmailAndCompany =
      targetEmail &&
      prevRecEmail === targetEmail &&
      (!targetCompany || String(record.company || '').toLowerCase() === targetCompany);
    const matchRole =
      targetCompany &&
      targetPosition &&
      String(record.company || '').toLowerCase() === targetCompany &&
      String(record.position || '').toLowerCase() === targetPosition;

    if (matchId || matchEmailAndCompany || matchRole) {
      matchedRecord = record;
      break;
    }
  }

  // Also check if the backend job itself has submitted applicationHistory
  if (!matchedRecord && Array.isArray(job?.applicationHistory) && job.applicationHistory.length > 0) {
    const subEvt = job.applicationHistory.find((e: any) => e.status === 'submitted');
    if (subEvt && subEvt.timestamp) {
      const subTs = new Date(subEvt.timestamp).getTime();
      if (Number.isFinite(subTs)) {
        matchedRecord = {
          id: job.id,
          jobId: job.id,
          company: job.employer || job.company || 'Employer',
          position: job.title || job.position || 'Position',
          jobUrl: job.applicationUrl || job.originalJobUrl || '',
          recipientEmail: job.recipientEmail || '',
          applicationDate: subEvt.timestamp,
          appliedTimestamp: subTs,
          appliedAt: subTs,
          gmailMessageId: subEvt.gmailMessageId,
          applicationStatus: 'applied',
          market: job.market || 'sponsorship',
          cvTitle: subEvt.cvTitle,
          employerResponseReceived: job.responseStatus === 'reply_received' || job.responseStatus === 'interview_invited',
        };
      }
    }
  }

  if (!matchedRecord) {
    return {
      status: 'fresh',
      canApply: true,
      isFollowUp: false,
      daysSinceApplied: 0,
      daysUntilReappearance: 0,
      employerPolicyPermitsResend: !policyRestrictsRepeat,
      employerPolicyNote,
    };
  }

  const elapsedMs = Math.max(0, now - (matchedRecord.appliedTimestamp || 0));
  const daysSinceApplied = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  if (matchedRecord.employerResponseReceived) {
    return {
      status: 'response_received',
      canApply: false,
      isFollowUp: false,
      daysSinceApplied,
      daysUntilReappearance: 0,
      employerPolicyPermitsResend: false,
      employerPolicyNote: `Employer response already received (${matchedRecord.employerResponseDate || 'recorded'}). Follow-up not needed.`,
      record: matchedRecord,
    };
  }

  if (policyRestrictsRepeat) {
    return {
      status: 'policy_restricted',
      canApply: false,
      isFollowUp: false,
      daysSinceApplied,
      daysUntilReappearance: 0,
      employerPolicyPermitsResend: false,
      employerPolicyNote,
      record: matchedRecord,
    };
  }

  if (elapsedMs >= SPONSORSHIP_FOLLOWUP_COOLDOWN_MS) {
    return {
      status: 'followup_ready',
      canApply: true,
      isFollowUp: true,
      daysSinceApplied: Math.max(4, daysSinceApplied),
      daysUntilReappearance: 0,
      employerPolicyPermitsResend: true,
      employerPolicyNote: `Applied ${Math.max(4, daysSinceApplied)} days ago with no employer response. Eligible for polite follow-up under employer policy.`,
      record: matchedRecord,
    };
  }

  const remainingMs = SPONSORSHIP_FOLLOWUP_COOLDOWN_MS - elapsedMs;
  const daysUntilReappearance = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  return {
    status: 'cooldown_active',
    canApply: false,
    isFollowUp: false,
    daysSinceApplied,
    daysUntilReappearance,
    employerPolicyPermitsResend: true,
    employerPolicyNote: `Applied recently (${new Date(matchedRecord.appliedTimestamp).toLocaleDateString('en-GB')}). Will reappear for follow-up in ${daysUntilReappearance} day${daysUntilReappearance === 1 ? '' : 's'} (4–5 day window) if no response is received.`,
    record: matchedRecord,
  };
}

/**
 * Helper to backdate an applied record by 5 days so the user can test and verify the
 * 4-5 day Smart Sponsorship Job Reappearance and follow-up workflow immediately without auto-sending any email.
 */
export function simulateSponsorshipFollowUpWindow(jobIdOrEmail: string, daysAgo: number = 5): AppliedJobRecord | null {
  const records = loadAppliedJobRecords();
  const target = jobIdOrEmail.trim().toLowerCase();
  let updatedItem: AppliedJobRecord | null = null;

  const updated = records.map(r => {
    if (
      r.jobId.toLowerCase() === target ||
      r.id.toLowerCase() === target ||
      (r.recipientEmail && r.recipientEmail.toLowerCase() === target)
    ) {
      const backdatedTs = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
      const backdatedIso = new Date(backdatedTs).toISOString();
      updatedItem = {
        ...r,
        appliedTimestamp: backdatedTs,
        appliedAt: backdatedTs,
        applicationDate: backdatedIso,
      };
      return updatedItem;
    }
    return r;
  });

  if (updatedItem) {
    saveAppliedJobRecords(updated);
  }

  // Also synchronize with the persistent backend database without sending any email
  fetch('/api/jobs/simulate-followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: jobIdOrEmail, daysAgo }),
  }).catch(() => {});

  return updatedItem;
}

export function isJobAppliedWithin10Days(
  job: Partial<PreparedJobApplication> | Partial<BackendJobRecord>,
  appliedRecords?: AppliedJobRecord[],
  bypassCooldown: boolean = false
): { isApplied: boolean; remainingDays?: number; record?: AppliedJobRecord; isFollowUpEligible?: boolean } {
  // If explicitly flagged to override cooldown (e.g. fresh search from Gemini) or bypass is active
  if (bypassCooldown || (job as any).overrideCooldown) {
    return { isApplied: false };
  }

  const records = appliedRecords || loadAppliedJobRecords();
  const now = Date.now();

  const isSponsorship =
    job.market === 'sponsorship' ||
    Boolean((job as any).sponsorshipEvidence || (job as any).visaRouteDetected || (job as any).isSponsorship);
  const effectiveCooldownMs = isSponsorship ? SPONSORSHIP_FOLLOWUP_COOLDOWN_MS : APPLIED_JOB_COOLDOWN_MS;

  const targetId = String(job.id || '').trim();
  const targetEmail = String((job as any).recipientEmail || (job as any).email || '').trim().toLowerCase();
  const targetUrl = String((job as any).jobUrl || (job as any).applicationUrl || (job as any).sourceUrl || '').trim().toLowerCase();
  const targetCompany = String((job as any).employer || (job as any).company || '').trim().toLowerCase();
  const targetPosition = String((job as any).title || (job as any).position || '').trim().toLowerCase();

  for (const record of records) {
    if (!record) continue;
    const prevRecEmail = String(record.recipientEmail || '').trim().toLowerCase();
    if (prevRecEmail && targetEmail && prevRecEmail !== targetEmail) {
      const prevRes = resolveVerifiedEmployerEmail(prevRecEmail, record.company);
      if (prevRes.wasCorrected || !prevRes.isDeliverable) {
        continue;
      }
    }
    const elapsed = now - (record.appliedTimestamp || 0);
    const matchId = targetId && record.jobId === targetId;
    const matchEmail = targetEmail && prevRecEmail === targetEmail;
    const matchUrl = targetUrl && record.jobUrl && String(record.jobUrl).toLowerCase() === targetUrl;
    const matchRole =
      targetCompany &&
      targetPosition &&
      String(record.company || (record as any).employer || '').toLowerCase() === targetCompany &&
      String(record.position || (record as any).jobTitle || '').toLowerCase() === targetPosition;

    if (matchId || matchEmail || matchUrl || matchRole) {
      if (elapsed < effectiveCooldownMs) {
        const remainingMs = effectiveCooldownMs - elapsed;
        const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
        return { isApplied: true, remainingDays, record, isFollowUpEligible: false };
      } else if (isSponsorship && !record.employerResponseReceived) {
        // 4-5+ days elapsed on a sponsorship job with no employer response -> eligible for follow-up!
        return { isApplied: false, remainingDays: 0, record, isFollowUpEligible: true };
      }
    }
  }

  return { isApplied: false };
}

export function loadPersistentJobDatabase(): PreparedJobApplication[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_JOBS_DB);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let updated = false;
    const healed = parsed.map((job: PreparedJobApplication) => {
      if (job && job.recipientEmail) {
        const res = resolveVerifiedEmployerEmail(job.recipientEmail, job.company);
        if (res.wasCorrected && res.verifiedEmail) {
          updated = true;
          return {
            ...job,
            recipientEmail: res.verifiedEmail,
            verificationStatus: 'verified' as const,
            reviewReason: `Verified official contact (${res.verificationSource})`,
          };
        }
      }
      return job;
    });
    if (updated) {
      localStorage.setItem(STORAGE_KEY_JOBS_DB, JSON.stringify(healed));
    }
    return healed;
  } catch (err) {
    console.warn('Failed to load persistent job database:', err);
    return [];
  }
}

export function savePersistentJobDatabase(jobs: PreparedJobApplication[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_JOBS_DB, JSON.stringify(jobs));
  } catch (err) {
    console.warn('Failed to save persistent job database:', err);
  }
}

export function loadSelectedMarket(): 'cyprus' | 'europe' | 'sponsorship' {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_MARKET);
    if (saved === 'cyprus' || saved === 'europe' || saved === 'sponsorship') {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'europe';
}

export function saveSelectedMarket(market: 'cyprus' | 'europe' | 'sponsorship'): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_MARKET, market);
  } catch (err) {
    console.warn('Failed to save selected market preference:', err);
  }
}

// ============================================================================
// PORTED FROM db.py: Separate "searches", "companies" (by domain), "emailHistory"
// ============================================================================

const STORAGE_KEY_SEARCHES = 'ccd_jobhunter_searches_v1';
const STORAGE_KEY_ACTIVE_SEARCH_ID = 'ccd_jobhunter_active_search_id_v1';
const STORAGE_KEY_COMPANIES_BY_DOMAIN = 'ccd_jobhunter_companies_by_domain_v1';

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'proton.me',
  'protonmail.com',
]);

export interface SearchSessionRecord {
  id: string;
  query: string;
  market: 'cyprus' | 'europe' | 'sponsorship' | string;
  country: string;
  city: string;
  roles: string[];
  locations: string[];
  status: 'new' | 'running' | 'done' | 'failed';
  createdAt: string;
  finishedAt?: string;
  resultCount: number;
  results: PreparedJobApplication[];
}

export interface CompanyDomainRecord {
  id: string;
  domain: string;
  name: string;
  website: string;
  country: string;
  city: string;
  email: string;
  firstSeenSearchId: string;
  lastSeenSearchId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ported from textutil.py `domain_of`:
 * Extracts the canonical website domain for deduplicating companies across all searches.
 */
export function extractWebsiteDomain(jobOrUrl?: {
  website?: string;
  jobUrl?: string;
  applicationUrl?: string;
  sourceUrl?: string;
  recipientEmail?: string;
  email?: string;
  company?: string;
} | string): string {
  if (!jobOrUrl) return '';
  if (typeof jobOrUrl === 'string') {
    const raw = jobOrUrl.trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('/')) {
      const emailDom = raw.split('@')[1]?.trim() || '';
      return GENERIC_EMAIL_DOMAINS.has(emailDom) ? '' : emailDom.replace(/^www\./, '');
    }
    try {
      const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || '';
    }
  }

  const candidateUrls = [
    jobOrUrl.website,
    jobOrUrl.jobUrl,
    jobOrUrl.applicationUrl,
    jobOrUrl.sourceUrl,
  ].filter(Boolean) as string[];

  for (const u of candidateUrls) {
    const d = extractWebsiteDomain(u);
    if (d && d.includes('.') && !d.includes('google.') && !d.includes('linkedin.com') && !d.includes('indeed.')) {
      return d;
    }
  }

  const emailStr = (jobOrUrl.recipientEmail || jobOrUrl.email || '').trim().toLowerCase();
  if (emailStr.includes('@')) {
    const emailDom = emailStr.split('@')[1]?.trim() || '';
    if (emailDom && !GENERIC_EMAIL_DOMAINS.has(emailDom)) {
      return emailDom.replace(/^www\./, '');
    }
  }

  const compSlug = (jobOrUrl.company || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return compSlug ? `${compSlug}.local` : '';
}

export function loadSearchesHistory(): SearchSessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SEARCHES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to load searches history:', e);
    return [];
  }
}

export function saveSearchesHistory(searches: SearchSessionRecord[]): void {
  try {
    // Keep most recent 30 searches in localStorage so quota is never exceeded
    const trimmed = (Array.isArray(searches) ? searches : []).slice(0, 30);
    localStorage.setItem(STORAGE_KEY_SEARCHES, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent('jobhunter_searches_updated', { detail: trimmed }));
  } catch (e) {
    console.warn('Failed to save searches history:', e);
  }
}

export function getActiveSearchId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_SEARCH_ID);
  } catch {
    return null;
  }
}

export function setActiveSearchId(searchId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_SEARCH_ID, searchId);
  } catch {
    // ignore
  }
}

export function loadCompaniesByDomain(): Record<string, CompanyDomainRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COMPANIES_BY_DOMAIN);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.warn('Failed to load companies by domain:', e);
    return {};
  }
}

export function saveCompaniesByDomain(companies: Record<string, CompanyDomainRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEY_COMPANIES_BY_DOMAIN, JSON.stringify(companies));
  } catch (e) {
    console.warn('Failed to save companies by domain:', e);
  }
}

/**
 * Ported from db.py `upsert_company` + `new_search` + `finish_search`:
 * Creates a brand-new search session with its own unique `searchId` and a FRESH results list.
 * Old search results remain in `searches` history and `emailHistory`, NEVER blocking or cluttering a new search.
 * Deduplicates companies by website domain across all searches.
 */
export function registerNewSearchSession(params: {
  searchId?: string;
  market: 'cyprus' | 'europe' | 'sponsorship' | string;
  roles?: string[];
  locations?: string[];
  query?: string;
  freshApps: PreparedJobApplication[];
}): {
  searchSession: SearchSessionRecord;
  freshResults: PreparedJobApplication[];
  newCompaniesCount: number;
  deduplicatedDomainsCount: number;
} {
  const searchId = params.searchId || `search-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date().toISOString();
  const companiesMap = loadCompaniesByDomain();
  const seenDomainsInThisSearch = new Set<string>();
  const seenEmailsInThisSearch = new Set<string>();

  let newCompaniesCount = 0;
  let deduplicatedDomainsCount = 0;
  const freshResults: PreparedJobApplication[] = [];

  for (let i = 0; i < params.freshApps.length; i++) {
    const app = params.freshApps[i];
    if (!app || typeof app !== 'object') continue;

    const domain = extractWebsiteDomain(app);
    const cleanEmail = (app.recipientEmail || app.email || '').trim().toLowerCase();

    // Deduplicate by website domain within the search and across companies registry
    if (domain && seenDomainsInThisSearch.has(domain)) {
      deduplicatedDomainsCount++;
      continue;
    }
    if (cleanEmail && seenEmailsInThisSearch.has(cleanEmail)) {
      deduplicatedDomainsCount++;
      continue;
    }

    if (domain) {
      seenDomainsInThisSearch.add(domain);
      const existingCompany = companiesMap[domain];
      if (!existingCompany) {
        newCompaniesCount++;
        companiesMap[domain] = {
          id: `comp-${Date.now()}-${i}`,
          domain,
          name: app.company || domain,
          website: app.jobUrl || app.applicationUrl || app.sourceUrl || `https://${domain}`,
          country: app.country || '',
          city: app.city || app.location || '',
          email: cleanEmail,
          firstSeenSearchId: searchId,
          lastSeenSearchId: searchId,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      } else {
        companiesMap[domain] = {
          ...existingCompany,
          name: app.company || existingCompany.name,
          website: app.jobUrl || app.applicationUrl || existingCompany.website,
          email: cleanEmail || existingCompany.email,
          lastSeenSearchId: searchId,
          updatedAt: nowIso,
        };
      }
    }

    if (cleanEmail) {
      seenEmailsInThisSearch.add(cleanEmail);
    }

    const freshItem: PreparedJobApplication = {
      ...app,
      id: `${searchId}-job-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
      searchId,
      companyDomain: domain || undefined,
      market: (app.market || params.market || 'europe') as any,
      status: 'pending_approval',
      lifeCycleStatus: 'ready_to_apply',
      deliveryStatus: undefined,
      isApproved: false,
      isDuplicate: false,
      isNewVacancy: true,
      overrideCooldown: true,
      verificationStatus: app.verificationStatus || (cleanEmail ? 'verified' : 'needs_review'),
    };

    freshResults.push(freshItem);
  }

  saveCompaniesByDomain(companiesMap);

  const searchSession: SearchSessionRecord = {
    id: searchId,
    query: params.query || (params.roles || []).slice(0, 3).join(', ') || 'Hospitality Search',
    market: params.market,
    country: params.market === 'cyprus' ? 'Cyprus' : 'Europe',
    city: (params.locations || [])[0] || '',
    roles: params.roles || [],
    locations: params.locations || [],
    status: 'done',
    createdAt: nowIso,
    finishedAt: nowIso,
    resultCount: freshResults.length,
    results: freshResults,
  };

  const allSearches = loadSearchesHistory().filter(s => s.id !== searchId);
  saveSearchesHistory([searchSession, ...allSearches]);
  setActiveSearchId(searchId);
  savePersistentJobDatabase(freshResults);

  return {
    searchSession,
    freshResults,
    newCompaniesCount,
    deduplicatedDomainsCount,
  };
}

/**
 * Merges or replaces newly discovered job applications for a new search session.
 * BUG 1 FIX: Every search gets its own searchId and a fresh results list.
 * Old results stay in `searches` history and `emailHistory` and NEVER block or stay stuck in a new search.
 * Companies are deduplicated by website domain across all searches.
 */
export function mergeFreshJobsIntoDatabase(
  existingApps: PreparedJobApplication[],
  freshApps: PreparedJobApplication[],
  market: 'cyprus' | 'europe' | 'sponsorship' | string,
  options?: { keepOtherMarkets?: boolean; searchId?: string; roles?: string[]; locations?: string[] }
): { merged: PreparedJobApplication[]; newCount: number; searchId: string } {
  const { searchSession, freshResults } = registerNewSearchSession({
    searchId: options?.searchId,
    market,
    roles: options?.roles,
    locations: options?.locations,
    freshApps,
  });

  // Preserve unapplied jobs from other markets only if explicitly requested; otherwise give a clean fresh list for the active search
  if (options?.keepOtherMarkets && Array.isArray(existingApps)) {
    const otherMarketJobs = existingApps.filter(app => {
      const appMarket = app.market || (app.location?.toLowerCase().includes('cyprus') ? 'cyprus' : 'europe');
      const isAlreadySent =
        app.status === 'applied' ||
        app.status === 'accepted_by_gmail' ||
        app.status === 'sent' ||
        app.status === 'delivered';
      return appMarket !== market && !isAlreadySent;
    });
    const combined = [...freshResults, ...otherMarketJobs];
    savePersistentJobDatabase(combined);
    return { merged: combined, newCount: freshResults.length, searchId: searchSession.id };
  }

  return {
    merged: freshResults,
    newCount: freshResults.length,
    searchId: searchSession.id,
  };
}

/**
 * Filters visible jobs for a specific market, strictly isolating Cyprus vs Europe vs Sponsorship.
 * Old sent/applied results stay in emailHistory and never block a new search.
 */
export function filterVisibleJobsForMarket(
  apps: PreparedJobApplication[],
  market: 'cyprus' | 'europe' | 'sponsorship' | string,
  appliedRecords: AppliedJobRecord[] = [],
  bypassCooldown: boolean = false
): PreparedJobApplication[] {
  if (!Array.isArray(apps)) return [];

  // 1. Strict Market Isolation Rule
  const marketFiltered = apps.filter(app => {
    const isCyprus =
      app.market === 'cyprus' ||
      (app.location && app.location.toLowerCase().includes('cyprus'));

    const isSponsorship =
      app.market === 'sponsorship' ||
      (app as any).isSponsorship ||
      (app.location && (app.location.toLowerCase().includes('sponsorship') || app.location.toLowerCase().includes('visa')));

    if (market === 'cyprus') {
      return isCyprus;
    } else if (market === 'sponsorship') {
      return isSponsorship;
    } else {
      // Europe market strictly excludes Cyprus vacancies
      return !isCyprus;
    }
  });

  // 2. Old sent/applied jobs stay in emailHistory, not blocking the active search list
  const visible = marketFiltered.filter(app => {
    if (bypassCooldown || (app as any).searchId) {
      // If part of an active search session, only hide items after they have been sent in this session
      if (
        app.status === 'applied' ||
        app.status === 'accepted_by_gmail' ||
        app.status === 'sent' ||
        app.status === 'delivered' ||
        app.lifeCycleStatus === 'applied'
      ) {
        return false;
      }
      return true;
    }
    if (
      app.status === 'applied' ||
      app.status === 'accepted_by_gmail' ||
      app.status === 'sent' ||
      app.status === 'delivered' ||
      app.lifeCycleStatus === 'applied' ||
      app.deliveryStatus === 'accepted_by_gmail' ||
      app.deliveryStatus === 'sent_accepted_by_gmail' ||
      app.deliveryStatus === 'delivery_unconfirmed' ||
      app.deliveryStatus === 'delivered'
    ) {
      return false;
    }
    if (appliedRecords.length > 0 && app.status !== 'failed' && app.status !== 'bounced') {
      const cooldown = isJobAppliedWithin10Days(app, appliedRecords);
      if (cooldown.isApplied) {
        return false;
      }
    }
    return true;
  });

  return visible;
}


