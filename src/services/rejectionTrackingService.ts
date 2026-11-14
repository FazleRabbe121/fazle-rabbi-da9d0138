export interface RejectedApplicationRecord {
  id: string;
  originalJobId?: string;
  company: string;
  employerNormalizedKey: string; // Key normalized across email variants (e.g. 'roccofortehotels')
  position: string;
  recipientEmail: string;
  appliedDate: string;
  rejectionDate: string; // ISO string
  reapplicationEligibleDate: string; // ISO string exactly 6 calendar months later
  rejectionSnippet?: string;
  gmailThreadId?: string;
  gmailMessageId?: string;
  notes?: string;
  isEligibleNow: boolean;
  daysRemaining: number;
}

const STORAGE_KEY_REJECTIONS = 'ccd_rejected_applications_vault_v1';
import { auth } from './firebase';
import { persistRejectedApplications } from './userDataPersistenceService';

export const REJECTION_KEYWORDS = [
  'we regret to inform you',
  'will not be proceeding with your application',
  'not be proceeding with your application',
  'unfortunately, you have not been selected',
  'unfortunately you have not been selected',
  'decided to pursue other candidates',
  'pursue other applicants',
  'not moving forward with your application',
  'application was not successful',
  'filled the position',
  'have filled the role',
  'decided not to proceed',
  'unable to offer you an interview',
  'not selected for an interview',
  'chosen not to advance',
];

export const NON_REJECTION_KEYWORDS = [
  'thank you for applying',
  'received your application',
  'we have received',
  'reviewing your resume',
  'invite you to an interview',
  'schedule a call',
  'pleased to invite',
  'auto-reply',
  'automatic reply',
  'out of office',
  'confirming receipt',
];

/**
 * Normalizes company / employer name to match across different email addresses
 */
export function normalizeEmployerKey(company: string, email?: string): string {
  const cleanComp = (company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanComp.length >= 3) return cleanComp;
  if (email && email.includes('@')) {
    const domain = email.split('@')[1].split('.')[0].toLowerCase();
    return domain;
  }
  return cleanComp || 'unknown_employer';
}

/**
 * Calculates 6 calendar months from a given date
 */
export function addSixCalendarMonths(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 6);
  return result;
}

/**
 * Classifies an incoming email snippet as unambiguous rejection vs auto-reply
 */
export function detectExplicitRejection(text: string): { isRejection: boolean; matchedKeyword?: string } {
  if (!text) return { isRejection: false };
  const lower = text.toLowerCase();

  // Check if it's merely an auto-acknowledgement
  for (const ack of NON_REJECTION_KEYWORDS) {
    if (lower.includes(ack) && !lower.includes('regret') && !lower.includes('not been selected')) {
      return { isRejection: false };
    }
  }

  for (const kw of REJECTION_KEYWORDS) {
    if (lower.includes(kw)) {
      return { isRejection: true, matchedKeyword: kw };
    }
  }

  return { isRejection: false };
}

export function loadRejectedApplications(): RejectedApplicationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REJECTIONS);
    if (raw) {
      const parsed: RejectedApplicationRecord[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        return parsed.map(record => {
          const eligibleTimestamp = new Date(record.reapplicationEligibleDate).getTime();
          const isEligibleNow = now >= eligibleTimestamp;
          const diffMs = Math.max(0, eligibleTimestamp - now);
          const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          return {
            ...record,
            isEligibleNow,
            daysRemaining,
          };
        });
      }
    }
  } catch (err) {
    console.warn('Failed to load rejected applications:', err);
  }
  return [];
}

export function saveRejectedApplications(records: RejectedApplicationRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_REJECTIONS, JSON.stringify(records));
    localStorage.setItem('cv_rejected_applications_v1', JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('rejections_updated', { detail: records }));
  } catch (err) {
    console.warn('Failed to save rejected applications:', err);
  }

  if (auth.currentUser?.uid) {
    persistRejectedApplications(auth.currentUser.uid, records).catch(err =>
      console.warn('Could not persist rejected applications to Firestore:', err)
    );
  }
}

/**
 * Record a verified employer rejection and set reapplication date to 6 calendar months later
 */
export function recordEmployerRejection(params: {
  originalJobId?: string;
  company: string;
  position: string;
  recipientEmail: string;
  appliedDate?: string;
  rejectionSnippet?: string;
  gmailThreadId?: string;
  gmailMessageId?: string;
  rejectionDate?: Date;
}): RejectedApplicationRecord {
  const current = loadRejectedApplications();
  const rejDate = params.rejectionDate || new Date();
  const eligibleDate = addSixCalendarMonths(rejDate);
  const empKey = normalizeEmployerKey(params.company, params.recipientEmail);

  const newRecord: RejectedApplicationRecord = {
    id: `rej-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    originalJobId: params.originalJobId,
    company: params.company.trim(),
    employerNormalizedKey: empKey,
    position: params.position.trim(),
    recipientEmail: params.recipientEmail.trim().toLowerCase(),
    appliedDate: params.appliedDate || new Date().toISOString(),
    rejectionDate: rejDate.toISOString(),
    reapplicationEligibleDate: eligibleDate.toISOString(),
    rejectionSnippet: params.rejectionSnippet,
    gmailThreadId: params.gmailThreadId,
    gmailMessageId: params.gmailMessageId,
    isEligibleNow: false,
    daysRemaining: Math.ceil((eligibleDate.getTime() - rejDate.getTime()) / (1000 * 60 * 60 * 24)),
  };

  // Replace or add
  const updated = [newRecord, ...current.filter(r => r.employerNormalizedKey !== empKey)];
  saveRejectedApplications(updated);
  return newRecord;
}

/**
 * Checks whether an employer is currently locked out by the 6-month rule
 */
export function isEmployerLockedBySixMonthRule(company: string, email?: string): {
  isLocked: boolean;
  eligibleDate?: string;
  daysRemaining?: number;
  record?: RejectedApplicationRecord;
} {
  const records = loadRejectedApplications();
  const targetKey = normalizeEmployerKey(company, email);
  const now = Date.now();

  const found = records.find(r => r.employerNormalizedKey === targetKey);
  if (!found) return { isLocked: false };

  const eligibleTime = new Date(found.reapplicationEligibleDate).getTime();
  if (now < eligibleTime) {
    const daysRemaining = Math.max(1, Math.ceil((eligibleTime - now) / (1000 * 60 * 60 * 24)));
    return {
      isLocked: true,
      eligibleDate: found.reapplicationEligibleDate,
      daysRemaining,
      record: found,
    };
  }

  return { isLocked: false, eligibleDate: found.reapplicationEligibleDate, daysRemaining: 0, record: found };
}

export function removeEmployerRejection(recordId: string): RejectedApplicationRecord[] {
  const current = loadRejectedApplications();
  const updated = current.filter(r => r.id !== recordId);
  saveRejectedApplications(updated);
  return updated;
}

export const removeRejectedApplication = removeEmployerRejection;

