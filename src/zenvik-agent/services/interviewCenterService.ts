import { auth, db, getCachedGoogleToken, getCachedUserEmail, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  ApprovedParticipant,
  InterviewAttemptRecord,
  InterviewAnswerRecord,
  InterviewRoleId,
  InterviewLevel,
  InterviewMode,
  QuestionBankItem,
  RubricConfig,
  GeminiHealthSummary,
  AdminAuditEvent,
  EnglishExamResultPayload,
} from '../types/interviewCenter';

const SESSION_TOKEN_STORAGE_KEY = 'ccd_interview_session_token_v1';
const PARTICIPANT_EMAIL_STORAGE_KEY = 'ccd_interview_participant_email_v1';
const DEDICATED_PORTAL_TAB_KEY = 'ccd_dedicated_interview_portal';

let inMemoryParticipantSessionToken: string | null = null;

function getStoredParticipantSessionToken(): string | null {
  if (inMemoryParticipantSessionToken) {
    return inMemoryParticipantSessionToken;
  }
  try {
    const fromSession = sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (fromSession) {
      inMemoryParticipantSessionToken = fromSession;
      return fromSession;
    }
  } catch {}
  try {
    const fromLocal = localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (fromLocal) {
      inMemoryParticipantSessionToken = fromLocal;
      return fromLocal;
    }
  } catch {}
  return null;
}

function setStoredParticipantSessionToken(token: string | null, email?: string): void {
  inMemoryParticipantSessionToken = token;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {}
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
      if (email) {
        localStorage.setItem(PARTICIPANT_EMAIL_STORAGE_KEY, email.trim().toLowerCase());
      }
    } else {
      localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {}
}

export function getRememberedParticipantEmail(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlEmail = params.get('email') || params.get('gmail');
    if (urlEmail && urlEmail.includes('@')) {
      return urlEmail.trim().toLowerCase();
    }
  } catch {}
  try {
    return localStorage.getItem(PARTICIPANT_EMAIL_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function isDedicatedInterviewPortalUrl(): boolean {
  try {
    const pathname = (window.location.pathname || '').toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const hash = (window.location.hash || '').toLowerCase();

    const matchedByUrl =
      pathname === '/interview' ||
      pathname.startsWith('/interview/') ||
      pathname === '/interview-portal' ||
      params.get('interview') === '1' ||
      params.get('mode') === 'interview' ||
      hash === '#interview' ||
      hash.startsWith('#interview?') ||
      hash.includes('interview=1');

    if (matchedByUrl) {
      try {
        sessionStorage.setItem(DEDICATED_PORTAL_TAB_KEY, '1');
      } catch {}
      return true;
    }

    return sessionStorage.getItem(DEDICATED_PORTAL_TAB_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearInMemoryParticipantSession(): void {
  setStoredParticipantSessionToken(null);
}

async function buildParticipantHeaders(isAdminPreview = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const activeToken = getStoredParticipantSessionToken();
  if (activeToken && !isAdminPreview) {
    headers['x-interview-session'] = activeToken;
    return headers;
  }

  // Only attach admin headers if explicitly launched via Admin Preview inside the unlocked workspace
  if (isAdminPreview) {
    return buildAdminHeaders();
  }

  return headers;
}

async function buildAdminHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
    } else {
      const cachedAccess = getCachedGoogleToken();
      if (cachedAccess) {
        headers['Authorization'] = `Bearer ${cachedAccess}`;
      }
    }
  } catch {
    // fallback if token fetch fails
  }

  try {
    const accessLevel = localStorage.getItem('app_access_level_auth');
    const devAuth = localStorage.getItem('app_dev_authorized_89056');
    if (accessLevel === 'full' || devAuth === 'true') {
      headers['x-admin-passcode'] = '89056';
      headers['x-admin-email'] = auth.currentUser?.email || getCachedUserEmail() || 'fazle.rabbe.doc@gmail.com';
    }
  } catch {
    // ignore
  }

  return headers;
}

export async function checkParticipantEmailAuthMode(email: string): Promise<{
  approved: boolean;
  requireAccessCode: boolean;
  displayName?: string | null;
  reason?: string;
}> {
  try {
    const res = await fetch('/api/interview/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    return await res.json();
  } catch {
    return { approved: false, requireAccessCode: false };
  }
}

export async function enterInterviewWithEmail(
  email: string,
  accessCode?: string
): Promise<{
  authenticated: boolean;
  authorized: boolean;
  isAdmin: boolean;
  requireAccessCode?: boolean;
  user?: { uid: string; email: string; name: string };
  participant?: ApprovedParticipant | null;
  error?: string;
  rolesMetadata?: any;
  rubricConfig?: RubricConfig;
}> {
  const cleanEmail = email.trim().toLowerCase();
  const res = await fetch('/api/interview/auth/email-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email: cleanEmail,
      accessCode: accessCode ? accessCode.trim() : undefined,
    }),
  });
  const data = await res.json();
  if (res.ok && data.authorized && data.sessionToken) {
    setStoredParticipantSessionToken(data.sessionToken, cleanEmail);
  } else if (!res.ok) {
    setStoredParticipantSessionToken(null);
  }
  return data;
}

export async function logoutInterviewParticipant(): Promise<void> {
  const headers = await buildParticipantHeaders(false);
  setStoredParticipantSessionToken(null);
  try {
    await fetch('/api/interview/auth/logout', {
      method: 'POST',
      headers,
      credentials: 'include',
    });
  } catch {
    // ignore network error on logout
  }
}

export async function verifyInterviewPortalAccess(isAdminPreview = false): Promise<{
  authenticated: boolean;
  authorized: boolean;
  isAdmin: boolean;
  revoked?: boolean;
  user?: { uid: string; email: string; name: string };
  participant?: ApprovedParticipant | null;
  reason?: string | null;
  error?: string;
  rolesMetadata?: any;
  rubricConfig?: RubricConfig;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch('/api/interview/auth/verify', {
    method: 'POST',
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok || !data.authorized) {
    if (!isAdminPreview) {
      setStoredParticipantSessionToken(null);
    }
  }
  return data;
}

export async function fetchParticipantPortalOverview(isAdminPreview = false): Promise<{
  participant: ApprovedParticipant;
  rolesMetadata: any;
  rubricConfig: RubricConfig;
  levelEvaluationRules?: Record<string, any>;
  supportedSpokenLanguages?: Array<{ code: string; bcp47: string; label: string; nativeLabel: string }>;
  attempts: InterviewAttemptRecord[];
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch('/api/interview/portal/overview', {
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Failed to load Interview Portal overview.');
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  return data;
}

export interface ActiveQuestionPayload {
  id: string;
  questionNumber: number;
  totalPrimaryQuestions: number;
  questionText: string;
  isFollowUp: boolean;
  isSafetyCritical: boolean;
  safetyNote?: string;
  instructions?: string;
  passingScore?: number;
  evaluationFocus?: string[];
}

export async function startNewInterviewAttempt(
  params: {
    role: InterviewRoleId;
    level: InterviewLevel;
    mode: InterviewMode;
    consentAccepted: boolean;
  },
  isAdminPreview = false
): Promise<{
  attempt: InterviewAttemptRecord;
  currentQuestion: ActiveQuestionPayload;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch('/api/interview/attempts/start', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Failed to start interview attempt.');
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  await syncAttemptToFirestoreMirror(data.attempt);
  return data;
}

export async function fetchInterviewAttemptById(
  attemptId: string,
  isAdminPreview = false
): Promise<{
  attempt: InterviewAttemptRecord;
  currentQuestion: ActiveQuestionPayload | null;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch(`/api/interview/attempts/${encodeURIComponent(attemptId)}`, {
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Failed to load interview attempt.');
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  return data;
}

export async function submitInterviewAnswer(
  params: {
    attemptId: string;
    answerText: string;
    originalTranscript?: string;
    spokenLanguage?: string;
    inputMode: InterviewMode;
    audioDurationSeconds?: number;
    elapsedSessionSeconds: number;
  },
  isAdminPreview = false
): Promise<{
  saved: boolean;
  answerRecord: InterviewAnswerRecord;
  attempt: InterviewAttemptRecord;
  nextQuestion: ActiveQuestionPayload | null;
  readyToComplete: boolean;
  providerNotice?: string | null;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch(`/api/interview/attempts/${encodeURIComponent(params.attemptId)}/answer`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Failed to evaluate answer.');
    err.errorClass = data.errorClass;
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  await syncAttemptToFirestoreMirror(data.attempt);
  return data;
}

export async function completeInterviewAttempt(
  params: {
    attemptId: string;
    elapsedSessionSeconds: number;
    forceEarlyExit?: boolean;
  },
  isAdminPreview = false
): Promise<{
  attempt: InterviewAttemptRecord;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch(`/api/interview/attempts/${encodeURIComponent(params.attemptId)}/complete`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Failed to finalize interview scorecard.');
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  await syncAttemptToFirestoreMirror(data.attempt);
  return data;
}

export async function translateSpokenTranscriptToEnglish(
  transcript: string,
  spokenLanguage = 'auto',
  isAdminPreview = false
): Promise<{
  originalTranscript: string;
  englishTranslation: string;
  detectedLanguage: string;
  detectedLanguageLabel: string;
  wasTranslated: boolean;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch('/api/interview/speech/translate', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ transcript, spokenLanguage }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Failed to translate spoken transcript.');
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  return data;
}

export async function transcribeSpokenAudioWithGemini(
  audioBase64: string,
  mimeType = 'audio/webm',
  isAdminPreview = false,
  fallbackTranscript = '',
  spokenLanguage = 'auto'
): Promise<{
  transcript: string;
  originalTranscript?: string;
  englishTranslation?: string;
  detectedLanguage?: string;
  wasTranslated?: boolean;
  warning?: string;
  model: string;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch('/api/interview/speech/transcribe', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ audioBase64, mimeType, fallbackTranscript, spokenLanguage }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Failed to transcribe spoken audio.');
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  return data;
}

export async function synthesizeQuestionAudioWithGemini(
  text: string,
  isAdminPreview = false
): Promise<{
  audioBase64: string;
  useBrowserTts?: boolean;
  mimeType: string;
  model: string;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch('/api/interview/speech/tts', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'TTS synthesis unavailable.');
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  return data;
}

export async function submitCompleteEnglishExam(
  resultPayload: EnglishExamResultPayload,
  isAdminPreview = false
): Promise<{
  ok: boolean;
  attempt: InterviewAttemptRecord;
}> {
  const headers = await buildParticipantHeaders(isAdminPreview);
  const res = await fetch('/api/interview/english-exam/submit', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ result: resultPayload }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Failed to save English Level Exam.');
    err.status = res.status;
    err.revoked = Boolean(data.revoked);
    throw err;
  }
  await syncAttemptToFirestoreMirror(data.attempt);
  return data;
}

// ========================================================
// ADMIN API CALLS
// ========================================================
export async function fetchAdminInterviewOverview(): Promise<{
  approvedParticipants: ApprovedParticipant[];
  attempts: InterviewAttemptRecord[];
  rubricConfig: RubricConfig;
  questionBankVersion: string;
  questionBankCount: number;
  questions: QuestionBankItem[];
  geminiHealth: GeminiHealthSummary;
  auditEvents: AdminAuditEvent[];
}> {
  const headers = await buildAdminHeaders();
  const res = await fetch('/api/interview/admin/overview', { headers, credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load Admin Control Panel data.');
  }
  return data;
}

export async function upsertApprovedParticipant(payload: {
  email: string;
  displayName?: string;
  status?: 'approved' | 'suspended' | 'revoked';
  allowedCategories?: string[];
  canViewResults?: boolean;
  accessCode?: string | null;
  expiresAt?: string | null;
  notes?: string;
}): Promise<{ participant: ApprovedParticipant }> {
  const headers = await buildAdminHeaders();
  const res = await fetch('/api/interview/admin/participants', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save participant.');
  }
  return data;
}

export async function updateApprovedParticipant(
  id: string,
  payload: Partial<{
    status: 'approved' | 'suspended' | 'revoked';
    allowedCategories: string[];
    canViewResults: boolean;
    accessCode: string | null;
    expiresAt: string | null;
    notes: string;
  }>
): Promise<{ participant: ApprovedParticipant }> {
  const headers = await buildAdminHeaders();
  const res = await fetch(`/api/interview/admin/participants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update participant.');
  }
  return data;
}

export async function deleteApprovedParticipant(id: string): Promise<void> {
  const headers = await buildAdminHeaders();
  const res = await fetch(`/api/interview/admin/participants/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete participant.');
  }
}

export async function updateAdminRubricConfig(payload: Partial<RubricConfig>): Promise<{ rubricConfig: RubricConfig }> {
  const headers = await buildAdminHeaders();
  const res = await fetch('/api/interview/admin/rubric', {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update rubric configuration.');
  }
  return data;
}

export async function deleteAdminAttemptRecord(attemptId: string): Promise<void> {
  const headers = await buildAdminHeaders();
  const res = await fetch(`/api/interview/admin/attempts/${encodeURIComponent(attemptId)}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete attempt record.');
  }
}

export async function triggerAdminGeminiHealthCheck(): Promise<{
  ok: boolean;
  model?: string;
  reply?: string;
  error?: string;
  errorClass?: string;
}> {
  const headers = await buildAdminHeaders();
  const res = await fetch('/api/interview/admin/gemini-health-check', {
    method: 'POST',
    headers,
    credentials: 'include',
  });
  return res.json();
}

// Mirror attempt to authenticated user's isolated Firestore subcollection for multi-device cloud durability
async function syncAttemptToFirestoreMirror(attempt: InterviewAttemptRecord): Promise<void> {
  try {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !attempt?.attemptId) return;
    const path = `users/${currentUid}/interviewAttempts/${attempt.attemptId}`;
    await setDoc(doc(db, 'users', currentUid, 'interviewAttempts', attempt.attemptId), attempt, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid || 'unknown'}/interviewAttempts`);
  }
}
