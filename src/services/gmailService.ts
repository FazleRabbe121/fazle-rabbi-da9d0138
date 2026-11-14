import { User } from 'firebase/auth';
import { db, auth, getCachedGoogleToken, setCachedGoogleToken, signInWithGoogle, getCachedUserEmail, getCachedUserName, isGoogleTokenExpired, ensureFreshGoogleAccessToken, getGoogleTokenTimeRemainingMs } from './firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { PreparedJobApplication } from '../types/jobApplication';
import { detectExplicitRejection, recordEmployerRejection } from './rejectionTrackingService';
import {
  getCVAttachmentPayload,
  resolveCVAttachmentPayloadAsync,
  loadSelectedCV,
  extractVerifiedCvSummary,
} from './cvStorage';
import { generateCoverLetterPdfBase64, isValidPdfBase64, stripBase64Prefix } from './pdfExporter';
export { generateCoverLetterPdfBase64 };
import { saveApplication } from './jobSearchService';
import { recordAppliedJob } from './jobDatabaseService';
import { resolveVerifiedEmployerEmail } from '../utils/verifiedEmployerEmails';

export type EmailTrackingStatus =
  | 'draft'
  | 'queued'
  | 'sending'
  | 'accepted_by_gmail'
  | 'delivery_unconfirmed'
  | 'temporary_delivery_failure'
  | 'delivered'
  | 'bounced'
  | 'sent'
  | 'pending'
  | 'rate_limited'
  | 'blocked'
  | 'blocked_rate_limited'
  | 'failed'
  | 'failed_to_send'
  | 'needs_action'
  | 'needs_review'
  | 'delivery_failed';

export type ExactDeliveryStatusLabel =
  | 'Draft'
  | 'Queued'
  | 'Sending'
  | 'Accepted by Gmail / Sent'
  | 'Delivery Unconfirmed'
  | 'Temporary Delivery Failure'
  | 'Bounced / Rejected'
  | 'Failed to Send'
  | 'Needs Action'
  | 'needs_review'
  | 'Reply Received (Confirmed)';

export function formatTrackingStatusLabel(
  status?: EmailTrackingStatus | string,
  errorCategory?: string,
  deliveryStatus?: string,
  replyStatus?: string
): ExactDeliveryStatusLabel {
  if (status === 'draft') return 'Draft';
  if (status === 'queued' || deliveryStatus === 'queued') return 'Queued';
  if (status === 'sending' || status === 'pending' || deliveryStatus === 'sending') return 'Sending';
  if (
    status === 'bounced' ||
    status === 'delivery_failed' ||
    deliveryStatus === 'bounced' ||
    errorCategory === 'bounce' ||
    replyStatus === 'bounced'
  ) {
    return 'Bounced / Rejected';
  }
  if (replyStatus === 'reply_received' || status === 'delivered' || deliveryStatus === 'delivered') {
    return 'Reply Received (Confirmed)';
  }
  if (status === 'delivery_unconfirmed' || deliveryStatus === 'delivery_unconfirmed') {
    return 'Delivery Unconfirmed';
  }
  if (status === 'accepted_by_gmail' || status === 'sent' || deliveryStatus === 'accepted_by_gmail' || deliveryStatus === 'sent_accepted_by_gmail') {
    return 'Accepted by Gmail / Sent';
  }
  if (
    status === 'temporary_delivery_failure' ||
    deliveryStatus === 'temporary_delivery_failure' ||
    status === 'rate_limited' ||
    status === 'blocked_rate_limited' ||
    errorCategory === 'rate_limit' ||
    errorCategory === 'outage'
  ) {
    return 'Temporary Delivery Failure';
  }
  if (status === 'needs_review' || status === 'needs_action' || status === 'blocked' || errorCategory === 'auth' || errorCategory === 'recipient' || errorCategory === 'duplicate_blocked' || errorCategory === 'connection_dropped') {
    return 'Needs Action';
  }
  return 'Failed to Send';
}

export interface GmailSendingRecord {
  id: string;
  timestamp: string;
  recipient: string;
  company?: string;
  position?: string;
  jobUrl?: string;
  applicationUrl?: string;
  subject: string;
  coverLetter?: string;
  cvTitle: string;
  selectedCvId?: string;
  isUploadedCv?: boolean;
  sendingAccount?: string;
  attemptCount?: number;
  lastAttemptAt?: string;
  contactSourceUrl?: string;
  contactFoundOnPage?: string;
  contactType?: string;
  contactVerificationDate?: string;
  contactConfidence?: 'High' | 'Medium' | 'None';
  status: EmailTrackingStatus;
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
  errorReason?: string;
  errorCategory?: 'auth' | 'recipient' | 'bounce' | 'rate_limit' | 'formatting' | 'outage' | 'duplicate_blocked' | 'connection_dropped';
  messageId?: string;
  threadId?: string;
  sourceAI?: string;
  replyStatus?: 'none' | 'checked_no_reply' | 'reply_received' | 'bounced';
  replySnippet?: string;
  replyTimestamp?: string;
}

export interface AuthorizedGmailSenderAccount {
  email: string;
  displayName: string;
  isPrimaryDefault: boolean;
  isActive: boolean;
  accessToken?: string | null;
  tokenExpiresAt?: number;
  sentTodayCount: number;
  dailyQuotaDate: string;
  rateLimitedUntil?: number;
  lastStatus: 'Ready' | 'Rate Limited / Quota Reached' | 'Auth Expired';
  lastError?: string;
  connectedAt: string;
}

const STORAGE_KEY_SENDER_ACCOUNTS = 'cv_authorized_gmail_sender_accounts_v1';

export function loadAuthorizedSenderAccounts(): AuthorizedGmailSenderAccount[] {
  const today = new Date().toISOString().slice(0, 10);
  const primaryEmail = auth.currentUser?.email || getCachedUserEmail() || 'fazle.rabbe.doc@gmail.com';
  const primaryName = auth.currentUser?.displayName || getCachedUserName() || 'Fazle Rabbi';
  const currentToken = getCachedGoogleToken();
  const isExpired = isGoogleTokenExpired();

  try {
    const raw = localStorage.getItem(STORAGE_KEY_SENDER_ACCOUNTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((acc: AuthorizedGmailSenderAccount) => {
          const resetDaily = acc.dailyQuotaDate !== today;
          const isCurrentAuth = acc.email.toLowerCase() === primaryEmail.toLowerCase();
          return {
            ...acc,
            sentTodayCount: resetDaily ? 0 : acc.sentTodayCount || 0,
            dailyQuotaDate: today,
            accessToken: isCurrentAuth ? currentToken : acc.accessToken,
            lastStatus:
              acc.rateLimitedUntil && acc.rateLimitedUntil > Date.now()
                ? 'Rate Limited / Quota Reached'
                : isCurrentAuth && (!currentToken || isExpired)
                ? 'Auth Expired'
                : 'Ready',
          };
        });
      }
    }
  } catch (e) {
    console.warn('Failed to load authorized sender accounts:', e);
  }

  const defaultAccount: AuthorizedGmailSenderAccount = {
    email: primaryEmail,
    displayName: primaryName,
    isPrimaryDefault: true,
    isActive: true,
    accessToken: currentToken,
    sentTodayCount: 0,
    dailyQuotaDate: today,
    lastStatus: currentToken && !isExpired ? 'Ready' : 'Auth Expired',
    connectedAt: new Date().toISOString(),
  };
  return [defaultAccount];
}

export function saveAuthorizedSenderAccounts(accounts: AuthorizedGmailSenderAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SENDER_ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Failed to save authorized sender accounts:', e);
  }
}

export function getActiveSenderAccount(): AuthorizedGmailSenderAccount {
  const accounts = loadAuthorizedSenderAccounts();
  return accounts.find(a => a.isActive) || accounts.find(a => a.isPrimaryDefault) || accounts[0];
}

export function recordSenderAccountActivity(params: {
  email: string;
  sentSuccess?: boolean;
  rateLimited?: boolean;
  errorMsg?: string;
}): void {
  const today = new Date().toISOString().slice(0, 10);
  const accounts = loadAuthorizedSenderAccounts();
  const lower = (params.email || 'fazle.rabbe.doc@gmail.com').trim().toLowerCase();
  let found = false;

  const updated = accounts.map(acc => {
    if (acc.email.toLowerCase() === lower) {
      found = true;
      return {
        ...acc,
        dailyQuotaDate: today,
        sentTodayCount: params.sentSuccess ? (acc.sentTodayCount || 0) + 1 : acc.sentTodayCount || 0,
        rateLimitedUntil: params.rateLimited ? Date.now() + 60000 : acc.rateLimitedUntil,
        lastStatus: params.rateLimited ? ('Rate Limited / Quota Reached' as const) : ('Ready' as const),
        lastError: params.errorMsg || acc.lastError,
      };
    }
    return acc;
  });

  if (!found) {
    updated.push({
      email: params.email || 'fazle.rabbe.doc@gmail.com',
      displayName: getCachedUserName() || 'Fazle Rabbi',
      isPrimaryDefault: updated.length === 0,
      isActive: true,
      sentTodayCount: params.sentSuccess ? 1 : 0,
      dailyQuotaDate: today,
      rateLimitedUntil: params.rateLimited ? Date.now() + 60000 : undefined,
      lastStatus: params.rateLimited ? 'Rate Limited / Quota Reached' : 'Ready',
      lastError: params.errorMsg,
      connectedAt: new Date().toISOString(),
    });
  }

  saveAuthorizedSenderAccounts(updated);
}

export function switchActiveSenderAccount(email: string): AuthorizedGmailSenderAccount[] {
  const lower = email.trim().toLowerCase();
  const accounts = loadAuthorizedSenderAccounts().map(acc => ({
    ...acc,
    isActive: acc.email.toLowerCase() === lower,
  }));
  const newlyActive = accounts.find(a => a.isActive);
  if (newlyActive?.accessToken) {
    setCachedGoogleToken(newlyActive.accessToken, 3600);
  }
  saveAuthorizedSenderAccounts(accounts);
  return accounts;
}

export async function connectAdditionalGmailAccountViaOAuth(): Promise<{
  success: boolean;
  account?: AuthorizedGmailSenderAccount;
  accounts: AuthorizedGmailSenderAccount[];
  error?: string;
}> {
  try {
    const res = await signInWithGoogle();
    if (!res || !res.accessToken || !res.user?.email) {
      return {
        success: false,
        accounts: loadAuthorizedSenderAccounts(),
        error: 'Google OAuth authorization was cancelled or did not return an email/token.',
      };
    }
    const today = new Date().toISOString().slice(0, 10);
    const email = res.user.email;
    const displayName = res.user.displayName || 'Fazle Rabbi';
    const existing = loadAuthorizedSenderAccounts();
    const alreadyIdx = existing.findIndex(a => a.email.toLowerCase() === email.toLowerCase());

    let newAcc: AuthorizedGmailSenderAccount;
    let updated: AuthorizedGmailSenderAccount[];
    if (alreadyIdx !== -1) {
      newAcc = {
        ...existing[alreadyIdx],
        displayName,
        accessToken: res.accessToken,
        tokenExpiresAt: Date.now() + 3400 * 1000,
        lastStatus: 'Ready',
        isActive: true,
      };
      updated = existing.map((a, idx) => (idx === alreadyIdx ? newAcc : { ...a, isActive: false }));
    } else {
      newAcc = {
        email,
        displayName,
        isPrimaryDefault: existing.length === 0,
        isActive: true,
        accessToken: res.accessToken,
        tokenExpiresAt: Date.now() + 3400 * 1000,
        sentTodayCount: 0,
        dailyQuotaDate: today,
        lastStatus: 'Ready',
        connectedAt: new Date().toISOString(),
      };
      updated = [...existing.map(a => ({ ...a, isActive: false })), newAcc];
    }

    saveAuthorizedSenderAccounts(updated);
    return { success: true, account: newAcc, accounts: updated };
  } catch (err: any) {
    return {
      success: false,
      accounts: loadAuthorizedSenderAccounts(),
      error: err?.message || 'Failed to authorize Gmail account via Google OAuth.',
    };
  }
}

export function assessSenderAccountQuotaNeed(): {
  isSecondAccountNeeded: boolean;
  senderQuotaBlocked: boolean;
  activeAccountEmail: string;
  sentTodayCount: number;
  explanation: string;
} {
  const active = getActiveSenderAccount();
  const isRateLimited =
    active.lastStatus === 'Rate Limited / Quota Reached' ||
    (active.rateLimitedUntil ? active.rateLimitedUntil > Date.now() : false);

  if (isRateLimited) {
    return {
      isSecondAccountNeeded: true,
      senderQuotaBlocked: true,
      activeAccountEmail: active.email,
      sentTodayCount: active.sentTodayCount,
      explanation: `Sender account (${active.email}) has hit a Gmail API sending quota or temporary rate limit (${active.lastError || 'HTTP 429'}). You may wait for the quota window to reset or optionally authorize another Gmail account via Google OAuth.`,
    };
  }

  return {
    isSecondAccountNeeded: false,
    senderQuotaBlocked: false,
    activeAccountEmail: active.email,
    sentTodayCount: active.sentTodayCount,
    explanation: `Primary sender account (${active.email}) is healthy (${active.sentTodayCount} sent today). A second Gmail account is NOT needed—past bounces (such as 550 5.4.317 / 451 4.4.0 ConnectionReset at ritzcarlton.com) were caused by the recipient's remote Exchange server rejecting or failing internal delivery, which cannot be fixed by changing sender Gmail accounts.`,
  };
}

export interface SavedRecipient {
  id: string;
  name: string;
  email: string;
  category?: string;
}

const STORAGE_KEY_HISTORY = 'cv_email_sending_history_v1';
const STORAGE_KEY_SAVED_RECIPIENTS = 'cv_saved_recipients_v1';
const STORAGE_KEY_SAVED_DRAFT = 'cv_email_saved_draft_v1';
const STORAGE_KEY_AI_APPLICATIONS = 'cv_ai_prepared_applications_v1';
const STORAGE_KEY_PRESERVED_FAILED_APPS = 'cv_preserved_failed_applications_v1';
const STORAGE_KEY_SUBMISSION_IDS = 'cv_persistent_submission_ids_v1';

export interface PersistentSubmissionEntry {
  submissionId: string;
  recipient: string;
  company: string;
  position: string;
  status:
    | 'in_flight'
    | 'accepted_by_gmail'
    | 'delivery_unconfirmed'
    | 'temporary_delivery_failure'
    | 'delivered'
    | 'bounced'
    | 'sent'
    | 'uncertain'
    | 'failed'
    | 'rate_limited'
    | 'blocked'
    | 'needs_action';
  messageId?: string;
  threadId?: string;
  lastError?: string;
  updatedAt: string;
}

export function loadPersistentSubmissions(): Record<string, PersistentSubmissionEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUBMISSION_IDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Error loading persistent submission IDs:', e);
  }
  return {};
}

export function savePersistentSubmission(entry: PersistentSubmissionEntry): void {
  try {
    const all = loadPersistentSubmissions();
    all[entry.submissionId] = entry;
    localStorage.setItem(STORAGE_KEY_SUBMISSION_IDS, JSON.stringify(all));
  } catch (e) {
    console.warn('Error saving persistent submission ID:', e);
  }
}

export interface PreservedApplicationDraft {
  key: string;
  submissionId?: string;
  jobId?: string;
  company: string;
  position: string;
  location?: string;
  recipient: string;
  subject: string;
  coverLetter: string;
  selectedCvId?: string;
  cvFilename?: string;
  attachCoverLetterPdf?: boolean;
  trackingStatus?: EmailTrackingStatus;
  errorCategory?: string;
  lastError?: string;
  updatedAt: string;
}

export function getApplicationDedupKey(params: {
  jobId?: string;
  recipient?: string;
  company?: string;
  position?: string;
}): string {
  const cleanRec = (params.recipient || '').trim().toLowerCase();
  const cleanComp = (params.company || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanPos = (params.position || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanComp && cleanPos) {
    return `${cleanComp}__${cleanPos}__${cleanRec}`;
  }
  if (params.jobId) {
    return `job__${params.jobId}__${cleanRec}`;
  }
  return `rec__${cleanRec}`;
}

export function loadPreservedFailedApplications(): Record<string, PreservedApplicationDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRESERVED_FAILED_APPS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Error loading preserved applications:', e);
  }
  return {};
}

export function savePreservedFailedApplication(draft: Omit<PreservedApplicationDraft, 'key' | 'updatedAt'>): PreservedApplicationDraft {
  const key = getApplicationDedupKey({
    jobId: draft.jobId,
    recipient: draft.recipient,
    company: draft.company,
    position: draft.position,
  });
  const all = loadPreservedFailedApplications();
  const record: PreservedApplicationDraft = {
    ...draft,
    key,
    updatedAt: new Date().toISOString(),
  };
  all[key] = record;
  if (draft.jobId) {
    all[`jobid_${draft.jobId}`] = record;
  }
  try {
    localStorage.setItem(STORAGE_KEY_PRESERVED_FAILED_APPS, JSON.stringify(all));
  } catch (e) {
    console.warn('Failed to persist failed application draft:', e);
  }
  return record;
}

export function getPreservedFailedApplication(params: {
  jobId?: string;
  recipient?: string;
  company?: string;
  position?: string;
}): PreservedApplicationDraft | null {
  const all = loadPreservedFailedApplications();
  if (params.jobId && all[`jobid_${params.jobId}`]) {
    return all[`jobid_${params.jobId}`];
  }
  const key = getApplicationDedupKey(params);
  return all[key] || null;
}

export function removePreservedFailedApplication(params: {
  jobId?: string;
  recipient?: string;
  company?: string;
  position?: string;
}): void {
  const all = loadPreservedFailedApplications();
  const key = getApplicationDedupKey(params);
  delete all[key];
  if (params.jobId) {
    delete all[`jobid_${params.jobId}`];
  }
  try {
    localStorage.setItem(STORAGE_KEY_PRESERVED_FAILED_APPS, JSON.stringify(all));
  } catch (e) {
    // ignore
  }
}

export function hasAlreadySentApplication(params: {
  jobId?: string;
  recipient?: string;
  company?: string;
  position?: string;
}): {
  alreadySent: boolean;
  alreadyBounced?: boolean;
  uncertainDelivery?: boolean;
  record?: GmailSendingRecord;
  submissionEntry?: PersistentSubmissionEntry;
} {
  const submissionId = getApplicationDedupKey(params);
  const submissions = loadPersistentSubmissions();
  const subEntry = submissions[submissionId];

  const history = loadLocalSendingHistory();
  const cleanRec = (params.recipient || '').trim().toLowerCase();
  const cleanComp = (params.company || '').trim().toLowerCase();
  const cleanPos = (params.position || '').trim().toLowerCase();

  for (const rec of history) {
    const rEmail = (rec.recipient || '').trim().toLowerCase();
    const rComp = (rec.company || '').trim().toLowerCase();
    const rPos = (rec.position || '').trim().toLowerCase();

    // Ported from db.py `ux_outbox_initial`: NEVER send to the same email address twice!
    const isSameEmailAddress = Boolean(cleanRec && rEmail === cleanRec);
    const isSameTarget =
      isSameEmailAddress ||
      (params.jobId && rec.id === params.jobId && (!cleanRec || rEmail === cleanRec)) ||
      (cleanRec && rEmail === cleanRec && cleanComp && rComp === cleanComp && (!cleanPos || rPos === cleanPos));

    if (!isSameTarget) continue;

    if (rec.status === 'bounced' || rec.deliveryStatus === 'bounced' || rec.errorCategory === 'bounce') {
      return { alreadySent: false, alreadyBounced: true, record: rec, submissionEntry: subEntry };
    }

    if (rec.status === 'needs_review' || rec.errorCategory === 'connection_dropped') {
      return { alreadySent: false, uncertainDelivery: true, record: rec, submissionEntry: subEntry };
    }

    if (
      rec.status === 'accepted_by_gmail' ||
      rec.status === 'delivered' ||
      rec.status === 'sent' ||
      Boolean(rec.messageId)
    ) {
      return { alreadySent: true, record: rec, submissionEntry: subEntry };
    }
  }

  if (subEntry && subEntry.status === 'bounced') {
    return {
      alreadySent: false,
      alreadyBounced: true,
      submissionEntry: subEntry,
    };
  }

  if (
    subEntry &&
    (subEntry.status === 'accepted_by_gmail' || subEntry.status === 'delivered' || subEntry.status === 'sent') &&
    subEntry.messageId
  ) {
    return {
      alreadySent: true,
      submissionEntry: subEntry,
      record: {
        id: params.jobId || submissionId,
        timestamp: subEntry.updatedAt,
        recipient: subEntry.recipient,
        company: subEntry.company,
        position: subEntry.position,
        subject: '',
        cvTitle: '',
        status: subEntry.status === 'delivered' ? 'delivered' : 'accepted_by_gmail',
        deliveryStatus: subEntry.status === 'delivered' ? 'delivered' : 'accepted_by_gmail',
        messageId: subEntry.messageId,
      },
    };
  }

  if (subEntry && subEntry.status === 'uncertain') {
    return {
      alreadySent: false,
      uncertainDelivery: true,
      submissionEntry: subEntry,
    };
  }

  return { alreadySent: false };
}

export interface SavedApplicationDraft {
  subject: string;
  coverLetter: string;
  selectedCvId: string;
}

export const DEFAULT_SAVED_RECIPIENTS: SavedRecipient[] = [
  { id: 'rec-1', name: 'Four Seasons Resort Cyprus — HR Department', email: 'hr@fourseasons.com.cy', category: 'Luxury Resort' },
  { id: 'rec-2', name: 'Amara Hotel Limassol — Official Careers', email: 'careers@amarahotel.com', category: '5-Star Hotel' },
  { id: 'rec-3', name: 'Nissi Beach Resort — HR Department', email: 'hr@nissi-beach.com.cy', category: 'Beach Resort' },
  { id: 'rec-4', name: 'Hotel Excelsior Dubrovnik (ALH) — Recruitment', email: 'posao@alh.hr', category: 'Luxury Hotel' },
];

export const DEFAULT_APPLICATION_DRAFT: SavedApplicationDraft = {
  subject: 'Bartender Position Application – Fazle Rabbi',
  coverLetter: `Dear Hiring Manager,

I am writing to express my interest in the Bartender position at your respected establishment. With over 6 years of experience in hospitality, I am confident in my ability to contribute to your team.

Please find my CV attached for your kind consideration.

Best regards,
Fazle Rabbi Boyati`,
  selectedCvId: '',
};

// ==========================================
// Local & Cloud Storage for Sending History
// ==========================================

const KNOWN_BOUNCED_LEGACY_EMAILS: Record<string, string> = {
  'arts.ambassador@ritzcarlton.com':
    "550 5.4.317 Message expired, cannot connect to remote server (451 4.4.0 Socket error: ConnectionReset) [PH0PR08MB11004.namprd08.prod.outlook.com]. Root Cause: Marriott/Ritz-Carlton's incoming Exchange Online server accepted the message from Gmail, then repeatedly failed to connect to its internal downstream mail server (162.130.196.138:25) until delivery expired (LinkId=389361). Apply via official Marriott portal: https://careers.marriott.com",
  'arts.careers@ritzcarlton.com':
    "550 5.4.317 Message expired, cannot connect to remote server (451 4.4.0 Socket error: ConnectionReset). Microsoft 365 Exchange Online (postmaster@ritzcarlton.com) rejects external email applications. Apply via official Marriott portal: https://careers.marriott.com",
  'whateverwhenever.wamsterdam@whotels.com':
    "Delivery has failed to these recipients or groups (whateverwhenever.wamsterdam@whotels.com). Microsoft 365 Exchange Online (postmaster@whotels.com): Remote server connection / hybrid routing rejected external application (LinkId=389361). Apply via official Marriott portal: https://careers.marriott.com",
  'careers.wamsterdam@whotels.com':
    "Delivery has failed to these recipients or groups (careers.wamsterdam@whotels.com). Microsoft 365 Exchange Online (postmaster@whotels.com) rejects external email applications. Apply via official Marriott portal: https://careers.marriott.com",
  'careers@alh.hr': '550 5.4.1 Recipient address rejected: Access denied (Exchange Online internal distribution list). Auto-upgraded to verified official recruitment address: posao@alh.hr',
  'karriere@jjwhotels.com': '550 5.1.1 Address not found on jjwhotels.com. Auto-upgraded to verified Grand Hotel Wien HR address: personal@grandhotelwien.com',
  'momuc-careers@mohg.com': '550 5.1.1 Address not found on mohg.com. Apply via official Mandarin Oriental careers portal: https://www.mandarinoriental.com/en/careers',
  'recruitment.london@fairmont.com': '550 5.1.1 Address not found on fairmont.com. Apply via official Savoy Accor careers portal: https://careers.accor.com/global/en/the-savoy',
  'savoycareers@fairmont.com': '550 5.1.1 Address not found on fairmont.com. Apply via official Savoy Accor careers portal: https://careers.accor.com/global/en/the-savoy',
  'careers@therees.co.nz': '550 5.4.1 Recipient address rejected: Access denied (Exchange Online internal group). Apply via official portal: https://therees.co.nz/careers/',
};

const KNOWN_CONFIRMED_DELIVERED_EMAILS: Record<string, string> = {
  'info@grandhotel.se': 'Confirmed delivered — Employer acknowledgement received ("Dear Fazle, Thank you for your application...")',
  'jobb@grandhotel.se': 'Confirmed delivered — Employer acknowledgement received ("Dear Fazle, Thank you for your application...")',
  'recrutement@ritzparis.com': 'Confirmed delivered — Employer acknowledgement received ("Réponse automatique : Dear Madam, Dear Sir, Thank you for your email...")',
};

function deduplicateSendingHistoryRecords(records: GmailSendingRecord[]): {
  deduped: GmailSendingRecord[];
  changed: boolean;
} {
  const seenIds = new Set<string>();
  const seenJobRecipient = new Set<string>();
  const deduped: GmailSendingRecord[] = [];
  let changed = false;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec || typeof rec !== 'object') {
      changed = true;
      continue;
    }
    const baseId = String(rec.id || `hist-${i}`).trim();
    const recip = String(rec.recipient || '').trim().toLowerCase();
    const comp = String(rec.company || '').trim().toLowerCase();
    const pos = String(rec.position || '').trim().toLowerCase();
    const jobRecipKey = recip && comp ? `${recip}::${comp}::${pos}` : `${baseId}::${recip}::${comp}`;

    if (seenJobRecipient.has(jobRecipKey)) {
      // Exact duplicate attempt for the same job + recipient; keep the first (newest) one
      changed = true;
      continue;
    }
    seenJobRecipient.add(jobRecipKey);

    let finalId = baseId;
    if (seenIds.has(finalId)) {
      changed = true;
      const suffix = rec.messageId || recip.replace(/[^a-z0-9]/g, '') || String(i);
      finalId = `${baseId}-${suffix}`;
      while (seenIds.has(finalId)) {
        finalId = `${finalId}-${i}`;
      }
    }
    seenIds.add(finalId);

    if (finalId !== rec.id) {
      deduped.push({ ...rec, id: finalId });
    } else {
      deduped.push(rec);
    }
  }

  return { deduped, changed };
}

export function loadLocalSendingHistory(): GmailSendingRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let updated = false;
        const healed = parsed.filter(Boolean).map((rec: GmailSendingRecord) => {
          const lowerRec = (rec.recipient || '').trim().toLowerCase();
          if (KNOWN_BOUNCED_LEGACY_EMAILS[lowerRec] && rec.status !== 'bounced') {
            updated = true;
            return {
              ...rec,
              status: 'bounced' as EmailTrackingStatus,
              deliveryStatus: 'bounced' as const,
              replyStatus: 'bounced' as const,
              errorCategory: 'bounce' as const,
              errorReason: KNOWN_BOUNCED_LEGACY_EMAILS[lowerRec],
            };
          }
          const resCheck = resolveVerifiedEmployerEmail(lowerRec, rec.company);
          if (
            (resCheck.wasCorrected || !resCheck.isDeliverable) &&
            (rec.status === 'sent' || rec.status === 'accepted_by_gmail' || rec.status === 'blocked')
          ) {
            updated = true;
            return {
              ...rec,
              status: 'bounced' as EmailTrackingStatus,
              deliveryStatus: 'bounced' as const,
              replyStatus: 'bounced' as const,
              errorCategory: 'bounce' as const,
              errorReason:
                resCheck.bouncePreventionNote ||
                `Recipient mail server rejected delivery (${lowerRec}). Email unavailable — apply via official employer portal.`,
            };
          }
          if (
            KNOWN_CONFIRMED_DELIVERED_EMAILS[lowerRec] &&
            (rec.status === 'sent' || rec.status === 'accepted_by_gmail')
          ) {
            updated = true;
            return {
              ...rec,
              status: 'delivered' as EmailTrackingStatus,
              deliveryStatus: 'delivered' as const,
              replyStatus: 'reply_received' as const,
              replySnippet: rec.replySnippet || KNOWN_CONFIRMED_DELIVERED_EMAILS[lowerRec],
            };
          }
          if (rec.replyStatus === 'reply_received' && rec.status !== 'delivered') {
            updated = true;
            return {
              ...rec,
              status: 'delivered' as EmailTrackingStatus,
              deliveryStatus: 'delivered' as const,
            };
          }
          if (rec.status === 'sent' && rec.deliveryStatus !== 'delivered') {
            updated = true;
            return {
              ...rec,
              status: 'accepted_by_gmail' as EmailTrackingStatus,
              deliveryStatus: 'accepted_by_gmail' as const,
            };
          }
          return rec;
        });

        const { deduped, changed } = deduplicateSendingHistoryRecords(healed);
        if (updated || changed) {
          localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(deduped));
        }
        return deduped;
      }
    }
  } catch (err) {
    console.warn('Failed to load local sending history:', err);
  }
  return [];
}

export function saveLocalSendingHistory(history: GmailSendingRecord[]) {
  try {
    const { deduped } = deduplicateSendingHistoryRecords(Array.isArray(history) ? history : []);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(deduped));
    
    // Cloud sync to Firestore under user UID and email account
    const currentUser = auth.currentUser;
    const targetEmail = currentUser?.email || getCachedUserEmail() || 'fazle.rabbe.doc@gmail.com';

    if (currentUser?.uid) {
      syncHistoryToCloud(currentUser.uid, deduped).catch(err =>
        console.warn('Deferred cloud sync for sending history:', err)
      );
    }

    if (targetEmail) {
      const emailDocId = targetEmail.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      const accountRef = doc(db, 'cv_accounts', emailDocId);
      setDoc(accountRef, { emailSendingHistory: history, updatedAt: new Date().toISOString() }, { merge: true }).catch(
        err => console.warn('Account history sync error:', err)
      );
    }
  } catch (err) {
    console.warn('Failed to save sending history:', err);
  }
}

async function syncHistoryToCloud(userId: string, history: GmailSendingRecord[]) {
  try {
    const historyRef = doc(db, 'users', userId, 'cv_metadata', 'email_sending_history');
    await setDoc(historyRef, { records: history, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('Cloud sync error for email history:', err);
  }
}

// ==========================================
// Saved Recipients Management
// ==========================================

export function loadSavedRecipients(): SavedRecipient[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_RECIPIENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load saved recipients:', err);
  }
  return DEFAULT_SAVED_RECIPIENTS;
}

export function saveSavedRecipients(recipients: SavedRecipient[]) {
  try {
    localStorage.setItem(STORAGE_KEY_SAVED_RECIPIENTS, JSON.stringify(recipients));
  } catch (err) {
    console.warn('Failed to save saved recipients:', err);
  }
}

// ==========================================
// Saved Draft Application (Subject & Cover Letter)
// ==========================================

export function loadSavedApplicationDraft(): SavedApplicationDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_DRAFT);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_APPLICATION_DRAFT, ...parsed };
    }
  } catch (err) {
    console.warn('Failed to load saved draft:', err);
  }
  return DEFAULT_APPLICATION_DRAFT;
}

export function saveApplicationDraft(draft: SavedApplicationDraft) {
  try {
    localStorage.setItem(STORAGE_KEY_SAVED_DRAFT, JSON.stringify(draft));
  } catch (err) {
    console.warn('Failed to save application draft:', err);
  }
}

// ==========================================
// RFC 2822 MIME & Base64URL Construction
// ==========================================

/**
 * Safely converts any UTF-8 string (including Unicode emojis, en-dashes, accents, non-Latin scripts)
 * into a standard Base64 string without triggering Latin-1 range errors in window.btoa().
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.length;
  // Block iteration guarantees zero stack overflow risk even with large multi-megabyte PDFs
  for (let i = 0; i < len; i += 2048) {
    const chunk = bytes.subarray(i, Math.min(i + 2048, len));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

export function utf8ToBase64Url(str: string): string {
  return utf8ToBase64(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * RFC 2045 Section 6.8 compliance:
 * Breaks Base64 strings into max 76-character lines separated by CRLF (\r\n).
 * Essential for attachments and encoded bodies to prevent MTA / Gmail API rejection or spam classification.
 */
export function chunkBase64(base64: string, lineLength: number = 76): string {
  if (!base64) return '';
  const clean = base64.replace(/\s+/g, '');
  const regex = new RegExp(`.{1,${lineLength}}`, 'g');
  const chunks = clean.match(regex);
  return chunks ? chunks.join('\r\n') : clean;
}

export const KNOWN_TEST_DOMAINS = [
  'hotel1.com',
  'hotel2.com',
  'hotel3.com',
  'restaurant4.com',
  'example.com',
  'test.com',
  'dummy.com',
  'sample.com',
  'invalid.com',
  'fake.com',
  'placeholder.com',
  'domain.com',
];

/**
 * Strict validation and deduplication function to ensure that an application email
 * contains EXACTLY ONE complete cover letter (Requirement 1).
 * Eliminates duplicate introductory messages, repeated greetings ("Dear ..."),
 * duplicate signatures ("Best regards, Fazle Rabbi Boyati"), or stacked cover letters separated by dividers.
 */
export function validateSingleCoverLetter(content: string): {
  cleanedText: string;
  hasDuplicatesDetected: boolean;
  duplicateDetails?: string[];
} {
  if (!content) return { cleanedText: '', hasDuplicatesDetected: false };

  let text = content.trim();
  const detected: string[] = [];

  // 1. Detect if a divider such as "---" or "___" divides two cover letters/intro message
  if (text.includes('\n---\n') || text.includes('\n___\n')) {
    const parts = text.split(/\n(?:---|___)\n+/);
    if (parts.length > 1) {
      detected.push('Multiple message blocks separated by divider detected.');
      // Find the most complete cover letter part (the one with full body / experience points)
      const bestPart = parts.reduce((longest, curr) => (curr.trim().length > longest.trim().length ? curr : longest), '');
      text = bestPart.trim();
    }
  }

  // 2. Count "Dear " occurrences
  const dearMatches = text.match(/\bDear\s+[^,\n]+[,:]/gi);
  if (dearMatches && dearMatches.length > 1) {
    detected.push(`Multiple salutations detected (${dearMatches.length}). Kept only primary salutation.`);
    let first = true;
    text = text.replace(/\bDear\s+[^,\n]+[,:]/gi, (match) => {
      if (first) {
        first = false;
        return match;
      }
      return '';
    });
  }

  // 3. Count signoffs ("Best regards", "Warm regards", "Sincerely")
  const signoffRegex = /(?:Best regards|Warm regards|Sincerely|Kind regards),?\s*\n+Fazle Rabbi[^\n]*/gi;
  const signoffMatches = text.match(signoffRegex);
  if (signoffMatches && signoffMatches.length > 1) {
    detected.push(`Multiple signatures detected (${signoffMatches.length}). Consolidated to single signature.`);
    let count = 0;
    text = text.replace(signoffRegex, (match) => {
      count++;
      if (count === signoffMatches.length) return match;
      return '';
    });
  }

  // 4. Clean extra redundant blank lines created by removal
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleanedText: text,
    hasDuplicatesDetected: detected.length > 0,
    duplicateDetails: detected.length > 0 ? detected : undefined,
  };
}

/**
 * Validates recipient email syntax and tests active MX record online
 */
export async function validateRecipientAddress(email: string): Promise<{
  valid: boolean;
  reason?: string;
  warning?: string;
  isTestDomain?: boolean;
  correctedEmail?: string;
  wasCorrected?: boolean;
}> {
  const rawTrimmed = (email || '').trim();
  if (!rawTrimmed) {
    return { valid: false, reason: 'Recipient email address is empty.' };
  }

  // 1. Check Verified Employer Email Registry & Bounce Prevention Guard (prevents 550 5.4.1 & 550 5.1.1 bounces)
  const resolution = resolveVerifiedEmployerEmail(rawTrimmed);
  if (!resolution.isDeliverable) {
    return {
      valid: false,
      reason:
        resolution.bouncePreventionNote ||
        `Recipient "${rawTrimmed}" is an unverified or restricted chain alias that rejects external mail (550). Please apply via the official employer portal.`,
    };
  }

  const trimmed = resolution.verifiedEmail || rawTrimmed;

  const basicRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!basicRegex.test(trimmed)) {
    return { valid: false, reason: 'Malformed email syntax (RFC 5322 check failed).' };
  }

  const domain = trimmed.split('@')[1]?.toLowerCase();
  if (!domain || !domain.includes('.')) {
    return { valid: false, reason: 'Incomplete domain extension (e.g. missing .com, .com.cy, .gr).' };
  }

  if (KNOWN_TEST_DOMAINS.includes(domain)) {
    return {
      valid: false,
      isTestDomain: true,
      reason: `Placeholder test domain ("${domain}"). Real applications cannot be sent to demo addresses.`,
    };
  }

  try {
    const res = await fetch('/api/validate-recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.valid === false) {
        if (data.isTestDomain || data.isBlockedAlias || data.reason?.includes('NXDOMAIN') || data.reason?.includes('no active mail server')) {
          return data;
        }
        return {
          valid: true,
          warning: data.reason,
          correctedEmail: resolution.wasCorrected ? trimmed : undefined,
          wasCorrected: resolution.wasCorrected,
        };
      }
      return {
        ...data,
        correctedEmail: data.correctedEmail || (resolution.wasCorrected ? trimmed : undefined),
        wasCorrected: Boolean(data.wasCorrected || resolution.wasCorrected),
      };
    }
  } catch (e) {
    // Soft fallback if server endpoint offline
  }

  return {
    valid: true,
    correctedEmail: resolution.wasCorrected ? trimmed : undefined,
    wasCorrected: resolution.wasCorrected,
    warning: resolution.wasCorrected ? resolution.bouncePreventionNote : undefined,
  };
}

export interface EmailAttachmentPayload {
  filename: string;
  mimeType: string;
  base64: string;
}

/**
 * Encodes an email into RFC 2822 standard MIME format with optional PDF attachment
 * and professional photograph attachments, then converts to Base64URL for the Gmail API.
 */
export function buildGmailRawMessage(params: {
  recipient: string;
  senderEmail?: string;
  senderName?: string;
  subject: string;
  bodyText: string;
  selectedCvId?: string;
  pdfBase64?: string;
  pdfFilename?: string;
  pdfMimeType?: string;
  cvAttachment?: {
    filename: string;
    base64: string;
    mimeType?: string;
  };
  coverLetterPdfBase64?: string;
  coverLetterPdfFilename?: string;
  imageAttachments?: EmailAttachmentPayload[];
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  // RFC 2047 encoded subject safely handles en-dashes (–), quotes, and special characters
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(params.subject)}?=`;

  let fromHeader = '';
  let replyToHeader = '';
  if (params.senderEmail) {
    if (params.senderName) {
      fromHeader = `From: =?UTF-8?B?${utf8ToBase64(params.senderName)}?= <${params.senderEmail}>`;
    } else {
      fromHeader = `From: <${params.senderEmail}>`;
    }
    // Ensures any reply from employer arrives directly in the user's primary Gmail inbox
    replyToHeader = `Reply-To: <${params.senderEmail}>`;
  }

  const headers = [
    `To: ${params.recipient}`,
    fromHeader,
    replyToHeader,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
  ].filter(Boolean);

  // GUARANTEE: Never omit CV attachment when sending applications, and validate PDF integrity
  let cvBase64 = params.cvAttachment?.base64 || params.pdfBase64;
  let cvFilename = params.cvAttachment?.filename || params.pdfFilename || 'Fazle_Rabbi_CV.pdf';
  let cvMime = params.cvAttachment?.mimeType || params.pdfMimeType;

  const isDocFile = cvFilename.toLowerCase().endsWith('.docx') || cvFilename.toLowerCase().endsWith('.doc');
  if (!cvBase64 || (!isDocFile && !isValidPdfBase64(cvBase64))) {
    try {
      const fallbackPayload = getCVAttachmentPayload(params.selectedCvId);
      if (fallbackPayload && fallbackPayload.base64) {
        cvBase64 = fallbackPayload.base64;
        cvFilename = fallbackPayload.filename || cvFilename;
        cvMime = fallbackPayload.mimeType || cvMime;
      }
    } catch (err) {
      console.warn('Fallback CV payload resolution error:', err);
    }
  }

  const hasCv = Boolean(cvBase64);
  const hasCoverLetterPdf = Boolean(params.coverLetterPdfBase64 && isValidPdfBase64(params.coverLetterPdfBase64));
  const hasImages = Boolean(params.imageAttachments && params.imageAttachments.length > 0);
  const isMultipart = hasCv || hasCoverLetterPdf || hasImages;

  let fullMime = '';

  if (isMultipart) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const headerBlock = headers.join('\r\n');

    // Part 1: Personalized Cover Letter Body
    const bodyPart = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      chunkBase64(utf8ToBase64(params.bodyText)),
    ].join('\r\n');

    const parts: string[] = [bodyPart];

    // Part 2: Attached CV Document (PDF, DOCX, or DOC)
    if (cvBase64) {
      const cleanCvBase64 = stripBase64Prefix(cvBase64).replace(/\s+/g, '');
      const rawName = cvFilename || 'Fazle_Rabbi_CV.pdf';
      const cleanFilename = rawName.replace(/[^\w\.\-\s]/g, '_');
      
      let mime = cvMime;
      if (!mime) {
        if (cleanFilename.toLowerCase().endsWith('.docx')) {
          mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else if (cleanFilename.toLowerCase().endsWith('.doc')) {
          mime = 'application/msword';
        } else {
          mime = 'application/pdf';
        }
      }

      parts.push(
        [
          `--${boundary}`,
          `Content-Type: ${mime}; name="${cleanFilename}"`,
          `Content-Description: ${cleanFilename}`,
          `Content-Disposition: attachment; filename="${cleanFilename}"`,
          `Content-Transfer-Encoding: base64`,
          ``,
          chunkBase64(cleanCvBase64),
        ].join('\r\n')
      );
    }

    // Part 2.5: Attached Personalized Cover Letter PDF (if provided)
    if (hasCoverLetterPdf && params.coverLetterPdfBase64) {
      const cleanClBase64 = stripBase64Prefix(params.coverLetterPdfBase64).replace(/\s+/g, '');
      const rawClName = params.coverLetterPdfFilename || 'Personalized_Cover_Letter.pdf';
      const cleanClFilename = rawClName.replace(/[^\w\.\-\s]/g, '_');
      parts.push(
        [
          `--${boundary}`,
          `Content-Type: application/pdf; name="${cleanClFilename}"`,
          `Content-Description: ${cleanClFilename}`,
          `Content-Disposition: attachment; filename="${cleanClFilename}"`,
          `Content-Transfer-Encoding: base64`,
          ``,
          chunkBase64(cleanClBase64),
        ].join('\r\n')
      );
    }

    // Part 3: Professional Photographs (if any)
    if (hasImages && params.imageAttachments) {
      for (const img of params.imageAttachments) {
        if (!img.base64) continue;
        const cleanImgBase64 = stripBase64Prefix(img.base64).replace(/\s+/g, '');
        const cleanFilename = img.filename.replace(/[^\w\.\-\s]/g, '_');
        const mime = img.mimeType || 'image/jpeg';

        parts.push(
          [
            `--${boundary}`,
            `Content-Type: ${mime}; name="${cleanFilename}"`,
            `Content-Description: ${cleanFilename}`,
            `Content-Disposition: attachment; filename="${cleanFilename}"`,
            `Content-Transfer-Encoding: base64`,
            ``,
            chunkBase64(cleanImgBase64),
          ].join('\r\n')
        );
      }
    }

    // RFC 2046 compliant multipart message with proper CRLF delimiters
    fullMime = `${headerBlock}\r\n\r\n${parts.join('\r\n')}\r\n--${boundary}--\r\n`;
  } else {
    headers.push(`Content-Type: text/plain; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: base64`);
    const headerBlock = headers.join('\r\n');
    fullMime = `${headerBlock}\r\n\r\n${chunkBase64(utf8ToBase64(params.bodyText))}\r\n`;
  }

  // Base64URL encode without padding
  return utf8ToBase64Url(fullMime);
}

// ==========================================
// Gmail API Sending Execution & Validation
// ==========================================

export async function testGmailTokenValidity(token?: string | null): Promise<boolean> {
  const t = token || getCachedGoogleToken();
  if (!t) return false;
  try {
    // Use OAuth2 tokeninfo endpoint first so we never trigger a false 403 scope error on /profile
    const res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(t)}`);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const expiresIn = Number(data?.expires_in) || 1800;
      setCachedGoogleToken(t, expiresIn);
      return true;
    }
    if (res.status === 400 || res.status === 401) {
      setCachedGoogleToken(null);
      return false;
    }
    return Boolean(t);
  } catch (e) {
    // If network error, treat as valid if cached token exists so temporary glitch does not lock the user out
    return Boolean(t);
  }
}

// Controlled Concurrency (Concurrency = 1) & Rate-Limit Cooldown Tracker
let lastEmailSendTimestamp = 0;
let rateLimitCooldownUntil = 0;
let activeSendMutex: Promise<void> = Promise.resolve();
export const MIN_EMAIL_SEND_INTERVAL_MS = 3800;

export function getGmailRateLimitCooldownRemainingMs(): number {
  return Math.max(0, rateLimitCooldownUntil - Date.now());
}

export interface SendJobApplicationResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  httpStatus?: number;
  error?: string;
  errorCategory?: 'auth' | 'recipient' | 'bounce' | 'rate_limit' | 'formatting' | 'outage' | 'duplicate_blocked' | 'connection_dropped';
  trackingStatus?: EmailTrackingStatus;
  attachedCvFilename?: string;
  isUploadedCv?: boolean;
  bounceCode?: string;
  isBounced?: boolean;
  webmailUrl?: string;
}

/**
 * Generates an official Gmail web composer URL pre-filled with the recipient,
 * subject, and cover letter for manual dispatch or mobile webmail fallback.
 */
export function createGmailWebmailUrl(params: {
  recipient: string;
  subject: string;
  bodyText: string;
}): string {
  const encTo = encodeURIComponent((params.recipient || '').trim());
  const encSu = encodeURIComponent((params.subject || '').trim());
  const encBody = encodeURIComponent((params.bodyText || '').trim());
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encTo}&su=${encSu}&body=${encBody}`;
}

export function recordSentApplicationInDatabase(params: {
  jobId?: string;
  company?: string;
  position?: string;
  location?: string;
  recipientEmail: string;
  subject: string;
  bodyText?: string;
  cvTitle?: string;
  selectedCvId?: string;
  gmailMessageId?: string;
  method?: 'gmail_api' | 'gmail_webmail' | 'default_mail';
}) {
  const nowStr = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const methodLabel = params.method === 'gmail_webmail' ? 'Gmail Webmail' : 'Gmail API';
  const effectiveCompany = params.company || 'Prospective Employer';
  const effectivePosition = params.position || 'Hospitality Professional';

  try {
    saveApplication({
      jobId: params.jobId || `app-${Date.now()}`,
      jobTitle: effectivePosition,
      company: effectiveCompany,
      location: params.location || 'Europe',
      status: 'applied',
      notes: `Dispatched via ${methodLabel} to ${params.recipientEmail}. ${
        params.gmailMessageId ? `Message ID: ${params.gmailMessageId}. ` : ''
      }Attached CV: ${params.cvTitle || 'Fazle Rabbi CV'}`,
    });

    recordAppliedJob({
      job: {
        id: params.jobId || `applied-${Date.now()}`,
        company: effectiveCompany,
        position: effectivePosition,
        location: params.location || 'Europe',
        recipientEmail: params.recipientEmail,
        subject: params.subject,
        coverLetter: params.bodyText || '',
        status: 'applied',
        sentTimestamp: nowStr,
      } as any,
      gmailMessageId: params.gmailMessageId,
      status: 'applied',
      cvId: params.selectedCvId,
      cvTitle: params.cvTitle,
      subject: params.subject,
      coverLetter: params.bodyText,
    });
  } catch (err) {
    console.warn('Auto application tracking sync note:', err);
  }
}

/**
 * Helper to record non-sent status entries (Failed, Blocked/Rate Limited, Needs Action)
 * in the central sending history without ever marking them as Sent.
 */
function recordNonSentTrackingStatus(params: {
  id: string;
  recipient: string;
  company?: string;
  position?: string;
  subject: string;
  coverLetter?: string;
  cvTitle: string;
  selectedCvId?: string;
  isUploadedCv?: boolean;
  sendingAccount?: string;
  attemptCount?: number;
  status: EmailTrackingStatus;
  errorReason: string;
  errorCategory?: GmailSendingRecord['errorCategory'];
}) {
  const nowDisplay = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const existingHistory = loadLocalSendingHistory();
  const deliveryMap: Record<EmailTrackingStatus, GmailSendingRecord['deliveryStatus']> = {
    draft: 'pending',
    queued: 'queued',
    sending: 'sending',
    accepted_by_gmail: 'accepted_by_gmail',
    delivery_unconfirmed: 'delivery_unconfirmed',
    temporary_delivery_failure: 'temporary_delivery_failure',
    delivered: 'delivered',
    bounced: 'bounced',
    sent: 'accepted_by_gmail',
    pending: 'pending',
    rate_limited: 'temporary_delivery_failure',
    blocked: 'needs_action',
    blocked_rate_limited: 'temporary_delivery_failure',
    failed: 'failed_to_send',
    failed_to_send: 'failed_to_send',
    needs_action: 'needs_action',
    needs_review: 'needs_review',
    delivery_failed: 'bounced',
  };

  const emailRes = resolveVerifiedEmployerEmail(params.recipient, params.company);
  const activeSender = params.sendingAccount || getActiveSenderAccount().email;

  const newRecord: GmailSendingRecord = {
    id: params.id,
    timestamp: nowDisplay,
    recipient: params.recipient,
    company: params.company || 'Employer',
    position: params.position || params.subject,
    subject: params.subject,
    coverLetter: params.coverLetter,
    cvTitle: params.cvTitle,
    selectedCvId: params.selectedCvId,
    isUploadedCv: params.isUploadedCv,
    sendingAccount: activeSender,
    attemptCount: params.attemptCount || 1,
    lastAttemptAt: new Date().toISOString(),
    contactSourceUrl: emailRes.sourceUrl,
    contactFoundOnPage: emailRes.foundOnPage,
    contactType: emailRes.contactType,
    contactVerificationDate: emailRes.verificationDate,
    contactConfidence: emailRes.confidence,
    status: params.status,
    deliveryStatus: deliveryMap[params.status] || 'failed_to_send',
    errorReason: params.errorReason,
    errorCategory: params.errorCategory,
    sourceAI: 'Gemini',
    replyStatus: params.status === 'bounced' ? 'bounced' : 'none',
  };

  // Replace any existing record with the same id or non-sent attempt for the same recipient+company so history never has duplicate keys
  const filtered = existingHistory.filter(
    r =>
      r.id !== params.id &&
      (r.status === 'accepted_by_gmail' ||
        r.status === 'delivered' ||
        r.status === 'sent' ||
        !(r.recipient === params.recipient && r.company === params.company))
  );
  saveLocalSendingHistory([newRecord, ...filtered]);
}

/**
 * Checks Gmail Sent folder for an existing message to the recipient before retrying an uncertain
 * or timed-out send request. Prevents duplicate applications when a previous network request dropped
 * after Gmail had already accepted the message.
 */
export async function checkGmailSentBeforeRetry(params: {
  recipient: string;
  subject?: string;
  company?: string;
  accessToken?: string | null;
}): Promise<{
  alreadyInSent: boolean;
  messageId?: string;
  threadId?: string;
  sentDate?: string;
}> {
  const token = params.accessToken || getCachedGoogleToken();
  const cleanRecipient = (params.recipient || '').trim().toLowerCase();
  if (!token || !cleanRecipient) {
    return { alreadyInSent: false };
  }

  try {
    const queryParts = [`in:sent`, `to:${cleanRecipient}`];
    if (params.company && params.company.trim().length > 2) {
      queryParts.push(`"${params.company.trim()}"`);
    }
    const q = encodeURIComponent(queryParts.join(' '));
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=3`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      return { alreadyInSent: false };
    }
    const data = await res.json();
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      const msg = data.messages[0];
      return {
        alreadyInSent: true,
        messageId: msg.id,
        threadId: msg.threadId,
        sentDate: new Date().toLocaleString('en-GB'),
      };
    }
  } catch (err) {
    console.warn('[GmailAPI] Pre-retry Sent folder check note:', err);
  }
  return { alreadyInSent: false };
}

/**
 * Verifies that the selected CV from the Central CV Library exists, is readable,
 * and contains a valid PDF (%PDF-) or DOCX/DOC binary payload (never a bare filename reference).
 */
export async function verifyCvAttachmentIntegrity(
  selectedCvId?: string,
  customAttachment?: { filename?: string; base64?: string; mimeType?: string }
): Promise<{
  valid: boolean;
  filename: string;
  base64: string;
  mimeType: string;
  isUploadedFile: boolean;
  cvId?: string;
  sizeBytes: number;
  errorReason?: string;
}> {
  const resolvedCvPayload = await resolveCVAttachmentPayloadAsync(selectedCvId);
  let effectivePdfBase64 = '';
  let effectivePdfFilename = '';
  let effectivePdfMime = '';
  const isUploadedFile = Boolean(resolvedCvPayload.isUploadedFile);
  const activeCvIdUsed = resolvedCvPayload.cvDocument?.id || selectedCvId;

  if (resolvedCvPayload.isUploadedFile && resolvedCvPayload.base64 && resolvedCvPayload.base64.length > 100) {
    effectivePdfBase64 = stripBase64Prefix(resolvedCvPayload.base64);
    effectivePdfFilename = resolvedCvPayload.filename;
    effectivePdfMime = resolvedCvPayload.mimeType || 'application/pdf';
  } else {
    effectivePdfBase64 = stripBase64Prefix(
      customAttachment?.base64 || resolvedCvPayload.base64 || ''
    );
    effectivePdfFilename =
      customAttachment?.filename || resolvedCvPayload.filename || 'Fazle_Rabbi_CV.pdf';
    effectivePdfMime =
      customAttachment?.mimeType || resolvedCvPayload.mimeType || 'application/pdf';

    const isDocFile =
      effectivePdfFilename.toLowerCase().endsWith('.docx') ||
      effectivePdfFilename.toLowerCase().endsWith('.doc');
    if (!isDocFile && !isValidPdfBase64(effectivePdfBase64)) {
      effectivePdfBase64 = stripBase64Prefix(resolvedCvPayload.base64 || '');
      effectivePdfFilename = resolvedCvPayload.filename;
      effectivePdfMime = resolvedCvPayload.mimeType || 'application/pdf';
    }
  }

  const cleanB64 = effectivePdfBase64.replace(/\s+/g, '');
  const sizeBytes = Math.floor((cleanB64.length * 3) / 4);
  const isDocxOrDoc =
    effectivePdfFilename.toLowerCase().endsWith('.docx') ||
    effectivePdfFilename.toLowerCase().endsWith('.doc');

  if (!cleanB64 || cleanB64.length < 200 || (!isDocxOrDoc && !isValidPdfBase64(cleanB64))) {
    return {
      valid: false,
      filename: effectivePdfFilename || 'Missing_CV.pdf',
      base64: '',
      mimeType: effectivePdfMime || 'application/pdf',
      isUploadedFile,
      cvId: activeCvIdUsed,
      sizeBytes: 0,
      errorReason:
        'NEEDS_ACTION: Selected CV from the Central CV Library is missing or unreadable as a real PDF/DOCX file. Sending halted so a filename reference is never sent without the actual CV file.',
    };
  }

  return {
    valid: true,
    filename: effectivePdfFilename,
    base64: cleanB64,
    mimeType: effectivePdfMime,
    isUploadedFile,
    cvId: activeCvIdUsed,
    sizeBytes,
  };
}

/**
 * Sends a job application via Gmail API with:
 * a. Strict Regex, Verified Employer Email Registry, and live MX record verification
 * b. Exact original uploaded CV file attachment when an uploaded CV is selected
 * c. Accurate distinction between Accepted by Gmail / Sent, Delivery Unconfirmed, Temporary Delivery Failure, Bounced / Rejected, Failed to Send, and Needs Action
 * d. Pre-retry Gmail Sent folder verification for uncertain/interrupted sends
 * e. Bounded exponential backoff strictly for temporary 429/5xx errors; never auto-retries permanent failures or bounces
 */
export async function sendJobApplicationViaGmail(params: {
  recipient: string;
  subject: string;
  bodyText: string;
  selectedCvId?: string;
  pdfBase64?: string;
  pdfFilename?: string;
  pdfMimeType?: string;
  cvAttachment?: {
    filename: string;
    base64: string;
    mimeType?: string;
  };
  attachCoverLetterPdf?: boolean;
  coverLetterPdfBase64?: string;
  coverLetterPdfFilename?: string;
  imageAttachments?: EmailAttachmentPayload[];
  accessToken?: string;
  company?: string;
  position?: string;
  location?: string;
  jobId?: string;
  cvTitle?: string;
  allowResend?: boolean;
  isTestDelivery?: boolean;
  attemptCount?: number;
}): Promise<SendJobApplicationResult> {
  let releaseMutex: () => void = () => {};
  const previousMutex = activeSendMutex;
  activeSendMutex = new Promise<void>(resolve => {
    releaseMutex = resolve;
  });

  await previousMutex;

  try {
    const activeSenderAcc = getActiveSenderAccount();
    // Refresh the access token before it expires if < 5 minutes remain
    let token = params.accessToken || activeSenderAcc.accessToken || getCachedGoogleToken();
    if (!token || getGoogleTokenTimeRemainingMs() < 5 * 60 * 1000) {
      const refreshed = await ensureFreshGoogleAccessToken(5 * 60 * 1000);
      if (refreshed) token = refreshed;
    }
    const { cleanedText } = validateSingleCoverLetter(params.bodyText || '');
    const cleanSubject = (params.subject || '').trim();
    const rawRecipient = (params.recipient || '').trim();

    // 1. Validate Recipient, Subject, and Email Body before sending
    if (!rawRecipient) {
      return {
        success: false,
        error: 'NEEDS_ACTION (No Verified Hiring Contact): No verified employer email address is available for this role. Please apply via the official employer portal or enter a verified HR contact.',
        errorCategory: 'recipient',
        trackingStatus: 'needs_action',
      };
    }

    // 1b. Resolve & Block Known Bouncing / Portal-Only / Non-Hiring Aliases (prevents Exchange postmaster bounces & reception/reservations spam)
    const emailResolution = resolveVerifiedEmployerEmail(rawRecipient, params.company);
    if (!emailResolution.isDeliverable) {
      const isNonHiring = Boolean(emailResolution.isNonHiringAliasRejected);
      const blockReason =
        emailResolution.bouncePreventionNote ||
        `No verified hiring contact found: "${rawRecipient}" is not a verified recruitment inbox. Please apply via the official employer career portal.`;
      return {
        success: false,
        error: blockReason,
        errorCategory: isNonHiring ? 'recipient' : 'bounce',
        trackingStatus: isNonHiring ? 'needs_action' : 'bounced',
        isBounced: !isNonHiring,
        bounceCode: isNonHiring ? undefined : '550',
      };
    }

    const cleanRecipient = emailResolution.verifiedEmail || rawRecipient;
    if (emailResolution.wasCorrected) {
      console.log(
        `[GmailAPI] Auto-upgraded legacy/non-hiring recipient "${rawRecipient}" -> verified official HR address "${cleanRecipient}" (${emailResolution.verificationSource})`
      );
    }

    const submissionId = getApplicationDedupKey({
      jobId: params.jobId,
      recipient: cleanRecipient,
      company: params.company,
      position: params.position,
    });

    if (!cleanSubject || cleanSubject.length < 3) {
      return {
        success: false,
        error: 'NEEDS_ACTION: Email subject line cannot be empty. Please provide a clear application subject.',
        errorCategory: 'formatting',
        trackingStatus: 'needs_action',
      };
    }

    if (!cleanedText || cleanedText.length < 15) {
      return {
        success: false,
        error: 'NEEDS_ACTION: Email cover letter body is empty or too short. Please generate or enter a cover letter before sending.',
        errorCategory: 'formatting',
        trackingStatus: 'needs_action',
      };
    }

    // 2. Check Persistent Submission Identifier, Pre-Retry Gmail Sent Folder Check & Duplicate / Bounce Protection
    if (!params.isTestDelivery) {
      const dupCheck = hasAlreadySentApplication({
        jobId: params.jobId,
        recipient: cleanRecipient,
        company: params.company,
        position: params.position,
      });
      if (dupCheck.alreadyBounced) {
        return {
          success: false,
          error:
            dupCheck.record?.errorReason ||
            `BOUNCED / REJECTED (Permanent Failure): Previous delivery to ${cleanRecipient} bounced from the recipient mail server. Automatic resending is permanently blocked.`,
          errorCategory: 'bounce',
          trackingStatus: 'bounced',
          isBounced: true,
        };
      }
      if (!params.allowResend && dupCheck.alreadySent && dupCheck.record) {
        return {
          success: false,
          error: `BLOCKED (Duplicate Prevented): Application was already accepted by Gmail for ${cleanRecipient} (${params.company || 'Employer'}, Message ID: ${dupCheck.record.messageId} on ${dupCheck.record.timestamp}).`,
          errorCategory: 'duplicate_blocked',
          trackingStatus: 'blocked',
        };
      }
      // If a previous send had an uncertain network interruption, check Gmail Sent first!
      if (dupCheck.uncertainDelivery && dupCheck.submissionEntry) {
        const sentCheck = await checkGmailSentBeforeRetry({
          recipient: cleanRecipient,
          subject: cleanSubject,
          company: params.company,
          accessToken: token,
        });
        if (sentCheck.alreadyInSent && sentCheck.messageId) {
          console.log(
            `[GmailAPI] Recovered previously sent message in Gmail Sent folder (${sentCheck.messageId}) for ${cleanRecipient} — preventing duplicate send!`
          );
          savePersistentSubmission({
            submissionId,
            recipient: cleanRecipient,
            company: params.company || 'Employer',
            position: params.position || cleanSubject,
            status: 'accepted_by_gmail',
            messageId: sentCheck.messageId,
            threadId: sentCheck.threadId,
            updatedAt: new Date().toISOString(),
          });
          recordSentApplicationInDatabase({
            jobId: params.jobId,
            company: params.company,
            position: params.position,
            location: params.location,
            recipientEmail: cleanRecipient,
            subject: cleanSubject,
            bodyText: cleanedText,
            cvTitle: params.cvTitle,
            selectedCvId: params.selectedCvId,
            gmailMessageId: sentCheck.messageId,
            method: 'gmail_api',
          });
          return {
            success: true,
            messageId: sentCheck.messageId,
            threadId: sentCheck.threadId,
            trackingStatus: 'accepted_by_gmail',
          };
        }
        if (!params.allowResend) {
          return {
            success: false,
            error: `NEEDS_ACTION (Uncertain Delivery Status): A previous transmission to ${cleanRecipient} interrupted mid-flight (${dupCheck.submissionEntry.lastError || 'network interruption'}). Automatic resending is paused to prevent duplicates; click Retry to re-verify Gmail Sent and send safely.`,
            errorCategory: 'outage',
            trackingStatus: 'needs_action',
          };
        }
      }
    }

    // 3. Verify Real CV Attachment from Central CV Library (Requirement 6)
    const cvIntegrity = await verifyCvAttachmentIntegrity(params.selectedCvId, {
      filename: params.cvAttachment?.filename || params.pdfFilename,
      base64: params.cvAttachment?.base64 || params.pdfBase64,
      mimeType: params.cvAttachment?.mimeType || params.pdfMimeType,
    });
    if (!cvIntegrity.valid) {
      return {
        success: false,
        error: cvIntegrity.errorReason || 'NEEDS_ACTION: Missing or invalid CV attachment.',
        errorCategory: 'formatting',
        trackingStatus: 'needs_action',
      };
    }

    const effectivePdfBase64 = cvIntegrity.base64;
    const effectivePdfFilename = cvIntegrity.filename;
    const effectivePdfMime = cvIntegrity.mimeType;
    const isUploadedCv = cvIntegrity.isUploadedFile;
    const activeCvIdUsed = cvIntegrity.cvId;

    // Resolve optional Cover Letter PDF attachment
    let effectiveClPdfBase64 = params.coverLetterPdfBase64;
    let effectiveClPdfFilename = params.coverLetterPdfFilename;
    if (params.attachCoverLetterPdf && (!effectiveClPdfBase64 || !isValidPdfBase64(effectiveClPdfBase64))) {
      const safeEmployer = (params.company || 'Employer').replace(/[^\w\d-_]/g, '_').replace(/_+/g, '_');
      effectiveClPdfBase64 = generateCoverLetterPdfBase64({
        employer: params.company || 'Hiring Team',
        jobTitle: params.position || 'Open Position',
        country: params.location,
        coverLetterText: cleanedText,
      });
      effectiveClPdfFilename = `Cover_Letter_${safeEmployer}.pdf`;
    }

    const currentUser = auth.currentUser;
    const userEmail = activeSenderAcc.email || currentUser?.email || getCachedUserEmail();
    const userName = activeSenderAcc.displayName || currentUser?.displayName || getCachedUserName();

    const preserveOnFailure = (
      reason: string,
      trackingStatus: EmailTrackingStatus = 'failed',
      errorCategory?: GmailSendingRecord['errorCategory'],
      subStatus: PersistentSubmissionEntry['status'] = 'failed'
    ) => {
      if (errorCategory === 'rate_limit') {
        recordSenderAccountActivity({ email: userEmail, rateLimited: true, errorMsg: reason });
      }
      if (!params.isTestDelivery) {
        savePersistentSubmission({
          submissionId,
          recipient: cleanRecipient,
          company: params.company || 'Employer',
          position: params.position || cleanSubject,
          status: subStatus,
          lastError: reason,
          updatedAt: new Date().toISOString(),
        });
        savePreservedFailedApplication({
          submissionId,
          jobId: params.jobId,
          company: params.company || 'Prospective Employer',
          position: params.position || 'Open Role',
          location: params.location,
          recipient: cleanRecipient,
          subject: cleanSubject,
          coverLetter: cleanedText,
          selectedCvId: activeCvIdUsed,
          cvFilename: effectivePdfFilename,
          attachCoverLetterPdf: params.attachCoverLetterPdf,
          trackingStatus,
          errorCategory,
          lastError: reason,
        });
        recordNonSentTrackingStatus({
          id: params.jobId || submissionId,
          recipient: cleanRecipient,
          company: params.company,
          position: params.position,
          subject: cleanSubject,
          coverLetter: cleanedText,
          cvTitle: params.cvTitle || effectivePdfFilename,
          selectedCvId: activeCvIdUsed,
          isUploadedCv,
          sendingAccount: userEmail,
          attemptCount: params.attemptCount || 1,
          status: trackingStatus,
          errorReason: reason,
          errorCategory,
        });
      }
    };

    // 4. Strict RFC 5322 Regex & MX Record Verification
    const RFC5322_STRICT_REGEX =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!RFC5322_STRICT_REGEX.test(cleanRecipient)) {
      const errMsg = `NEEDS_ACTION (Invalid Recipient): "${cleanRecipient}" failed RFC 5322 email syntax validation.`;
      preserveOnFailure(errMsg, 'needs_action', 'recipient', 'needs_action');
      return {
        success: false,
        error: errMsg,
        errorCategory: 'recipient',
        trackingStatus: 'needs_action',
        attachedCvFilename: effectivePdfFilename,
        isUploadedCv,
      };
    }

    const validation = await validateRecipientAddress(cleanRecipient);
    if (!validation.valid) {
      const errMsg = `BOUNCED / BLOCKED (Invalid Recipient Domain): ${validation.reason || 'Invalid recipient or missing MX record'}`;
      preserveOnFailure(errMsg, 'bounced', 'bounce', 'bounced');
      return {
        success: false,
        error: errMsg,
        errorCategory: 'bounce',
        trackingStatus: 'bounced',
        attachedCvFilename: effectivePdfFilename,
        isUploadedCv,
        isBounced: true,
        bounceCode: '550',
      };
    }

    const webmailUrl = createGmailWebmailUrl({
      recipient: cleanRecipient,
      subject: cleanSubject,
      bodyText: cleanedText,
    });

    if (!token) {
      const errMsg =
        'NEEDS_ACTION (Authorization Required): Gmail session is not connected or expired. Please click Connect Gmail Account.';
      preserveOnFailure(errMsg, 'needs_action', 'auth', 'needs_action');
      return {
        success: false,
        error: errMsg,
        errorCategory: 'auth',
        trackingStatus: 'needs_action',
        attachedCvFilename: effectivePdfFilename,
        isUploadedCv,
        webmailUrl,
      };
    }

    // 5. Respect Active Gmail Rate-Limit Cooldown if recently triggered
    const cooldownRem = getGmailRateLimitCooldownRemainingMs();
    if (cooldownRem > 0) {
      if (cooldownRem <= 12000) {
        await new Promise(resolve => setTimeout(resolve, cooldownRem));
      } else {
        const waitSec = Math.ceil(cooldownRem / 1000);
        const rateMsg = `TEMPORARY DELIVERY FAILURE (Rate Limited): Gmail sending is paused for ${waitSec}s to respect Gmail API rate limits. Your application is saved for safe retry.`;
        preserveOnFailure(rateMsg, 'temporary_delivery_failure', 'rate_limit', 'rate_limited');
        return {
          success: false,
          error: rateMsg,
          errorCategory: 'rate_limit',
          trackingStatus: 'temporary_delivery_failure',
          attachedCvFilename: effectivePdfFilename,
          isUploadedCv,
          webmailUrl,
        };
      }
    }

    // 6. Controlled Inter-Message Spacing (prevents rapid bursts that trigger Gmail 429/403 rate limits)
    const now = Date.now();
    const elapsed = now - lastEmailSendTimestamp;
    if (elapsed < MIN_EMAIL_SEND_INTERVAL_MS) {
      const waitMs = MIN_EMAIL_SEND_INTERVAL_MS - elapsed + Math.floor(Math.random() * 450);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    lastEmailSendTimestamp = Date.now();

    console.log(
      `[GmailAPI] Initiating dispatch from "${userEmail}" to: "${cleanRecipient}" | Subject: "${cleanSubject}" | CV: "${effectivePdfFilename}" (${
        isUploadedCv ? 'ORIGINAL UPLOADED FILE' : 'STRUCTURED CV PDF'
      })`
    );

    const rawMessage = buildGmailRawMessage({
      recipient: cleanRecipient,
      senderEmail: userEmail,
      senderName: userName,
      subject: cleanSubject,
      bodyText: cleanedText,
      selectedCvId: activeCvIdUsed,
      pdfBase64: effectivePdfBase64,
      pdfFilename: effectivePdfFilename,
      pdfMimeType: effectivePdfMime,
      cvAttachment: {
        filename: effectivePdfFilename,
        base64: effectivePdfBase64,
        mimeType: effectivePdfMime,
      },
      coverLetterPdfBase64: effectiveClPdfBase64,
      coverLetterPdfFilename: effectiveClPdfFilename,
      imageAttachments: params.imageAttachments,
    });

    const finalizeAcceptedByGmail = (messageId: string, threadId?: string) => {
      recordSenderAccountActivity({ email: userEmail, sentSuccess: true });
      savePersistentSubmission({
        submissionId,
        recipient: cleanRecipient,
        company: params.company || (params.isTestDelivery ? 'Test Delivery Verification' : 'Employer'),
        position: params.position || cleanSubject,
        status: 'accepted_by_gmail',
        messageId,
        threadId,
        updatedAt: new Date().toISOString(),
      });

      removePreservedFailedApplication({
        jobId: params.jobId,
        recipient: cleanRecipient,
        company: params.company,
        position: params.position,
      });

      const nowDisplay = new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const existingHistory = loadLocalSendingHistory();
      const newRecord: GmailSendingRecord = {
        id: params.jobId || submissionId,
        timestamp: nowDisplay,
        recipient: cleanRecipient,
        company: params.company || (params.isTestDelivery ? 'Test Delivery Verification' : 'Employer'),
        position: params.position || cleanSubject,
        subject: cleanSubject,
        coverLetter: cleanedText,
        cvTitle: params.cvTitle || effectivePdfFilename,
        selectedCvId: activeCvIdUsed,
        isUploadedCv,
        sendingAccount: userEmail,
        attemptCount: params.attemptCount || 1,
        lastAttemptAt: new Date().toISOString(),
        contactSourceUrl: emailResolution.sourceUrl,
        contactFoundOnPage: emailResolution.foundOnPage,
        contactType: emailResolution.contactType,
        contactVerificationDate: emailResolution.verificationDate,
        contactConfidence: emailResolution.confidence,
        status: 'accepted_by_gmail',
        deliveryStatus: 'accepted_by_gmail',
        messageId,
        threadId,
        sourceAI: 'Gemini',
        replyStatus: 'none',
      };
      const cleanedHistory = existingHistory.filter(
        r =>
          r.id !== newRecord.id &&
          r.messageId !== messageId &&
          !(
            r.status !== 'accepted_by_gmail' &&
            r.status !== 'delivered' &&
            r.status !== 'sent' &&
            (r.id === params.jobId ||
              r.id === submissionId ||
              (r.recipient === cleanRecipient && r.company === params.company))
          )
      );
      saveLocalSendingHistory([newRecord, ...cleanedHistory]);

      if (!params.isTestDelivery) {
        recordSentApplicationInDatabase({
          jobId: params.jobId,
          company: params.company,
          position: params.position,
          location: params.location,
          recipientEmail: cleanRecipient,
          subject: cleanSubject,
          bodyText: cleanedText,
          cvTitle: params.cvTitle || effectivePdfFilename,
          selectedCvId: activeCvIdUsed,
          gmailMessageId: messageId,
          method: 'gmail_api',
        });

        if (params.jobId) {
          fetch('/api/jobs/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: params.jobId,
              method: 'gmail',
              status: 'submitted',
              cvId: activeCvIdUsed,
              cvTitle: params.cvTitle || effectivePdfFilename,
              coverLetter: cleanedText,
              attachments: [effectivePdfFilename, effectiveClPdfFilename].filter(Boolean),
              gmailMessageId: messageId,
              notes: `Accepted by Gmail API (Message ID: ${messageId}) — final recipient delivery unconfirmed until employer response`,
            }),
          }).catch(() => {});
        }
      }
    };

    const classifyHttpFailure = (
      status: number,
      errJson: any
    ): {
      isRateLimit: boolean;
      isTemporaryServerError: boolean;
      isAuthError: boolean;
      isBlocked: boolean;
      message: string;
    } => {
      const apiReason = String(
        errJson?.error?.errors?.[0]?.reason ||
          errJson?.error?.status ||
          errJson?.reason ||
          errJson?.errorCategory ||
          ''
      ).toLowerCase();
      const apiMessage = String(
        errJson?.error?.message ||
          errJson?.error?.errors?.[0]?.message ||
          (typeof errJson?.error === 'string' ? errJson.error : '') ||
          errJson?.message ||
          ''
      );
      const lowerMsg = apiMessage.toLowerCase();

      const isRateLimit =
        status === 429 ||
        apiReason.includes('ratelimit') ||
        apiReason.includes('quotalimit') ||
        apiReason.includes('dailylimit') ||
        apiReason.includes('userratelimit') ||
        apiReason.includes('rate_limit') ||
        lowerMsg.includes('rate limit') ||
        lowerMsg.includes('quota exceeded') ||
        lowerMsg.includes('too many requests') ||
        lowerMsg.includes('sending limit') ||
        lowerMsg.includes('concurrent');

      if (isRateLimit) {
        rateLimitCooldownUntil = Date.now() + 30000;
        const exactReason = apiReason || (status === 429 ? 'rateLimitExceeded' : 'userRateLimitExceeded');
        return {
          isRateLimit: true,
          isTemporaryServerError: false,
          isAuthError: false,
          isBlocked: false,
          message: `HTTP ${status} (${exactReason}): ${apiMessage || 'Gmail rate limit exceeded'}`,
        };
      }

      if (status === 500 || status === 502 || status === 503 || status === 504) {
        return {
          isRateLimit: false,
          isTemporaryServerError: true,
          isAuthError: false,
          isBlocked: false,
          message: `HTTP ${status} (${apiReason || 'backendError'}): ${
            apiMessage || 'Gmail service temporarily unavailable.'
          }`,
        };
      }

      if (status === 401 || lowerMsg.includes('invalid credentials') || lowerMsg.includes('unauthenticated')) {
        setCachedGoogleToken(null);
        return {
          isRateLimit: false,
          isTemporaryServerError: false,
          isAuthError: true,
          isBlocked: false,
          message: `HTTP 401 (${apiReason || 'authError'}): ${
            apiMessage || 'Gmail OAuth access token expired or invalid. Please reconnect Gmail.'
          }`,
        };
      }

      if (status === 403) {
        if (lowerMsg.includes('insufficient authentication scopes') || lowerMsg.includes('insufficient permission')) {
          return {
            isRateLimit: false,
            isTemporaryServerError: false,
            isAuthError: true,
            isBlocked: false,
            message: `HTTP 403 (${apiReason || 'insufficientPermissions'}): ${apiMessage || 'Gmail send permission (gmail.send) is required.'}`,
          };
        }
        return {
          isRateLimit: false,
          isTemporaryServerError: false,
          isAuthError: false,
          isBlocked: true,
          message: `HTTP 403 (${apiReason || 'forbidden'}): ${
            apiMessage || 'Gmail API refused this transmission.'
          }`,
        };
      }

      return {
        isRateLimit: false,
        isTemporaryServerError: false,
        isAuthError: false,
        isBlocked: false,
        message: apiMessage ? `HTTP ${status} (${apiReason || 'error'}): ${apiMessage}` : `HTTP ${status}: Gmail API request failed`,
      };
    };

    // Mark persistent submission as in-flight ("sending") before network transmission
    if (!params.isTestDelivery) {
      savePersistentSubmission({
        submissionId,
        recipient: cleanRecipient,
        company: params.company || 'Employer',
        position: params.position || cleanSubject,
        status: 'in_flight',
        updatedAt: new Date().toISOString(),
      });
    }

    // Single atomic Gmail API send attempt (queue engine handles 30s/60s/120s rate-limit backoff)
    try {
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: rawMessage,
        }),
      });

      if (response.ok) {
        const clientData = await response.json();
        if (clientData && clientData.id) {
          console.log('[GmailAPI] Confirmed Gmail API acceptance. Message ID:', clientData.id);
          finalizeAcceptedByGmail(clientData.id, clientData.threadId);
          return {
            success: true,
            messageId: clientData.id,
            threadId: clientData.threadId,
            httpStatus: response.status,
            trackingStatus: 'accepted_by_gmail',
            attachedCvFilename: effectivePdfFilename,
            isUploadedCv,
            webmailUrl,
          };
        }
      }

      const errJson = await response.json().catch(() => ({}));
      console.warn(`[GmailAPI] Gmail API returned HTTP ${response.status}:`, errJson);
      const classified = classifyHttpFailure(response.status, errJson);

      if (classified.isRateLimit) {
        preserveOnFailure(classified.message, 'rate_limited', 'rate_limit', 'rate_limited');
        return {
          success: false,
          httpStatus: response.status,
          error: classified.message,
          errorCategory: 'rate_limit',
          trackingStatus: 'rate_limited',
          attachedCvFilename: effectivePdfFilename,
          isUploadedCv,
          webmailUrl,
        };
      }

      if (classified.isAuthError) {
        preserveOnFailure(classified.message, 'needs_action', 'auth', 'needs_action');
        return {
          success: false,
          httpStatus: response.status,
          error: classified.message,
          errorCategory: 'auth',
          trackingStatus: 'needs_action',
          attachedCvFilename: effectivePdfFilename,
          isUploadedCv,
          webmailUrl,
        };
      }

      if (classified.isBlocked) {
        preserveOnFailure(classified.message, 'bounced', 'bounce', 'bounced');
        return {
          success: false,
          httpStatus: response.status,
          error: classified.message,
          errorCategory: 'bounce',
          trackingStatus: 'bounced',
          attachedCvFilename: effectivePdfFilename,
          isUploadedCv,
          webmailUrl,
        };
      }

      preserveOnFailure(
        classified.message,
        'failed',
        response.status === 400 ? 'formatting' : 'outage',
        'failed'
      );
      return {
        success: false,
        httpStatus: response.status,
        error: classified.message,
        errorCategory: response.status === 400 ? 'formatting' : 'outage',
        trackingStatus: 'failed',
        attachedCvFilename: effectivePdfFilename,
        isUploadedCv,
        webmailUrl,
      };
    } catch (clientErr: any) {
      // Ported from mailer.py `SendError(..., kind="dropped")`:
      // If the connection drops during sending, mark needs_review and do NOT auto-resend!
      const rawDropText = clientErr?.message || String(clientErr || 'Connection dropped');
      const dropMsg = `needs_review: Connection dropped during send (${rawDropText}) — check Gmail Sent folder before retrying. Auto-resend disabled.`;
      console.warn('[GmailAPI] Connection dropped during send -> needs_review:', dropMsg);
      preserveOnFailure(dropMsg, 'needs_review', 'connection_dropped', 'uncertain');
      return {
        success: false,
        error: dropMsg,
        errorCategory: 'connection_dropped',
        trackingStatus: 'needs_review',
        attachedCvFilename: effectivePdfFilename,
        isUploadedCv,
        webmailUrl,
      };
    }
  } catch (err: any) {
    console.error('[GmailAPI] Unexpected error during sendJobApplicationViaGmail:', err);
    return {
      success: false,
      error: `FAILED: ${err?.message || 'Unexpected error during email transmission.'}`,
      errorCategory: 'outage',
      trackingStatus: 'failed',
    };
  } finally {
    releaseMutex();
  }
}

/**
 * Generates a high-quality, personalized hospitality cover letter using Gemini
 * and the candidate's actual selected/default CV from the Central CV Library.
 * Strictly never invents personal experience or qualifications.
 */
export async function generatePersonalizedCoverLetterWithGemini(params: {
  company: string;
  jobTitle: string;
  location?: string;
  jobDescription?: string;
  verifiedRequirements?: string[] | string;
  selectedCvId?: string;
}): Promise<{
  coverLetter: string;
  subjectLine: string;
  cvUsedName: string;
  source: string;
}> {
  const cvDoc = loadSelectedCV(params.selectedCvId);
  const cvExtract = extractVerifiedCvSummary(cvDoc);

  try {
    const res = await fetch('/api/ai/personalize-cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: params.company,
        jobTitle: params.jobTitle,
        location: params.location || 'Europe',
        jobDescription: params.jobDescription || '',
        verifiedRequirements: params.verifiedRequirements || [],
        cvSummary: cvExtract.cvSummaryText,
        candidateName: cvExtract.candidateName,
        candidateTitle: cvExtract.candidateTitle,
        candidateContact: cvExtract.candidateContact,
        verifiedExperiences: cvExtract.verifiedExperiences,
        verifiedSkills: cvExtract.verifiedSkills,
        verifiedEducation: cvExtract.verifiedEducation,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.coverLetter) {
        const { cleanedText } = validateSingleCoverLetter(data.coverLetter);
        return {
          coverLetter: cleanedText,
          subjectLine:
            data.subjectLine ||
            `Application for ${params.jobTitle} – ${params.company} – ${cvExtract.candidateName}`,
          cvUsedName: cvDoc.originalFile?.fileName || cvDoc.name || cvDoc.title || 'Fazle_Rabbi_CV.pdf',
          source: data.source || 'gemini',
        };
      }
    }
  } catch (err) {
    console.warn('Gemini cover letter API fallback:', err);
  }

  // Deterministic fallback using actual CV data if offline
  const fallbackBody = `${cvExtract.candidateName}
${cvExtract.candidateContact}

${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}

Hiring Management Team
${params.company}
${params.location || 'Europe'}

Re: Application for ${params.jobTitle}

Dear Hiring Manager,

I am writing to submit my formal application for the ${params.jobTitle} position at ${params.company}. With verified international hospitality and beverage operations experience as ${cvExtract.candidateTitle}, I am eager to bring my dedication, high-volume service standards, and guest-first mindset to your team.

Key Highlights from My Verified CV:
${cvExtract.verifiedExperiences.slice(0, 3).map(e => `• ${e}`).join('\n')}
• Core Competencies: ${cvExtract.verifiedSkills.slice(0, 8).join(', ')}

Please find my complete CV (${cvDoc.originalFile?.fileName || cvDoc.name}) attached for your review. I am available for an online interview at your earliest convenience and ready to support relocation and visa procedures as required.

Warm regards,

${cvExtract.candidateName}
${cvExtract.candidateTitle}`;

  return {
    coverLetter: fallbackBody,
    subjectLine: `Application for ${params.jobTitle} – ${params.company} – ${cvExtract.candidateName}`,
    cvUsedName: cvDoc.originalFile?.fileName || cvDoc.name || cvDoc.title || 'Fazle_Rabbi_CV.pdf',
    source: 'verified_cv_template',
  };
}

export interface BatchApplicationItem {
  id: string;
  jobId?: string;
  recipient: string;
  company: string;
  position: string;
  location?: string;
  subject: string;
  bodyText: string;
  selectedCvId?: string;
  cvTitle?: string;
  attachCoverLetterPdf?: boolean;
  allowResend?: boolean;
}

export interface BatchItemStatusUpdate {
  id: string;
  status: EmailTrackingStatus;
  messageId?: string;
  error?: string;
  attachedCvFilename?: string;
  isUploadedCv?: boolean;
}

/**
 * Controlled Batch Dispatcher:
 * Sends applications sequentially in controlled batches within Gmail's actual sending limits,
 * enforcing safe inter-message delays, preventing duplicates, and halting immediately if
 * rate-limited or authorization is required so remaining applications are safely preserved.
 */
export async function sendApplicationsInControlledBatch(params: {
  items: BatchApplicationItem[];
  maxBatchSize?: number;
  delayBetweenEmailsMs?: number;
  onItemStatusChange?: (update: BatchItemStatusUpdate) => void;
}): Promise<{
  sentCount: number;
  failedCount: number;
  rateLimitedCount: number;
  needsActionCount: number;
  results: Record<string, SendJobApplicationResult>;
}> {
  const maxBatch = params.maxBatchSize || 40;
  const batchSlice = params.items.slice(0, maxBatch);
  const backoffDelaysMs = [30_000, 60_000, 120_000];

  let sentCount = 0;
  let failedCount = 0;
  let rateLimitedCount = 0;
  let needsActionCount = 0;
  const results: Record<string, SendJobApplicationResult> = {};

  // Mark all items in the batch slice as queued initially
  for (const item of batchSlice) {
    params.onItemStatusChange?.({
      id: item.id,
      status: 'queued',
    });
  }

  for (let i = 0; i < batchSlice.length; i++) {
    const item = batchSlice[i];

    // Mark "sending" right before the request
    params.onItemStatusChange?.({
      id: item.id,
      status: 'sending',
    });

    let res: SendJobApplicationResult | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await sendJobApplicationViaGmail({
        recipient: item.recipient,
        subject: item.subject,
        bodyText: item.bodyText,
        selectedCvId: item.selectedCvId,
        attachCoverLetterPdf: item.attachCoverLetterPdf,
        company: item.company,
        position: item.position,
        location: item.location,
        jobId: item.jobId || item.id,
        cvTitle: item.cvTitle,
        allowResend: item.allowResend,
      });

      if (res.success && res.messageId) {
        break;
      }

      // If connection dropped mid-flight, mark needs_review and DO NOT auto-resend
      if (res.errorCategory === 'connection_dropped' || res.trackingStatus === 'needs_review') {
        break;
      }

      // Rate limit (429 / 403 rateLimitExceeded / userRateLimitExceeded): wait 30s, 60s, 120s (max 3 tries)
      if (res.errorCategory === 'rate_limit' && attempt < 2) {
        const waitMs = backoffDelaysMs[attempt] || 120_000;
        params.onItemStatusChange?.({
          id: item.id,
          status: 'rate_limited',
          error: `Rate limit hit (${res.error}). Retrying in ${Math.round(waitMs / 1000)}s (try ${attempt + 1}/3)...`,
        });
        await new Promise(resolve => setTimeout(resolve, waitMs));
        params.onItemStatusChange?.({
          id: item.id,
          status: 'sending',
        });
        continue;
      }

      break;
    }

    if (!res) continue;
    results[item.id] = res;

    if (res.success && res.messageId) {
      sentCount++;
      // Mark "sent" right after success
      params.onItemStatusChange?.({
        id: item.id,
        status: 'sent',
        messageId: res.messageId,
        attachedCvFilename: res.attachedCvFilename,
        isUploadedCv: res.isUploadedCv,
      });
    } else {
      const status: EmailTrackingStatus = res.trackingStatus || 'failed';
      if (status === 'rate_limited' || status === 'blocked_rate_limited') rateLimitedCount++;
      else if (status === 'needs_action' || status === 'needs_review') needsActionCount++;
      else failedCount++;

      params.onItemStatusChange?.({
        id: item.id,
        status,
        error: res.error,
        attachedCvFilename: res.attachedCvFilename,
        isUploadedCv: res.isUploadedCv,
      });

      if (res.errorCategory === 'auth') {
        break;
      }
    }

    // Random 45–120 second gap between emails (ported from mailer.py)
    if (i < batchSlice.length - 1) {
      const randomGapMs = Math.floor(45_000 + Math.random() * (120_000 - 45_000 + 1));
      await new Promise(resolve => setTimeout(resolve, randomGapMs));
    }
  }

  return {
    sentCount,
    failedCount,
    rateLimitedCount,
    needsActionCount,
    results,
  };
}

export const GmailService = {
  getConnectionStatus(): { connected: boolean; email: string | null; name: string | null } {
    const token = getCachedGoogleToken();
    const expired = isGoogleTokenExpired();
    const currentUser = auth.currentUser;
    const email = currentUser?.email || getCachedUserEmail() || null;
    const name = currentUser?.displayName || getCachedUserName() || null;
    return {
      connected: Boolean(token && !expired),
      email,
      name,
    };
  },

  async connectGmailAccount(): Promise<{ connected: boolean; email: string | null; error?: string }> {
    try {
      const res = await signInWithGoogle();
      if (res && res.accessToken) {
        return {
          connected: true,
          email: res.user?.email || getCachedUserEmail() || null,
        };
      }
      return {
        connected: false,
        email: null,
        error: 'Google authorization popup was closed or did not return an access token.',
      };
    } catch (err: any) {
      return {
        connected: false,
        email: null,
        error: err?.message || 'Failed to connect Gmail account.',
      };
    }
  },

  disconnectGmailAccount(): void {
    setCachedGoogleToken(null);
  },

  async sendJobApplication(params: {
    to: string;
    subject: string;
    body: string;
    selectedCvId?: string;
    pdfBase64?: string;
    pdfFilename?: string;
    attachCoverLetterPdf?: boolean;
    coverLetterPdfBase64?: string;
    coverLetterPdfFilename?: string;
    company?: string;
    position?: string;
    location?: string;
    jobId?: string;
    cvTitle?: string;
    allowResend?: boolean;
    isTestDelivery?: boolean;
  }): Promise<SendJobApplicationResult> {
    return sendJobApplicationViaGmail({
      recipient: params.to,
      subject: params.subject,
      bodyText: params.body,
      selectedCvId: params.selectedCvId,
      pdfBase64: params.pdfBase64,
      pdfFilename: params.pdfFilename,
      attachCoverLetterPdf: params.attachCoverLetterPdf,
      coverLetterPdfBase64: params.coverLetterPdfBase64,
      coverLetterPdfFilename: params.coverLetterPdfFilename,
      company: params.company,
      position: params.position,
      location: params.location,
      jobId: params.jobId,
      cvTitle: params.cvTitle,
      allowResend: params.allowResend,
      isTestDelivery: params.isTestDelivery,
    });
  },

  async sendTestDeliveryEmail(params: {
    testRecipientEmail: string;
    subject: string;
    body: string;
    selectedCvId?: string;
    company?: string;
    position?: string;
    location?: string;
    attachCoverLetterPdf?: boolean;
  }): Promise<SendJobApplicationResult> {
    return sendJobApplicationViaGmail({
      recipient: params.testRecipientEmail.trim(),
      subject: `[TEST DELIVERY] ${params.subject}`,
      bodyText: params.body,
      selectedCvId: params.selectedCvId,
      attachCoverLetterPdf: params.attachCoverLetterPdf !== false,
      company: params.company || 'Test Employer',
      position: params.position || 'Test Position',
      location: params.location || 'Europe',
      isTestDelivery: true,
      allowResend: true,
    });
  },
};

// ==========================================
// Check Employer Replies & Delivery Bounces in Gmail
// ==========================================

const BOUNCE_DETECTION_REGEX =
  /550|5\.1\.1|5\.4\.1|5\.4\.300|5\.4\.317|4\.4\.317|4\.4\.0|4\.4\.7|message expired, cannot connect to remote server|socket error: connectionreset|delivery has failed to these recipients or groups|your message wasn't delivered|connection to the remote server couldn't be made|delivery status notification|address not found|user unknown|mailbox unavailable|access denied|message blocked|undeliverable/i;

export async function checkApplicationReplyInGmail(
  record: GmailSendingRecord,
  accessToken?: string
): Promise<{
  hasReply: boolean;
  isBounce?: boolean;
  snippet?: string;
  date?: string;
  isRejection?: boolean;
  rejectionSnippet?: string;
}> {
  const token = accessToken || getCachedGoogleToken();
  const cleanEmail = (record?.recipient || '').trim().toLowerCase();

  // Check deterministic bounce/delivery table first even if token is offline
  if (cleanEmail && KNOWN_BOUNCED_LEGACY_EMAILS[cleanEmail]) {
    return {
      hasReply: false,
      isBounce: true,
      snippet: KNOWN_BOUNCED_LEGACY_EMAILS[cleanEmail],
    };
  }

  if (!token) return { hasReply: false };

  try {
    // 1. Check if a bounce notification exists from mailer-daemon OR postmaster (Exchange Online NDR) for this recipient
    if (cleanEmail) {
      const bounceQuery = encodeURIComponent(
        `(from:mailer-daemon OR from:postmaster OR "Delivery has failed to these recipients or groups" OR "Your message wasn't delivered") "${cleanEmail}"`
      );
      const bounceRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${bounceQuery}&maxResults=2`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (bounceRes.ok) {
        const bounceData = await bounceRes.json();
        if (Array.isArray(bounceData.messages) && bounceData.messages.length > 0) {
          const bMsgId = bounceData.messages[0].id;
          const bDetailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${bMsgId}?format=metadata`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (bDetailRes.ok) {
            const bMsg = await bDetailRes.json();
            return {
              hasReply: false,
              isBounce: true,
              snippet:
                bMsg.snippet ||
                `Delivery has failed to these recipients or groups (${cleanEmail}). Remote mail server rejected or could not complete delivery.`,
              date: bMsg.internalDate ? new Date(parseInt(bMsg.internalDate)).toLocaleString('en-GB') : undefined,
            };
          }
        }
      }
    }

    // 2. Check threadId if available
    if (record.threadId) {
      const threadRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${record.threadId}?format=metadata`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (threadRes.ok) {
        const threadData = await threadRes.json();
        if (Array.isArray(threadData.messages) && threadData.messages.length > 1) {
          const incoming = threadData.messages[threadData.messages.length - 1];
          const incomingSnippet = incoming.snippet || '';
          const isBounce = BOUNCE_DETECTION_REGEX.test(incomingSnippet);
          if (isBounce) {
            return {
              hasReply: false,
              isBounce: true,
              snippet: incomingSnippet,
              date: incoming.internalDate ? new Date(parseInt(incoming.internalDate)).toLocaleString('en-GB') : undefined,
            };
          }

          // Distinguish Rejection vs Positive/Information/Auto-reply
          const rejCheck = detectExplicitRejection(incomingSnippet);
          if (rejCheck.isRejection && record.company) {
            recordEmployerRejection({
              originalJobId: record.id,
              company: record.company,
              position: record.position || record.subject,
              recipientEmail: cleanEmail,
              appliedDate: record.timestamp,
              rejectionSnippet: incomingSnippet,
              gmailThreadId: record.threadId,
              gmailMessageId: incoming.id,
            });
          }

          return {
            hasReply: true,
            isRejection: rejCheck.isRejection,
            snippet: incomingSnippet || 'Employer replied to your application in Gmail.',
            date: incoming.internalDate ? new Date(parseInt(incoming.internalDate)).toLocaleString('en-GB') : undefined,
          };
        }
      }
    }

    // 3. Check incoming messages from this recipient
    if (cleanEmail) {
      const queryStr = encodeURIComponent(`from:${cleanEmail}`);
      const searchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${queryStr}&maxResults=2`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (Array.isArray(searchData.messages) && searchData.messages.length > 0) {
          const firstMsgId = searchData.messages[0].id;
          const msgDetailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${firstMsgId}?format=metadata`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (msgDetailRes.ok) {
            const msgDetail = await msgDetailRes.json();
            const replySnippet = msgDetail.snippet || '';
            if (BOUNCE_DETECTION_REGEX.test(replySnippet)) {
              return {
                hasReply: false,
                isBounce: true,
                snippet: replySnippet,
                date: msgDetail.internalDate ? new Date(parseInt(msgDetail.internalDate)).toLocaleString('en-GB') : undefined,
              };
            }

            const rejCheck = detectExplicitRejection(replySnippet);

            if (rejCheck.isRejection && record.company) {
              recordEmployerRejection({
                originalJobId: record.id,
                company: record.company,
                position: record.position || record.subject,
                recipientEmail: cleanEmail,
                appliedDate: record.timestamp,
                rejectionSnippet: replySnippet,
                gmailMessageId: firstMsgId,
              });
            }

            return {
              hasReply: true,
              isRejection: rejCheck.isRejection,
              snippet: replySnippet || 'Reply received from employer.',
              date: msgDetail.internalDate ? new Date(parseInt(msgDetail.internalDate)).toLocaleString('en-GB') : undefined,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error checking Gmail for replies/bounces:', err);
  }

  return { hasReply: false };
}

/**
 * Synchronizes all applications in Sending History with Gmail to detect asynchronous
 * mailer-daemon / postmaster bounces and confirmed employer replies.
 */
export async function syncAllGmailDeliveryStatuses(accessToken?: string): Promise<{
  updatedRecords: GmailSendingRecord[];
  bouncedCount: number;
  deliveredCount: number;
}> {
  const history = loadLocalSendingHistory();
  let changed = false;
  let bouncedCount = 0;
  let deliveredCount = 0;

  const updatedRecords: GmailSendingRecord[] = [];
  for (const rec of history) {
    if (
      rec.status === 'accepted_by_gmail' ||
      rec.status === 'sent' ||
      rec.status === 'delivery_unconfirmed' ||
      rec.status === 'delivered' ||
      rec.status === 'bounced'
    ) {
      const check = await checkApplicationReplyInGmail(rec, accessToken);
      if (check.isBounce) {
        bouncedCount++;
        if (rec.status !== 'bounced' || rec.deliveryStatus !== 'bounced') {
          changed = true;
          const updatedRec: GmailSendingRecord = {
            ...rec,
            status: 'bounced',
            deliveryStatus: 'bounced',
            replyStatus: 'bounced',
            errorCategory: 'bounce',
            errorReason: check.snippet || rec.errorReason || `Delivery bounced for ${rec.recipient}`,
            replySnippet: check.snippet || rec.replySnippet,
            replyTimestamp: check.date || rec.replyTimestamp,
          };
          updatedRecords.push(updatedRec);
          continue;
        }
      } else if (check.hasReply) {
        deliveredCount++;
        if (rec.status !== 'delivered' || rec.deliveryStatus !== 'delivered') {
          changed = true;
          const updatedRec: GmailSendingRecord = {
            ...rec,
            status: 'delivered',
            deliveryStatus: 'delivered',
            replyStatus: 'reply_received',
            replySnippet: check.snippet || rec.replySnippet,
            replyTimestamp: check.date || rec.replyTimestamp,
          };
          updatedRecords.push(updatedRec);
          continue;
        }
      } else if (
        (rec.status === 'accepted_by_gmail' || rec.status === 'sent') &&
        rec.replyStatus !== 'checked_no_reply'
      ) {
        // Never claim "Delivered" without reply evidence; mark replyStatus as checked_no_reply
        // while keeping status accepted_by_gmail and deliveryStatus delivery_unconfirmed
        changed = true;
        const updatedRec: GmailSendingRecord = {
          ...rec,
          deliveryStatus: 'delivery_unconfirmed',
          replyStatus: 'checked_no_reply',
        };
        updatedRecords.push(updatedRec);
        continue;
      }
    }
    if (rec.status === 'bounced') bouncedCount++;
    if (rec.status === 'delivered') deliveredCount++;
    updatedRecords.push(rec);
  }

  if (changed) {
    saveLocalSendingHistory(updatedRecords);
  }

  return { updatedRecords, bouncedCount, deliveredCount };
}

// ==========================================
// AI-Prepared Applications Storage
// ==========================================

function deduplicatePreparedApplicationsList(apps: PreparedJobApplication[]): {
  deduped: PreparedJobApplication[];
  changed: boolean;
} {
  const seenIds = new Set<string>();
  const seenCompanyRole = new Set<string>();
  const deduped: PreparedJobApplication[] = [];
  let changed = false;

  for (let i = 0; i < apps.length; i++) {
    const rawApp = apps[i];
    if (!rawApp || typeof rawApp !== 'object') {
      changed = true;
      continue;
    }
    let app = rawApp;
    const res = resolveVerifiedEmployerEmail(app.recipientEmail, app.company);
    if (!res.isDeliverable) {
      if (app.recipientEmail !== '' || app.contactStatus !== 'No verified hiring contact found') {
        changed = true;
      }
      app = {
        ...app,
        recipientEmail: '',
        emailVerificationStatus: 'needs_review' as const,
        emailVerificationReason:
          res.bouncePreventionNote || 'No verified hiring contact found — apply via official employer portal',
        verificationStatus: 'needs_review' as const,
        contactSourceUrl: res.sourceUrl,
        contactFoundOnPage: res.foundOnPage,
        contactType: res.contactType,
        contactVerificationDate: res.verificationDate,
        contactConfidence: res.confidence,
        contactStatus: 'No verified hiring contact found' as const,
        officialPortalUrl: res.officialPortalUrl || app.officialPortalUrl,
      };
    } else if (res.verifiedEmail) {
      if (
        res.verifiedEmail !== app.recipientEmail ||
        !app.contactSourceUrl ||
        !app.contactType ||
        !app.contactConfidence
      ) {
        changed = true;
        app = {
          ...app,
          recipientEmail: res.verifiedEmail,
          emailVerificationStatus: 'verified' as const,
          verificationStatus: 'verified' as const,
          contactSourceUrl: res.sourceUrl,
          contactFoundOnPage: res.foundOnPage,
          contactType: res.contactType,
          contactVerificationDate: res.verificationDate,
          contactConfidence: res.confidence,
          contactStatus: 'Verified Hiring Contact' as const,
          officialPortalUrl: res.officialPortalUrl || app.officialPortalUrl,
        };
      }
    }

    const baseId = String(app.id || `auto-app-${Date.now()}-${i}`).trim();
    const roleKey = `${String(app.company || '').trim().toLowerCase()}::${String(app.position || '').trim().toLowerCase()}::${String(app.market || '').trim().toLowerCase()}`;

    if (seenIds.has(baseId) || (app.company && app.position && seenCompanyRole.has(roleKey))) {
      changed = true;
      continue;
    }

    seenIds.add(baseId);
    if (app.company && app.position) {
      seenCompanyRole.add(roleKey);
    }
    deduped.push(baseId !== app.id ? { ...app, id: baseId } : app);
  }

  return { deduped, changed };
}

export function loadSavedPreparedApplications(): PreparedJobApplication[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AI_APPLICATIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const { deduped, changed } = deduplicatePreparedApplicationsList(parsed);
        if (changed) {
          localStorage.setItem(STORAGE_KEY_AI_APPLICATIONS, JSON.stringify(deduped));
        }
        return deduped;
      }
    }
  } catch (err) {
    console.warn('Failed to load prepared AI applications:', err);
  }
  return [];
}

export function saveSavedPreparedApplications(apps: PreparedJobApplication[]) {
  try {
    const { deduped } = deduplicatePreparedApplicationsList(Array.isArray(apps) ? apps : []);
    localStorage.setItem(STORAGE_KEY_AI_APPLICATIONS, JSON.stringify(deduped));
    const currentUser = auth.currentUser;
    if (currentUser) {
      const docRef = doc(db, 'users', currentUser.uid, 'cv_metadata', 'ai_prepared_applications');
      setDoc(docRef, { applications: deduped, updatedAt: new Date().toISOString() }, { merge: true }).catch(err =>
        console.warn('Cloud sync error for AI applications:', err)
      );
    }
  } catch (err) {
    console.warn('Failed to save prepared applications:', err);
  }
}
