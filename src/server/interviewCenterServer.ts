import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  ApprovedParticipant,
  InterviewAttemptRecord,
  InterviewAnswerRecord,
  InterviewRoleId,
  InterviewLevel,
  InterviewMode,
  QuestionBankItem,
  RubricConfig,
  GeminiProviderEvent,
  GeminiHealthSummary,
  AdminAuditEvent,
  PassFailOutcome,
  CefrLevel,
  EnglishExamResultPayload,
} from '../types/interviewCenter.js';
import {
  SEEDED_QUESTION_BANK,
  DEFAULT_RUBRIC_CONFIG,
  QUESTION_BANK_VERSION,
  ROLE_METADATA,
} from '../data/interviewQuestionBank.js';
import {
  SUPPORTED_SPOKEN_LANGUAGES,
  LEVEL_EVALUATION_RULES,
  getLevelEvaluationCriteria,
  enrichQuestionWithBackendGuidelines,
  evaluateInterviewAnswerAutomated,
  translateAndNormalizeSpokenAnswer,
} from './interviewAutomatedEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE_PATH = path.join(DATA_DIR, 'interview_center_db.json');

export const AUTHORIZED_ADMIN_EMAIL = 'fazle.rabbe.doc@gmail.com';
export const LEGACY_ADMIN_EMAIL = 'fazlerabbe905@gmail.com';
export const AUTHORIZED_ADMIN_EMAILS = [AUTHORIZED_ADMIN_EMAIL, LEGACY_ADMIN_EMAIL];

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return AUTHORIZED_ADMIN_EMAILS.includes(clean);
}

export interface ActiveParticipantSession {
  sessionId: string;
  tokenHash: string;
  participantId: string;
  email: string;
  sessionVersion: number;
  createdAt: string;
  expiresAt: string;
  lastVerifiedAt: string;
}

interface InterviewCenterDatabase {
  approvedParticipants: ApprovedParticipant[];
  activeSessions: ActiveParticipantSession[];
  attempts: InterviewAttemptRecord[];
  customQuestions: QuestionBankItem[];
  rubricConfig: RubricConfig;
  roleRubricOverrides: Partial<Record<InterviewRoleId, RubricConfig>>;
  providerEvents: GeminiProviderEvent[];
  auditEvents: AdminAuditEvent[];
  stats: {
    totalRequests: number;
    successfulRequests: number;
    rateLimitEvents: number;
    configErrorEvents: number;
    retryRecoveries: number;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    lastErrorClass: string | null;
  };
}

function getInitialDatabase(): InterviewCenterDatabase {
  const now = new Date().toISOString();
  return {
    approvedParticipants: [
      {
        id: 'participant-primary-admin-owner',
        email: AUTHORIZED_ADMIN_EMAIL,
        displayName: 'Fazle Rabbi (Primary Admin & Owner)',
        status: 'approved',
        allowedCategories: ['all'],
        canViewResults: true,
        requireAccessCode: false,
        accessCodeHash: null,
        accessCodeDisplay: null,
        sessionVersion: 1,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: AUTHORIZED_ADMIN_EMAIL,
        notes: 'Primary Administrator & Owner account',
      },
    ],
    activeSessions: [],
    attempts: [],
    customQuestions: [],
    rubricConfig: { ...DEFAULT_RUBRIC_CONFIG },
    roleRubricOverrides: {},
    providerEvents: [],
    auditEvents: [],
    stats: {
      totalRequests: 0,
      successfulRequests: 0,
      rateLimitEvents: 0,
      configErrorEvents: 0,
      retryRecoveries: 0,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastErrorClass: null,
    },
  };
}

class InterviewCenterStorage {
  private data: InterviewCenterDatabase;

  constructor() {
    this.data = this.load();
  }

  private load(): InterviewCenterDatabase {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        const init = getInitialDatabase();
        const merged: InterviewCenterDatabase = {
          ...init,
          ...parsed,
          activeSessions: Array.isArray(parsed.activeSessions) ? parsed.activeSessions : [],
          rubricConfig: { ...init.rubricConfig, ...(parsed.rubricConfig || {}) },
          stats: { ...init.stats, ...(parsed.stats || {}) },
        };
        // Ensure primary admin email is always present and has full non-expiring admin privileges
        const existingPrimaryAdmin = merged.approvedParticipants.find(
          p => p.email.toLowerCase() === AUTHORIZED_ADMIN_EMAIL
        );
        if (!existingPrimaryAdmin) {
          merged.approvedParticipants.unshift(init.approvedParticipants[0]);
        } else {
          existingPrimaryAdmin.status = 'approved';
          existingPrimaryAdmin.allowedCategories = ['all'];
          existingPrimaryAdmin.canViewResults = true;
          existingPrimaryAdmin.expiresAt = null;
          if (!existingPrimaryAdmin.notes) {
            existingPrimaryAdmin.notes = 'Primary Administrator & Owner account';
          }
        }
        return merged;
      }
    } catch (err) {
      console.error('[InterviewCenterStorage] Failed to load DB, initializing fresh state:', err);
    }
    const fresh = getInitialDatabase();
    this.save(fresh);
    return fresh;
  }

  public save(nextData?: InterviewCenterDatabase): void {
    if (nextData) {
      this.data = nextData;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[InterviewCenterStorage] Failed to persist DB:', err);
    }
  }

  public getState(): InterviewCenterDatabase {
    return this.data;
  }

  public getAllQuestions(): QuestionBankItem[] {
    return [...SEEDED_QUESTION_BANK, ...(this.data.customQuestions || [])].map(q =>
      enrichQuestionWithBackendGuidelines(q)
    );
  }

  public recordProviderEvent(event: Omit<GeminiProviderEvent, 'id' | 'timestamp'>): GeminiProviderEvent {
    const fullEvent: GeminiProviderEvent = {
      ...event,
      id: `gem-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.providerEvents.unshift(fullEvent);
    if (this.data.providerEvents.length > 200) {
      this.data.providerEvents = this.data.providerEvents.slice(0, 200);
    }

    this.data.stats.totalRequests += 1;
    if (event.eventType === 'success' || event.eventType === 'retry_recovered') {
      this.data.stats.successfulRequests += 1;
      this.data.stats.lastSuccessAt = fullEvent.timestamp;
      if (event.eventType === 'retry_recovered') {
        this.data.stats.retryRecoveries += 1;
      }
    } else {
      this.data.stats.lastErrorAt = fullEvent.timestamp;
      this.data.stats.lastErrorMessage = event.message;
      this.data.stats.lastErrorClass = event.eventType;
      if (event.eventType === 'rate_limit_429') {
        this.data.stats.rateLimitEvents += 1;
      }
      if (event.eventType === 'auth_401' || event.eventType === 'permission_403') {
        this.data.stats.configErrorEvents += 1;
      }
    }

    this.save();
    return fullEvent;
  }

  public recordAuditEvent(actorEmail: string, action: string, target: string, details: string): void {
    const evt: AdminAuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actorEmail: actorEmail.toLowerCase(),
      action,
      target,
      details,
      timestamp: new Date().toISOString(),
    };
    this.data.auditEvents.unshift(evt);
    if (this.data.auditEvents.length > 300) {
      this.data.auditEvents = this.data.auditEvents.slice(0, 300);
    }
    this.save();
  }
}

export const interviewStore = new InterviewCenterStorage();

// ========================================================
// GEMINI-ONLY AI CLIENT & SAFE RETRY / QUOTA MONITOR
// ========================================================
const PRIMARY_INTERVIEW_MODEL = 'gemini-4-hydrogen';
const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    const err: any = new Error('GEMINI_API_KEY is not configured in server environment.');
    err.status = 401;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function classifyGeminiError(error: any): {
  eventType: GeminiProviderEvent['eventType'];
  statusCode: number;
  userSafeMessage: string;
  isRetryable: boolean;
} {
  const msg = String(error?.message || error || '');
  const status = Number(error?.status || error?.statusCode || 0);

  if (
    status === 401 ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('GEMINI_API_KEY is not configured') ||
    msg.includes('UNAUTHENTICATED')
  ) {
    return {
      eventType: 'auth_401',
      statusCode: 401,
      userSafeMessage: 'Configuration Error (401): Invalid or missing Gemini API key on server.',
      isRetryable: false,
    };
  }

  if (status === 403 || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
    return {
      eventType: 'permission_403',
      statusCode: 403,
      userSafeMessage: 'Permission Error (403): The configured Gemini API key lacks permission for this model.',
      isRetryable: false,
    };
  }

  if (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('rate limit')
  ) {
    return {
      eventType: 'rate_limit_429',
      statusCode: 429,
      userSafeMessage: 'Gemini API rate limit or quota reached (429). Progress is saved safely.',
      isRetryable: true,
    };
  }

  if (status === 408 || msg.toLowerCase().includes('timeout') || msg.includes('DEADLINE_EXCEEDED')) {
    return {
      eventType: 'timeout',
      statusCode: 408,
      userSafeMessage: 'Gemini API request timed out. Progress is saved safely.',
      isRetryable: true,
    };
  }

  return {
    eventType: 'server_5xx',
    statusCode: status >= 400 ? status : 500,
    userSafeMessage: `Gemini API temporary service error: ${msg.slice(0, 140)}`,
    isRetryable: true,
  };
}

async function callGeminiWithRetry<T>(
  operation: GeminiProviderEvent['operation'],
  model: string,
  fn: (ai: GoogleGenAI) => Promise<T>,
  maxRetries = 1,
  timeoutMs = 8000
): Promise<{ result: T; retryCount: number }> {
  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    try {
      const ai = getGeminiClient();
      const result = await Promise.race<T>([
        fn(ai),
        new Promise<T>((_, reject) =>
          setTimeout(() => {
            const tErr: any = new Error(`Gemini API request timed out after ${timeoutMs}ms`);
            tErr.status = 408;
            reject(tErr);
          }, timeoutMs)
        ),
      ]);
      const latencyMs = Date.now() - startTime;
      interviewStore.recordProviderEvent({
        provider: 'gemini',
        model,
        operation,
        eventType: attempt > 0 ? 'retry_recovered' : 'success',
        statusCode: 200,
        message: attempt > 0 ? `Succeeded after ${attempt} retry(s)` : 'OK',
        latencyMs,
        retryAttempt: attempt,
      });
      return { result, retryCount: attempt };
    } catch (error: any) {
      const classified = classifyGeminiError(error);
      const latencyMs = Date.now() - startTime;

      // Do not retry timeouts if already took >= timeoutMs so HTTP response stays snappy
      if (!classified.isRetryable || classified.eventType === 'timeout' || attempt >= maxRetries) {
        interviewStore.recordProviderEvent({
          provider: 'gemini',
          model,
          operation,
          eventType: classified.eventType,
          statusCode: classified.statusCode,
          message: classified.userSafeMessage,
          latencyMs,
          retryAttempt: attempt,
        });
        const enrichedErr: any = new Error(classified.userSafeMessage);
        enrichedErr.errorClass = classified.eventType;
        enrichedErr.statusCode = classified.statusCode;
        throw enrichedErr;
      }

      attempt += 1;
      const delayMs = 400 * attempt;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// ========================================================
// SERVER-SIDE AUTHENTICATION & PARTICIPANT / ADMIN GATE
// ========================================================
export interface VerifiedCaller {
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

const SESSION_COOKIE_NAME = 'interview_portal_session';
const SERVER_HASH_SALT = process.env.INTERVIEW_SESSION_SECRET || 'ccd-interview-center-salt-v1';

function hashSecretValue(raw: string): string {
  return crypto
    .createHmac('sha256', SERVER_HASH_SALT)
    .update(String(raw))
    .digest('hex');
}

function verifySecretConstantTime(rawInput: string, expectedHash: string): boolean {
  try {
    const computed = Buffer.from(hashSecretValue(rawInput), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    if (computed.length !== expected.length) return false;
    return crypto.timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

export function purgeParticipantSessions(email: string): number {
  const cleanEmail = email.trim().toLowerCase();
  const state = interviewStore.getState();
  if (!Array.isArray(state.activeSessions)) {
    state.activeSessions = [];
    return 0;
  }
  const before = state.activeSessions.length;
  state.activeSessions = state.activeSessions.filter(s => s.email.toLowerCase() !== cleanEmail);
  const removed = before - state.activeSessions.length;
  if (removed > 0) {
    interviewStore.save();
  }
  return removed;
}

function sanitizeParticipantForClient(p: ApprovedParticipant, isAdminView = false): ApprovedParticipant {
  const copy: ApprovedParticipant = {
    ...p,
    accessCodeHash: undefined,
    accessCodeDisplay: isAdminView ? p.accessCodeDisplay || null : undefined,
  };
  return copy;
}

function decodeFirebaseIdTokenPayload(idToken: string): {
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
  exp?: number;
} | null {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    const email = String(payload.email || '').trim().toLowerCase();
    const uid = String(payload.user_id || payload.sub || '').trim();
    if (!email || !uid) return null;
    if (payload.exp && Date.now() / 1000 > payload.exp + 300) {
      return null; // Expired token
    }
    return {
      uid,
      email,
      name: String(payload.name || email.split('@')[0]),
      emailVerified: Boolean(payload.email_verified),
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

async function resolveCallerFromRequest(req: Request): Promise<VerifiedCaller | null> {
  // 1. Check Participant Session Token (HttpOnly Cookie or x-interview-session header)
  // Note: If the request has a participant session token, validate it strictly against live allowlist & sessionVersion first
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawSessionToken =
    String(req.headers['x-interview-session'] || '').trim() ||
    String(cookies[SESSION_COOKIE_NAME] || '').trim();

  if (rawSessionToken) {
    const tokenHash = hashSecretValue(rawSessionToken);
    const state = interviewStore.getState();
    if (!Array.isArray(state.activeSessions)) {
      state.activeSessions = [];
    }
    const sessionIdx = state.activeSessions.findIndex(s => s.tokenHash === tokenHash);
    if (sessionIdx === -1) {
      (req as any).revokedReason = 'Your interview session is no longer active or has been revoked. Please re-enter your approved email.';
      return null;
    }

    const session = state.activeSessions[sessionIdx];
    const isExpiredSession = Date.now() > new Date(session.expiresAt).getTime();
    const access = evaluateParticipantAccess(session.email);
    const currentVersion = access.participant?.sessionVersion || 1;
    const versionMismatch = currentVersion !== (session.sessionVersion || 1);

    if (isExpiredSession || !access.allowed || !access.participant || versionMismatch) {
      // Immediately purge invalidated/revoked session
      state.activeSessions.splice(sessionIdx, 1);
      interviewStore.save();
      (req as any).revokedReason =
        access.reason ||
        (isExpiredSession
          ? 'Your interview session has expired. Please re-enter your approved email.'
          : 'Your interview access has been revoked by the administrator.');
      return null;
    }

    session.lastVerifiedAt = new Date().toISOString();
    return {
      uid: access.participant.uid || `part-${access.participant.id}`,
      email: access.participant.email,
      name: access.participant.displayName || access.participant.email.split('@')[0],
      emailVerified: true,
      // Participant session tokens NEVER grant Admin Control Panel access
      isAdmin: false,
    };
  }

  // 2. Check if Authorized Master Admin unlocked via Master Passcode + Admin Header on same origin
  const adminPasscodeHeader = String(req.headers['x-admin-passcode'] || '').trim();
  const adminEmailHeader = String(req.headers['x-admin-email'] || '').trim().toLowerCase();
  if (adminPasscodeHeader === '89056' && isAuthorizedAdminEmail(adminEmailHeader)) {
    return {
      uid: 'admin-master-89056',
      email: adminEmailHeader || AUTHORIZED_ADMIN_EMAIL,
      name: 'Fazle Rabbi (Admin)',
      emailVerified: true,
      isAdmin: true,
    };
  }

  // 3. Check Firebase JWT ID Token / Google OAuth2 token (for Admin or signed-in owner)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (token) {
    const decoded = decodeFirebaseIdTokenPayload(token);
    if (decoded && decoded.email && decoded.emailVerified) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        emailVerified: decoded.emailVerified,
        isAdmin: isAuthorizedAdminEmail(decoded.email),
      };
    }

    try {
      const resp = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
      if (resp.ok) {
        const info: any = await resp.json();
        const email = String(info.email || '').trim().toLowerCase();
        const emailVerified = info.email_verified === 'true' || info.email_verified === true;
        if (email && emailVerified) {
          return {
            uid: String(info.sub || email),
            email,
            name: email.split('@')[0],
            emailVerified: true,
            isAdmin: isAuthorizedAdminEmail(email),
          };
        }
      }
    } catch {
      // ignore network error on tokeninfo
    }
  }

  return null;
}

export function evaluateParticipantAccess(email: string): {
  allowed: boolean;
  reason?: string;
  participant?: ApprovedParticipant;
} {
  const cleanEmail = email.trim().toLowerCase();
  const state = interviewStore.getState();
  const participant = state.approvedParticipants.find(p => p.email.toLowerCase() === cleanEmail);

  if (!participant) {
    return {
      allowed: false,
      reason: `The Google account (${cleanEmail}) is not on the approved Interview Portal allowlist. Please contact the administrator to request access.`,
    };
  }

  if (participant.status === 'suspended') {
    return {
      allowed: false,
      reason: `Interview access for ${cleanEmail} is currently suspended by the administrator.`,
      participant,
    };
  }

  if (participant.status === 'revoked') {
    return {
      allowed: false,
      reason: `Interview access for ${cleanEmail} has been revoked.`,
      participant,
    };
  }

  if (participant.expiresAt) {
    const expiryTime = new Date(participant.expiresAt).getTime();
    if (!isNaN(expiryTime) && Date.now() > expiryTime) {
      return {
        allowed: false,
        reason: `Interview access for ${cleanEmail} expired on ${new Date(participant.expiresAt).toLocaleDateString()}.`,
        participant,
      };
    }
  }

  return {
    allowed: true,
    participant,
  };
}

// ========================================================
// EVALUATION LOGIC (GEMINI 3.8 FLASH + DETERMINISTIC SAFETY GUARD)
// ========================================================
function detectExplicitSafetyHazard(question: QuestionBankItem, answerText: string): {
  flagged: boolean;
  reason?: string;
} {
  if (!question.isSafetyCritical) return { flagged: false };
  const lower = answerText.toLowerCase();

  // Check explicit unsafe statements in electrical/plumbing/allergen contexts
  const unsafePatterns: { pattern: RegExp; reason: string }[] = [
    {
      pattern: /\b(work live|touch live|skip loto|without lockout|no lockout|without isolating|bypass breaker|bypass rcd|tape the breaker|jumper the interlock)\b/i,
      reason: 'Candidate proposed working on live equipment or bypassing Lockout/Tagout (LOTO) / protective interlocks.',
    },
    {
      pattern: /\b(plug the relief|cap the tpr|cap the relief valve|block the pressure relief)\b/i,
      reason: 'Candidate proposed capping or plugging a safety pressure/relief valve or RPZ port.',
    },
    {
      pattern: /\b(ignore the allergy|guess the ingredients|serve it anyway|just pick the nuts out|dont tell the kitchen)\b/i,
      reason: 'Candidate proposed guessing allergen content or serving a potentially allergenic dish without verification.',
    },
    {
      pattern: /\b(serve another alcohol|give him more alcohol|keep serving drunk|use a lighter to find gas)\b/i,
      reason: 'Candidate proposed an unsafe action violating alcohol service law or gas leak safety.',
    },
  ];

  for (const item of unsafePatterns) {
    if (item.pattern.test(lower)) {
      return { flagged: true, reason: item.reason };
    }
  }
  return { flagged: false };
}

async function evaluateSingleAnswerWithGemini(params: {
  role: InterviewRoleId;
  level: InterviewLevel;
  question: QuestionBankItem;
  isFollowUp: boolean;
  questionText: string;
  answerText: string;
  rubric: RubricConfig;
  simulateError?: string;
}): Promise<{
  perQuestionScore: number;
  rubricSubScores: {
    roleKnowledge: number;
    situationalJudgment: number;
    grammarVocab: number;
    clarityFluency: number;
    professionalismSafety: number;
  };
  feedback: string;
  strengths: string[];
  improvements: string[];
  grammarCorrection: { original: string; corrected: string; explanation: string } | null;
  modelAnswerExample: string;
  safetyFlagged: boolean;
  safetyReason?: string;
  needsFollowUp: boolean;
  generatedFollowUpQuestion?: string;
  providerNotice?: string;
}> {
  const { role, level, question, isFollowUp, questionText, answerText, rubric } = params;

  // Primary Self-Operating Automated Backend Evaluation Engine (Zero Gemini Dependency)
  const automatedResult = evaluateInterviewAnswerAutomated({
    role,
    level,
    question,
    isFollowUp,
    questionText,
    answerText,
    rubric,
  });

  return {
    perQuestionScore: automatedResult.perQuestionScore,
    rubricSubScores: automatedResult.rubricSubScores,
    feedback: automatedResult.feedback,
    strengths: automatedResult.strengths,
    improvements: automatedResult.improvements,
    grammarCorrection: automatedResult.grammarCorrection,
    modelAnswerExample: automatedResult.modelAnswerExample,
    safetyFlagged: automatedResult.safetyFlagged,
    safetyReason: automatedResult.safetyReason,
    needsFollowUp: automatedResult.needsFollowUp,
    generatedFollowUpQuestion: automatedResult.generatedFollowUpQuestion,
  };
}

// ========================================================
// EXPRESS ROUTER FOR /api/interview/*
// ========================================================
export const interviewCenterRouter = express.Router();

// 1. Automatic Access Detection for Approved Gmail (/api/interview/auth/check-email)
interviewCenterRouter.post('/auth/check-email', (req: Request, res: Response) => {
  try {
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!rawEmail || !rawEmail.includes('@')) {
      return res.json({
        approved: false,
        requireAccessCode: false,
      });
    }

    const access = evaluateParticipantAccess(rawEmail);
    if (!access.allowed || !access.participant) {
      return res.json({
        approved: false,
        requireAccessCode: false,
        reason: access.reason || 'This Gmail address is not approved for Interview Section access.',
      });
    }

    const requiresPin = Boolean(access.participant.requireAccessCode && access.participant.accessCodeHash);
    return res.json({
      approved: true,
      requireAccessCode: requiresPin,
      displayName: access.participant.displayName || null,
    });
  } catch {
    return res.json({
      approved: false,
      requireAccessCode: false,
    });
  }
});

// 1a. Participant Direct Email + Optional Admin PIN Gate (/api/interview/auth/email-access)
interviewCenterRouter.post('/auth/email-access', (req: Request, res: Response) => {
  try {
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    const rawCode = String(req.body?.accessCode || '').trim();

    if (!rawEmail || !rawEmail.includes('@')) {
      return res.status(400).json({
        authenticated: false,
        authorized: false,
        error: 'Please enter a valid Gmail or email address.',
      });
    }

    const access = evaluateParticipantAccess(rawEmail);
    if (!access.allowed || !access.participant) {
      purgeParticipantSessions(rawEmail);
      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/api/interview; SameSite=Lax; Max-Age=0`
      );
      return res.status(403).json({
        authenticated: false,
        authorized: false,
        error: access.reason || `Access denied: ${rawEmail} is not on the active Interview Section allowlist.`,
      });
    }

    const participant = access.participant;

    // If an admin-assigned PIN is configured on this participant, enforce constant-time verification
    if (participant.requireAccessCode && participant.accessCodeHash) {
      if (!rawCode) {
        return res.status(401).json({
          authenticated: false,
          authorized: false,
          requireAccessCode: true,
          error: 'A PIN is assigned to this Gmail address. Please enter your assigned PIN to access the Interview Section.',
        });
      }
      const codeValid = verifySecretConstantTime(rawCode, participant.accessCodeHash);
      if (!codeValid) {
        return res.status(403).json({
          authenticated: false,
          authorized: false,
          requireAccessCode: true,
          error: 'Invalid PIN. Please enter the exact PIN assigned by the administrator.',
        });
      }
    }

    // Issue revocable server-side session
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSecretValue(rawSessionToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(); // 12 hours
    const sessionVersion = participant.sessionVersion || 1;

    const state = interviewStore.getState();
    if (!Array.isArray(state.activeSessions)) {
      state.activeSessions = [];
    }

    // Keep activeSessions bounded
    if (state.activeSessions.length > 500) {
      state.activeSessions = state.activeSessions.slice(-400);
    }

    state.activeSessions.push({
      sessionId: `sess-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      tokenHash,
      participantId: participant.id,
      email: participant.email,
      sessionVersion,
      createdAt: now.toISOString(),
      expiresAt,
      lastVerifiedAt: now.toISOString(),
    });
    interviewStore.save();

    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawSessionToken)}; HttpOnly; Path=/api/interview; SameSite=Lax; Max-Age=43200`
    );

    return res.json({
      authenticated: true,
      authorized: true,
      isAdmin: false,
      sessionToken: rawSessionToken,
      user: {
        uid: participant.uid || `part-${participant.id}`,
        email: participant.email,
        name: participant.displayName || participant.email.split('@')[0],
      },
      participant: sanitizeParticipantForClient(participant, false),
      rolesMetadata: ROLE_METADATA,
      rubricConfig: state.rubricConfig,
    });
  } catch (err: any) {
    return res.status(500).json({
      authenticated: false,
      authorized: false,
      error: err?.message || 'Failed to verify interview access.',
    });
  }
});

// 1b. Logout / Clear Participant Session
interviewCenterRouter.post('/auth/logout', (req: Request, res: Response) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawSessionToken =
    String(req.headers['x-interview-session'] || '').trim() ||
    String(cookies[SESSION_COOKIE_NAME] || '').trim();

  if (rawSessionToken) {
    const tokenHash = hashSecretValue(rawSessionToken);
    const state = interviewStore.getState();
    if (Array.isArray(state.activeSessions)) {
      state.activeSessions = state.activeSessions.filter(s => s.tokenHash !== tokenHash);
      interviewStore.save();
    }
  }

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/api/interview; SameSite=Lax; Max-Age=0`
  );
  return res.json({ loggedOut: true });
});

// 1c. Verify Participant / Admin Access Status (Re-checked on every load & heartbeat)
interviewCenterRouter.post('/auth/verify', async (req: Request, res: Response) => {
  try {
    const caller = await resolveCallerFromRequest(req);
    if (!caller) {
      const revokedReason = (req as any).revokedReason || null;
      if (revokedReason) {
        res.setHeader(
          'Set-Cookie',
          `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/api/interview; SameSite=Lax; Max-Age=0`
        );
      }
      return res.status(revokedReason ? 403 : 401).json({
        authenticated: false,
        authorized: false,
        revoked: Boolean(revokedReason),
        reason: revokedReason,
        error:
          revokedReason ||
          'Enter your approved Gmail address to access the AI Interview & English Assessment Center.',
      });
    }

    const access = evaluateParticipantAccess(caller.email);
    const state = interviewStore.getState();

    if (!access.allowed || !access.participant) {
      purgeParticipantSessions(caller.email);
      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/api/interview; SameSite=Lax; Max-Age=0`
      );
      return res.status(403).json({
        authenticated: false,
        authorized: false,
        revoked: true,
        reason: access.reason || 'Your interview access is not active.',
        error: access.reason || 'Your interview access is not active.',
      });
    }

    return res.json({
      authenticated: true,
      authorized: true,
      isAdmin: caller.isAdmin,
      user: {
        uid: caller.uid,
        email: caller.email,
        name: caller.name,
      },
      participant: sanitizeParticipantForClient(access.participant, caller.isAdmin),
      reason: null,
      rolesMetadata: ROLE_METADATA,
      rubricConfig: state.rubricConfig,
    });
  } catch (err: any) {
    return res.status(500).json({
      authenticated: false,
      authorized: false,
      error: err?.message || 'Failed to verify interview access.',
    });
  }
});

// Middleware: Require Approved Participant (Re-validates allowlist & revocation on every request)
async function requireApprovedParticipant(req: Request, res: Response, next: NextFunction) {
  const caller = await resolveCallerFromRequest(req);
  if (!caller) {
    const revokedReason = (req as any).revokedReason;
    if (revokedReason) {
      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/api/interview; SameSite=Lax; Max-Age=0`
      );
      return res.status(403).json({
        revoked: true,
        error: revokedReason,
      });
    }
    return res.status(401).json({
      error: 'Interview access verification required. Please enter your approved Gmail address.',
    });
  }
  const access = evaluateParticipantAccess(caller.email);
  if (!access.allowed || !access.participant) {
    purgeParticipantSessions(caller.email);
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/api/interview; SameSite=Lax; Max-Age=0`
    );
    return res.status(403).json({
      revoked: true,
      error: access.reason || 'Your email address is no longer authorized for the Interview Portal.',
    });
  }
  (req as any).caller = caller;
  (req as any).participant = access.participant;
  next();
}

// Middleware: Require Authorized Admin
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const caller = await resolveCallerFromRequest(req);
  if (!caller) {
    return res.status(401).json({
      error: 'Admin authentication required.',
    });
  }
  if (!caller.isAdmin) {
    return res.status(403).json({
      error: 'Forbidden: Only the authorized administrator can access the Admin Control Panel.',
    });
  }
  (req as any).caller = caller;
  next();
}

// 2. Participant: Get Own Attempts & Available Tracks
interviewCenterRouter.get('/portal/overview', requireApprovedParticipant, (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const participant: ApprovedParticipant = (req as any).participant;
  const state = interviewStore.getState();

  const myAttempts = state.attempts
    .filter(a => a.participantEmail.toLowerCase() === caller.email.toLowerCase())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map(attempt => {
      if (!participant.canViewResults && attempt.status === 'completed' && !caller.isAdmin) {
        return {
          ...attempt,
          answers: attempt.answers.map(ans => ({ ...ans, modelAnswerExample: undefined })),
        };
      }
      return attempt;
    });

  return res.json({
    participant,
    rolesMetadata: ROLE_METADATA,
    rubricConfig: state.rubricConfig,
    levelEvaluationRules: LEVEL_EVALUATION_RULES,
    supportedSpokenLanguages: SUPPORTED_SPOKEN_LANGUAGES,
    attempts: myAttempts,
  });
});

// 3. Participant: Start or Resume an Interview Attempt
interviewCenterRouter.post('/attempts/start', requireApprovedParticipant, (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const participant: ApprovedParticipant = (req as any).participant;
  const { role, level, mode = 'spoken', consentAccepted } = req.body;

  if (!consentAccepted) {
    return res.status(400).json({
      error: 'You must confirm consent for audio capture, transcription, and assessment processing before starting.',
    });
  }

  const validRole = role as InterviewRoleId;
  if (!ROLE_METADATA[validRole]) {
    return res.status(400).json({ error: 'Invalid interview role or assessment category.' });
  }

  // Enforce participant allowedCategories
  const allowedCats = participant.allowedCategories || ['all'];
  const categoryType = ROLE_METADATA[validRole].category;
  const isCategoryPermitted =
    allowedCats.includes('all') ||
    allowedCats.includes(validRole) ||
    allowedCats.includes(categoryType);

  if (!isCategoryPermitted) {
    return res.status(403).json({
      error: `Your account does not have permission to launch ${ROLE_METADATA[validRole].title}.`,
    });
  }

  const levelMeta = ROLE_METADATA[validRole].levels.find(l => l.level === String(level));
  if (!levelMeta) {
    return res.status(400).json({ error: `Invalid level (${level}) for ${ROLE_METADATA[validRole].title}.` });
  }

  const state = interviewStore.getState();
  const effectiveRubric = state.roleRubricOverrides[validRole] || state.rubricConfig;
  const levelRules = getLevelEvaluationCriteria(levelMeta.level);

  let targetSeconds = levelMeta.targetSeconds;
  if (effectiveRubric.strictFiveMinuteCap) {
    targetSeconds = 300;
  } else if (categoryType === 'english') {
    targetSeconds = effectiveRubric.minDurationSecondsCefr || 300;
  } else if (String(level) === '1') {
    targetSeconds = effectiveRubric.minDurationSecondsL1 || 300;
  } else if (String(level) === '2') {
    targetSeconds = effectiveRubric.minDurationSecondsL2 || 480;
  } else if (String(level) === '3') {
    targetSeconds = effectiveRubric.minDurationSecondsL3 || 600;
  }

  // Select and randomize questions for this role & level without repetition
  const matchingQuestions = interviewStore
    .getAllQuestions()
    .filter(q => q.role === validRole && q.level === String(level));

  if (matchingQuestions.length === 0) {
    return res.status(400).json({ error: 'No questions found in bank for this role and level.' });
  }

  // Keep introductory question first if it's questionNumber 1 on Level 1/A1, shuffle the rest safely
  const sorted = [...matchingQuestions].sort((a, b) => a.questionNumber - b.questionNumber);
  const firstQ = sorted[0];
  const restShuffled = sorted.slice(1).sort(() => Math.random() - 0.5);
  const orderedQuestions = [firstQ, ...restShuffled];

  const now = new Date().toISOString();
  const attemptId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newAttempt: InterviewAttemptRecord = {
    attemptId,
    participantEmail: caller.email,
    participantUid: caller.uid,
    participantName: participant.displayName || caller.name,
    category: categoryType,
    role: validRole,
    roleTitle: ROLE_METADATA[validRole].title,
    level: levelMeta.level,
    levelLabel: levelMeta.label,
    levelInstructions: levelRules.instructions,
    levelPassingRequirements: levelRules.passingRequirementsText,
    levelPassThreshold: levelRules.passingScoreThreshold,
    mode: mode === 'written' ? 'written' : 'spoken',
    status: 'in_progress',
    consentGivenAt: now,
    startedAt: now,
    updatedAt: now,
    durationSeconds: 0,
    targetDurationSeconds: targetSeconds,
    questionBankVersion: QUESTION_BANK_VERSION,
    rubricSnapshot: {
      ...effectiveRubric,
      passThreshold: levelRules.passingScoreThreshold,
    },
    providerUsed: 'automated-backend-engine-v2',
    currentQuestionIndex: 0,
    assignedQuestionIds: orderedQuestions.map(q => q.id),
    activeFollowUpQuestion: null,
    answers: [],
  };

  state.attempts.unshift(newAttempt);
  interviewStore.save();

  const currentQuestion = orderedQuestions[0];
  return res.json({
    attempt: newAttempt,
    currentQuestion: {
      id: currentQuestion.id,
      questionNumber: 1,
      totalPrimaryQuestions: orderedQuestions.length,
      questionText: currentQuestion.questionText,
      isFollowUp: false,
      isSafetyCritical: currentQuestion.isSafetyCritical,
      safetyNote: currentQuestion.safetyNote,
      instructions: currentQuestion.instructions || levelRules.instructions,
      passingScore: currentQuestion.passingScore || levelRules.passingScoreThreshold,
      evaluationFocus: levelRules.evaluationFocus,
    },
  });
});

// 4. Participant: Get Single Attempt State (For Resume or View) — Strictly Isolated
interviewCenterRouter.get('/attempts/:attemptId', requireApprovedParticipant, (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const { attemptId } = req.params;
  const state = interviewStore.getState();

  const attempt = state.attempts.find(a => a.attemptId === attemptId);
  if (!attempt) {
    return res.status(404).json({ error: 'Interview attempt not found.' });
  }

  // Enforce strict participant data isolation
  if (!caller.isAdmin && attempt.participantEmail.toLowerCase() !== caller.email.toLowerCase()) {
    return res.status(403).json({
      error: 'Forbidden: You cannot access another participant’s interview attempt.',
    });
  }

  const allQuestions = interviewStore.getAllQuestions();
  const levelRules = getLevelEvaluationCriteria(attempt.level);
  let currentQuestionPayload = null;

  if (attempt.status === 'in_progress') {
    if (attempt.activeFollowUpQuestion) {
      currentQuestionPayload = {
        id: attempt.activeFollowUpQuestion.questionId,
        questionNumber: attempt.currentQuestionIndex + 1,
        totalPrimaryQuestions: attempt.assignedQuestionIds.length,
        questionText: attempt.activeFollowUpQuestion.questionText,
        isFollowUp: true,
        isSafetyCritical: attempt.activeFollowUpQuestion.isSafetyCritical,
        instructions: levelRules.instructions,
        passingScore: levelRules.passingScoreThreshold,
        evaluationFocus: levelRules.evaluationFocus,
      };
    } else {
      const qId = attempt.assignedQuestionIds[attempt.currentQuestionIndex];
      const qObj = allQuestions.find(q => q.id === qId);
      if (qObj) {
        currentQuestionPayload = {
          id: qObj.id,
          questionNumber: attempt.currentQuestionIndex + 1,
          totalPrimaryQuestions: attempt.assignedQuestionIds.length,
          questionText: qObj.questionText,
          isFollowUp: false,
          isSafetyCritical: qObj.isSafetyCritical,
          safetyNote: qObj.safetyNote,
          instructions: qObj.instructions || levelRules.instructions,
          passingScore: qObj.passingScore || levelRules.passingScoreThreshold,
          evaluationFocus: levelRules.evaluationFocus,
        };
      }
    }
  }

  return res.json({
    attempt,
    currentQuestion: currentQuestionPayload,
  });
});

// 5. Participant: Submit Answer, Autosave Progress & Automatically Evaluate with Backend Engine
interviewCenterRouter.post('/attempts/:attemptId/answer', requireApprovedParticipant, async (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const { attemptId } = req.params;
  const {
    answerText,
    originalTranscript,
    spokenLanguage = 'auto',
    inputMode,
    audioDurationSeconds,
    elapsedSessionSeconds,
  } = req.body;

  const state = interviewStore.getState();
  const attempt = state.attempts.find(a => a.attemptId === attemptId);

  if (!attempt) {
    return res.status(404).json({ error: 'Interview attempt not found.' });
  }

  if (!caller.isAdmin && attempt.participantEmail.toLowerCase() !== caller.email.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden: Cannot submit answer to another participant’s attempt.' });
  }

  if (attempt.status !== 'in_progress') {
    return res.status(400).json({ error: 'This interview attempt is already completed.' });
  }

  const rawSubmitted = String(answerText || originalTranscript || '').trim();
  if (!rawSubmitted) {
    return res.status(400).json({ error: 'Answer text cannot be empty. Please speak or type your answer before submitting.' });
  }

  const allQuestions = interviewStore.getAllQuestions();
  const levelRules = getLevelEvaluationCriteria(attempt.level);
  const isFollowUp = Boolean(attempt.activeFollowUpQuestion);
  const primaryQuestionId = attempt.assignedQuestionIds[attempt.currentQuestionIndex];
  const baseQuestion = allQuestions.find(q => q.id === primaryQuestionId) || allQuestions[0];

  const activeQuestionId = isFollowUp ? attempt.activeFollowUpQuestion!.questionId : baseQuestion.id;
  const activeQuestionText = isFollowUp ? attempt.activeFollowUpQuestion!.questionText : baseQuestion.questionText;

  // Update elapsed duration immediately so progress is saved
  const computedElapsed = Math.max(
    attempt.durationSeconds,
    Number(elapsedSessionSeconds) || 0,
    Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)
  );
  attempt.durationSeconds = computedElapsed;
  attempt.updatedAt = new Date().toISOString();

  try {
    // Automatically detect language and translate non-English spoken responses to English for evaluation
    const translationResult = await translateAndNormalizeSpokenAnswer(
      originalTranscript ? String(originalTranscript).trim() : rawSubmitted,
      String(spokenLanguage || 'auto')
    );

    // If user manually edited the English text in answerText, respect their English text while keeping originalTranscript
    const evaluatedEnglishAnswer =
      translationResult.wasTranslated && (!answerText || answerText === originalTranscript)
        ? translationResult.englishTranslation
        : rawSubmitted;

    const evalResult = evaluateInterviewAnswerAutomated({
      role: attempt.role,
      level: attempt.level,
      question: baseQuestion,
      isFollowUp,
      questionText: activeQuestionText,
      answerText: evaluatedEnglishAnswer,
      rubric: attempt.rubricSnapshot,
    });

    const answerRecord: InterviewAnswerRecord = {
      answerId: `ans-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      attemptId: attempt.attemptId,
      questionId: activeQuestionId,
      questionText: activeQuestionText,
      isFollowUp,
      answerText: evaluatedEnglishAnswer,
      originalTranscript: translationResult.originalTranscript || rawSubmitted,
      detectedLanguage: translationResult.detectedLanguageLabel || 'English',
      englishTranslation: translationResult.englishTranslation || evaluatedEnglishAnswer,
      wasTranslated: translationResult.wasTranslated,
      inputMode: inputMode === 'written' ? 'written' : attempt.mode,
      audioDurationSeconds: Number(audioDurationSeconds) || undefined,
      answeredAt: new Date().toISOString(),
      perQuestionScore: evalResult.perQuestionScore,
      questionPassStatus: evalResult.questionPassStatus,
      relevanceScore: evalResult.relevanceScore,
      rubricSubScores: evalResult.rubricSubScores,
      feedback: evalResult.feedback,
      strengths: evalResult.strengths,
      improvements: evalResult.improvements,
      grammarCorrection: evalResult.grammarCorrection,
      modelAnswerExample: evalResult.modelAnswerExample,
      safetyFlagged: evalResult.safetyFlagged,
      safetyReason: evalResult.safetyReason,
      needsFollowUp: evalResult.needsFollowUp,
      generatedFollowUpQuestion: evalResult.generatedFollowUpQuestion,
    };

    // Prevent duplicate writes if retrying the exact same questionId
    const existingIdx = attempt.answers.findIndex(a => a.questionId === activeQuestionId);
    if (existingIdx !== -1) {
      attempt.answers[existingIdx] = answerRecord;
    } else {
      attempt.answers.push(answerRecord);
    }

    // Determine next question or follow-up progression
    const isLastPrimaryQuestion = attempt.currentQuestionIndex >= attempt.assignedQuestionIds.length - 1;

    if (!isFollowUp && evalResult.needsFollowUp) {
      attempt.activeFollowUpQuestion = {
        parentQuestionId: baseQuestion.id,
        questionId: `${baseQuestion.id}-followup`,
        questionText: evalResult.generatedFollowUpQuestion || baseQuestion.followUpPrompt,
        evaluatorLooksFor: baseQuestion.evaluatorLooksFor,
        isSafetyCritical: baseQuestion.isSafetyCritical,
      };
    } else {
      attempt.activeFollowUpQuestion = null;
      if (!isLastPrimaryQuestion) {
        attempt.currentQuestionIndex += 1;
      }
    }

    interviewStore.save();

    // Prepare next question response
    let nextQuestionPayload = null;
    const hasMoreQuestions =
      Boolean(attempt.activeFollowUpQuestion) ||
      attempt.currentQuestionIndex < attempt.assignedQuestionIds.length - 1 ||
      !attempt.answers.some(a => a.questionId === attempt.assignedQuestionIds[attempt.currentQuestionIndex]);

    if (attempt.activeFollowUpQuestion) {
      nextQuestionPayload = {
        id: attempt.activeFollowUpQuestion.questionId,
        questionNumber: attempt.currentQuestionIndex + 1,
        totalPrimaryQuestions: attempt.assignedQuestionIds.length,
        questionText: attempt.activeFollowUpQuestion.questionText,
        isFollowUp: true,
        isSafetyCritical: attempt.activeFollowUpQuestion.isSafetyCritical,
        instructions: levelRules.instructions,
        passingScore: levelRules.passingScoreThreshold,
        evaluationFocus: levelRules.evaluationFocus,
      };
    } else if (hasMoreQuestions) {
      const nextQId = attempt.assignedQuestionIds[attempt.currentQuestionIndex];
      const nextQ = allQuestions.find(q => q.id === nextQId);
      if (nextQ) {
        nextQuestionPayload = {
          id: nextQ.id,
          questionNumber: attempt.currentQuestionIndex + 1,
          totalPrimaryQuestions: attempt.assignedQuestionIds.length,
          questionText: nextQ.questionText,
          isFollowUp: false,
          isSafetyCritical: nextQ.isSafetyCritical,
          safetyNote: nextQ.safetyNote,
          instructions: nextQ.instructions || levelRules.instructions,
          passingScore: nextQ.passingScore || levelRules.passingScoreThreshold,
          evaluationFocus: levelRules.evaluationFocus,
        };
      }
    }

    return res.json({
      saved: true,
      answerRecord,
      attempt,
      nextQuestion: nextQuestionPayload,
      readyToComplete: !nextQuestionPayload,
      providerNotice: null,
    });
  } catch (err: any) {
    interviewStore.save();
    return res.status(500).json({
      saved: false,
      errorClass: 'evaluation_error',
      error: err?.message || 'Technical error while saving answer. Your response draft is preserved—please click Retry.',
    });
  }
});

// 6. Participant: Complete Interview & Generate Final Automated Level Scorecard
interviewCenterRouter.post('/attempts/:attemptId/complete', requireApprovedParticipant, async (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const { attemptId } = req.params;
  const { elapsedSessionSeconds } = req.body;

  const state = interviewStore.getState();
  const attempt = state.attempts.find(a => a.attemptId === attemptId);

  if (!attempt) {
    return res.status(404).json({ error: 'Interview attempt not found.' });
  }

  if (!caller.isAdmin && attempt.participantEmail.toLowerCase() !== caller.email.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden: You cannot finalize another participant’s attempt.' });
  }

  if (attempt.status === 'completed') {
    return res.json({ attempt });
  }

  const now = new Date().toISOString();
  const finalDuration = Math.max(
    attempt.durationSeconds,
    Number(elapsedSessionSeconds) || 0,
    Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)
  );
  attempt.durationSeconds = finalDuration;
  attempt.completedAt = now;
  attempt.updatedAt = now;
  attempt.status = 'completed';

  const answers = attempt.answers;
  const rubric = attempt.rubricSnapshot;
  const levelRules = getLevelEvaluationCriteria(attempt.level);
  const totalAssignedPrimary = Math.max(1, attempt.assignedQuestionIds.length);
  const answeredPrimaryCount = attempt.assignedQuestionIds.filter(qId =>
    answers.some(a => a.questionId === qId)
  ).length;

  // Never pass an unanswered or empty attempt
  if (answers.length === 0) {
    attempt.totalScore = 0;
    attempt.percentageScore = 0;
    attempt.passFailStatus = 'FAIL';
    attempt.overallSummary =
      'Result: FAIL (0/100). No interview questions were answered during this session. You must answer at least 3 questions and meet the passing threshold to pass.';
    interviewStore.save();
    return res.json({ attempt });
  }

  // Calculate rubric breakdown penalizing unanswered primary questions if participant exited early with < minQuestionsRequired
  const completionDivisor = Math.max(answers.length, levelRules.minQuestionsRequired);
  const avgRK = Math.round(answers.reduce((s, a) => s + (a.rubricSubScores?.roleKnowledge ?? 0), 0) / completionDivisor);
  const avgSJ = Math.round(answers.reduce((s, a) => s + (a.rubricSubScores?.situationalJudgment ?? 0), 0) / completionDivisor);
  const avgGV = Math.round(answers.reduce((s, a) => s + (a.rubricSubScores?.grammarVocab ?? 0), 0) / completionDivisor);
  const avgCF = Math.round(answers.reduce((s, a) => s + (a.rubricSubScores?.clarityFluency ?? 0), 0) / completionDivisor);
  const avgPS = Math.round(answers.reduce((s, a) => s + (a.rubricSubScores?.professionalismSafety ?? 0), 0) / completionDivisor);

  const totalScore = Math.min(100, Math.max(0, avgRK + avgSJ + avgGV + avgCF + avgPS));
  const safetyViolations = answers.filter(a => a.safetyFlagged);
  const hasSafetyConcern = safetyViolations.length > 0;
  const passThreshold = levelRules.passingScoreThreshold || rubric.passThreshold || 70;

  let passFailStatus: PassFailOutcome =
    answeredPrimaryCount >= levelRules.minQuestionsRequired && totalScore >= passThreshold ? 'PASS' : 'FAIL';

  if (hasSafetyConcern && (attempt.role === 'electrician' || attempt.role === 'plumber' || safetyViolations.some(v => v.safetyReason))) {
    passFailStatus = 'Fail — Safety Concern';
    attempt.safetyConcernDetails = safetyViolations.map(v => v.safetyReason || 'Critical safety protocol omitted').join(' | ');
  } else if (answeredPrimaryCount < levelRules.minQuestionsRequired) {
    passFailStatus = 'FAIL';
  }

  attempt.totalScore = totalScore;
  attempt.percentageScore = totalScore;
  attempt.levelPassThreshold = passThreshold;
  attempt.passFailStatus = passFailStatus;
  attempt.rubricBreakdown = {
    roleKnowledge: avgRK,
    situationalJudgment: avgSJ,
    grammarVocab: avgGV,
    clarityFluency: avgCF,
    professionalismSafety: avgPS,
  };

  // Collect strengths, weaknesses, and grammar corrections
  const allStrengths = Array.from(new Set(answers.flatMap(a => a.strengths || []))).slice(0, 5);
  const allWeaknesses = Array.from(new Set(answers.flatMap(a => a.improvements || []))).slice(0, 5);
  const allGrammar = answers
    .map(a => a.grammarCorrection)
    .filter((g): g is NonNullable<typeof g> => Boolean(g && g.original && g.corrected))
    .slice(0, 6);

  attempt.strengths = allStrengths.length > 0 ? allStrengths : ['Completed interview responses in English'];
  attempt.weaknesses = allWeaknesses.length > 0 ? allWeaknesses : ['Provide more detailed practical examples'];
  attempt.grammarCorrections = allGrammar;

  // CEFR English specific estimation
  if (attempt.category === 'english') {
    const cefrOrder: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const targetIdx = Math.max(0, cefrOrder.indexOf(attempt.level as CefrLevel));
    let estimatedLevel: CefrLevel | 'Insufficient evidence—continue assessment' = attempt.level as CefrLevel;
    if (answeredPrimaryCount < levelRules.minQuestionsRequired) {
      estimatedLevel = 'Insufficient evidence—continue assessment';
    } else if (totalScore >= passThreshold) {
      estimatedLevel = cefrOrder[targetIdx];
    } else {
      estimatedLevel = cefrOrder[Math.max(0, targetIdx - 1)];
    }

    attempt.cefrEvaluation = {
      targetLevel: attempt.level as CefrLevel,
      estimatedLevel,
      confidence: answeredPrimaryCount >= 5 ? 'High' : answeredPrimaryCount >= 3 ? 'Medium' : 'Low',
      grammarScore: Math.round((avgGV / Math.max(1, rubric.grammarVocabWeight)) * 100),
      vocabularyScore: Math.round(((avgGV + avgRK) / Math.max(1, rubric.grammarVocabWeight + rubric.roleKnowledgeWeight)) * 100),
      comprehensionScore: Math.round((avgSJ / Math.max(1, rubric.situationalJudgmentWeight)) * 100),
      fluencyCoherenceScore: Math.round((avgCF / Math.max(1, rubric.clarityFluencyWeight)) * 100),
      taskCompletionScore: Math.round((answeredPrimaryCount / totalAssignedPrimary) * 100),
    };
  }

  attempt.recommendedPractice = [
    `Review the ${attempt.roleTitle} (${attempt.levelLabel}) procedural standards and key terminology.`,
    'Practice speaking answers aloud in 4–6 complete, structured sentences covering situation, action, and safety/service check.',
    hasSafetyConcern
      ? 'CRITICAL: Review safe isolation (LOTO), allergen verification, or code-compliant safety procedures before re-attempting.'
      : 'Focus on natural transitions and accurate verb tenses when explaining troubleshooting or customer recovery steps.',
  ];

  if (passFailStatus === 'PASS') {
    if (attempt.level === '1') attempt.nextLevelRecommendation = 'Ready to advance to Level 2 — Intermediate';
    else if (attempt.level === '2') attempt.nextLevelRecommendation = 'Ready to advance to Level 3 — Advanced';
    else if (attempt.level === '3') attempt.nextLevelRecommendation = 'Completed Level 3 — Maintain mastery and mentor peers';
    else attempt.nextLevelRecommendation = `Passed target ${attempt.level} — Ready to advance to the next CEFR band`;
  } else {
    attempt.nextLevelRecommendation = `Repeat ${attempt.levelLabel} after reviewing the evaluator feedback and model answers below`;
  }

  attempt.pronunciationDisclaimer =
    attempt.mode === 'spoken'
      ? 'Spoken answers were captured via microphone, transcribed (and translated into English where applicable), and evaluated deterministically for role accuracy, grammar, vocabulary, and communication.'
      : 'Completed in Written Practice mode. For full spoken fluency practice, repeat this level in Spoken Mode with microphone enabled.';

  if (passFailStatus === 'Fail — Safety Concern') {
    attempt.overallSummary = `Result: FAIL — Safety Concern (${totalScore}/100 · ${totalScore}%). A safety-critical violation was flagged: ${attempt.safetyConcernDetails}. In safety-sensitive roles, safe isolation and hazard prevention are mandatory.`;
  } else if (answeredPrimaryCount < levelRules.minQuestionsRequired) {
    attempt.overallSummary = `Result: FAIL (${totalScore}/100 · ${totalScore}%). Only ${answeredPrimaryCount} of ${totalAssignedPrimary} primary questions were answered (minimum ${levelRules.minQuestionsRequired} required for ${attempt.levelLabel}).`;
  } else {
    attempt.overallSummary = `Result: ${passFailStatus} (${totalScore}/100 · ${totalScore}%, Level Pass Requirement: ${passThreshold}/100). Answered ${answeredPrimaryCount}/${totalAssignedPrimary} primary questions (${answers.length} total responses) across ${Math.floor(finalDuration / 60)}m ${finalDuration % 60}s.`;
  }

  interviewStore.save();
  return res.json({ attempt });
});

// 7. Participant: Multilingual Speech Normalization & Translation (/api/interview/speech/translate)
interviewCenterRouter.post('/speech/translate', requireApprovedParticipant, async (req: Request, res: Response) => {
  try {
    const { transcript, spokenLanguage = 'auto' } = req.body;
    const raw = String(transcript || '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'No speech transcript provided for translation.' });
    }
    const result = await translateAndNormalizeSpokenAnswer(raw, String(spokenLanguage));
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      errorClass: 'translation_error',
      error: err?.message || 'Speech translation failed. Please retry or edit your answer manually.',
    });
  }
});

// 8. Participant: Audio Transcription & Translation with Seamless Browser Speech Fallback (/api/interview/speech/transcribe)
interviewCenterRouter.post('/speech/transcribe', requireApprovedParticipant, async (req: Request, res: Response) => {
  const { audioBase64, mimeType = 'audio/webm', fallbackTranscript = '', spokenLanguage = 'auto' } = req.body;
  const cleanFallback = String(fallbackTranscript || '').trim();

  // If browser SpeechRecognition already captured the live transcript, normalize and translate it immediately without needing Gemini API
  if (cleanFallback) {
    try {
      const normalized = await translateAndNormalizeSpokenAnswer(cleanFallback, String(spokenLanguage));
      return res.json({
        transcript: normalized.englishTranslation,
        originalTranscript: normalized.originalTranscript,
        englishTranslation: normalized.englishTranslation,
        detectedLanguage: normalized.detectedLanguageLabel,
        wasTranslated: normalized.wasTranslated,
        model: 'web-speech-automated-pipeline',
      });
    } catch {
      return res.json({
        transcript: cleanFallback,
        originalTranscript: cleanFallback,
        englishTranslation: cleanFallback,
        detectedLanguage: 'English',
        wasTranslated: false,
        model: 'web-speech-direct',
      });
    }
  }

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'No audio or speech transcript captured. Please speak clearly into your microphone.' });
  }

  try {
    const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const { result: rawTranscript } = await callGeminiWithRetry('transcribe_audio', TRANSCRIBE_MODEL, async ai => {
      const response = await ai.models.generateContent({
        model: TRANSCRIBE_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: cleanBase64,
              },
            },
            {
              text: 'Transcribe the speaker’s interview answer accurately. Return only the spoken words without adding commentary.',
            },
          ],
        },
      });
      return (response.text || '').trim();
    });

    const normalized = await translateAndNormalizeSpokenAnswer(rawTranscript, String(spokenLanguage));
    return res.json({
      transcript: normalized.englishTranslation,
      originalTranscript: normalized.originalTranscript,
      englishTranslation: normalized.englishTranslation,
      detectedLanguage: normalized.detectedLanguageLabel,
      wasTranslated: normalized.wasTranslated,
      model: TRANSCRIBE_MODEL,
    });
  } catch (err: any) {
    return res.status(200).json({
      transcript: '',
      originalTranscript: '',
      englishTranslation: '',
      detectedLanguage: 'English',
      wasTranslated: false,
      warning:
        'Live browser speech recognition is active. If your browser blocked speech recognition, please allow microphone access or type/edit your answer below.',
      model: 'local-fallback',
    });
  }
});

// 8b. Participant: Spoken Question TTS (Browser SpeechSynthesis primary + optional Gemini TTS)
interviewCenterRouter.post('/speech/tts', requireApprovedParticipant, async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required for TTS.' });
  }

  // If GEMINI_API_KEY is not configured, immediately instruct client to use native browser SpeechSynthesis without throwing a 500 error
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '') {
    return res.json({
      audioBase64: '',
      useBrowserTts: true,
      mimeType: 'audio/wav',
      model: 'browser-speech-synthesis',
    });
  }

  try {
    const { result: audioBase64 } = await callGeminiWithRetry(
      'generate_tts',
      TTS_MODEL,
      async ai => {
        const response = await ai.models.generateContent({
          model: TTS_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: text.slice(0, 600),
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });
        const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!data) throw new Error('No audio returned from TTS model');
        return data;
      },
      1
    );

    return res.json({
      audioBase64,
      useBrowserTts: false,
      mimeType: 'audio/wav',
      model: TTS_MODEL,
    });
  } catch {
    return res.json({
      audioBase64: '',
      useBrowserTts: true,
      mimeType: 'audio/wav',
      model: 'browser-speech-synthesis',
    });
  }
});

// 9. Participant: Submit Complete English Level Exam (CEFR A1–C2: 30 Objective Qs + 3 Speaking + 1 Writing)
interviewCenterRouter.post('/english-exam/submit', requireApprovedParticipant, async (req: Request, res: Response) => {
  try {
    const caller: VerifiedCaller = (req as any).caller;
    const participant: ApprovedParticipant = (req as any).participant;
    const rawPayload = req.body?.result
      ? typeof req.body.result === 'string'
        ? JSON.parse(req.body.result)
        : req.body.result
      : req.body;

    const examResult: EnglishExamResultPayload = {
      candidate: {
        name: String(rawPayload?.candidate?.name || participant.displayName || caller.name),
        email: caller.email,
        ref: String(rawPayload?.candidate?.ref || ''),
      },
      submittedAt: rawPayload?.submittedAt || new Date().toISOString(),
      timedOut: Boolean(rawPayload?.timedOut),
      durationSec: Number(rawPayload?.durationSec) || 600,
      objective: {
        level: rawPayload?.objective?.level || 'A1',
        score: Number(rawPayload?.objective?.score) || 0,
        total: Number(rawPayload?.objective?.total) || 30,
        byLevel: rawPayload?.objective?.byLevel || {},
        bySkill: rawPayload?.objective?.bySkill || {},
      },
      speaking: Array.isArray(rawPayload?.speaking) ? rawPayload.speaking : [],
      writing: {
        prompt:
          rawPayload?.writing?.prompt ||
          'Write 100 to 150 words: Describe your job and your goals for the next five years.',
        text: String(rawPayload?.writing?.text || ''),
        words: Number(rawPayload?.writing?.words) || 0,
        metrics: rawPayload?.writing?.metrics || { words: 0, band: 'No data' },
      },
      incorrectAnswers: Array.isArray(rawPayload?.incorrectAnswers) ? rawPayload.incorrectAnswers : [],
      examinerReview: 'pending',
    };

    const parseRatioPct = (ratioStr?: string, fallbackPct = 70): number => {
      if (!ratioStr || !ratioStr.includes('/')) return fallbackPct;
      const [num, den] = ratioStr.split('/').map(Number);
      if (!den || isNaN(num)) return fallbackPct;
      return Math.round((num / den) * 100);
    };

    const objScore = examResult.objective.score;
    const objTotal = Math.max(1, examResult.objective.total);
    const objectivePct = Math.round((objScore / objTotal) * 100);
    const grammarPct = parseRatioPct(examResult.objective.bySkill?.Grammar, objectivePct);
    const vocabPct = parseRatioPct(examResult.objective.bySkill?.Vocabulary, objectivePct);
    const readingPct = parseRatioPct(examResult.objective.bySkill?.Reading, objectivePct);
    const listeningPct = parseRatioPct(examResult.objective.bySkill?.Listening, objectivePct);

    const now = new Date().toISOString();
    const attemptId = `exam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const state = interviewStore.getState();

    // Build Answer Records for Speaking (Tasks 1-3) and Writing so Admin Transcript Inspector shows full details
    const examAnswers: InterviewAnswerRecord[] = [];
    examResult.speaking.forEach((spItem, idx) => {
      examAnswers.push({
        answerId: `${attemptId}-sp-${idx + 1}`,
        attemptId,
        questionId: `english-exam-speaking-${idx + 1}`,
        questionText: `Speaking Task ${idx + 1}: ${spItem.prompt}`,
        isFollowUp: false,
        answerText: spItem.transcript || '(Audio recorded — no speech transcript captured)',
        inputMode: 'spoken',
        audioDurationSeconds: spItem.seconds || 0,
        answeredAt: now,
        perQuestionScore: spItem.metrics?.words >= 20 ? 80 : spItem.metrics?.words > 0 ? 60 : 0,
        feedback: `Indicative Speaking Band: ${spItem.metrics?.band || 'N/A'} (${spItem.metrics?.words || 0} words, ${spItem.seconds || 0}s${spItem.metrics?.wpm ? `, ${spItem.metrics.wpm} WPM` : ''}).`,
        strengths: spItem.metrics?.words >= 15 ? [`Completed Speaking Task ${idx + 1} (${spItem.metrics.band})`] : [],
        improvements: spItem.metrics?.words < 20 ? ['Speak for at least 30 seconds with fuller detail'] : [],
        safetyFlagged: false,
        needsFollowUp: false,
      });
    });

    if (examResult.writing.text.trim()) {
      examAnswers.push({
        answerId: `${attemptId}-wr-1`,
        attemptId,
        questionId: 'english-exam-writing-1',
        questionText: `Writing Task: ${examResult.writing.prompt}`,
        isFollowUp: false,
        answerText: examResult.writing.text,
        inputMode: 'written',
        answeredAt: now,
        perQuestionScore: examResult.writing.words >= 80 ? 85 : examResult.writing.words >= 40 ? 70 : 50,
        feedback: `Indicative Writing Band: ${examResult.writing.metrics?.band || 'N/A'} (${examResult.writing.words} words, lexical variety: ${examResult.writing.metrics?.lexicalVariety ?? 'N/A'}).`,
        strengths: examResult.writing.words >= 80 ? [`Met target length (${examResult.writing.words} words)`] : [],
        improvements: examResult.writing.words < 100 ? ['Aim for 100–150 words as instructed'] : [],
        safetyFlagged: false,
        needsFollowUp: false,
      });
    }

    const mappedLevel: CefrLevel =
      examResult.objective.level === 'Below A1' ? 'A1' : (examResult.objective.level as CefrLevel);
    const passFail: PassFailOutcome = objScore >= 15 ? 'PASS' : 'FAIL';

    const newAttempt: InterviewAttemptRecord = {
      attemptId,
      participantEmail: caller.email,
      participantUid: caller.uid,
      participantName: examResult.candidate.name,
      category: 'english',
      role: 'cefr_english',
      roleTitle: 'English Level Exam (CEFR A1–C2)',
      level: mappedLevel,
      levelLabel: `CEFR ${examResult.objective.level} (${objScore}/${objTotal})`,
      mode: 'spoken',
      status: 'completed',
      consentGivenAt: now,
      startedAt: new Date(Date.now() - examResult.durationSec * 1000).toISOString(),
      updatedAt: now,
      completedAt: now,
      durationSeconds: examResult.durationSec,
      targetDurationSeconds: 2700,
      questionBankVersion: 'english-exam-cefr-30q-v1',
      rubricSnapshot: { ...state.rubricConfig },
      providerUsed: PRIMARY_INTERVIEW_MODEL,
      currentQuestionIndex: objTotal,
      assignedQuestionIds: [],
      activeFollowUpQuestion: null,
      answers: examAnswers,
      totalScore: objectivePct,
      passFailStatus: passFail,
      rubricBreakdown: {
        roleKnowledge: Math.round((readingPct / 100) * state.rubricConfig.roleKnowledgeWeight),
        situationalJudgment: Math.round((listeningPct / 100) * state.rubricConfig.situationalJudgmentWeight),
        grammarVocab: Math.round(((grammarPct + vocabPct) / 200) * state.rubricConfig.grammarVocabWeight),
        clarityFluency: Math.round((objectivePct / 100) * state.rubricConfig.clarityFluencyWeight),
        professionalismSafety: Math.round((objectivePct / 100) * state.rubricConfig.professionalismSafetyWeight),
      },
      cefrEvaluation: {
        targetLevel: 'C2',
        estimatedLevel: examResult.objective.level === 'Below A1' ? 'A1' : examResult.objective.level,
        confidence: 'High',
        grammarScore: grammarPct,
        vocabularyScore: vocabPct,
        comprehensionScore: Math.round((readingPct + listeningPct) / 2),
        fluencyCoherenceScore: objectivePct,
        taskCompletionScore: objectivePct,
      },
      strengths: [
        `Objective CEFR Level Achieved: ${examResult.objective.level} (${objScore}/${objTotal} correct)`,
        `Grammar: ${examResult.objective.bySkill?.Grammar || 'N/A'} · Vocabulary: ${examResult.objective.bySkill?.Vocabulary || 'N/A'}`,
        `Reading: ${examResult.objective.bySkill?.Reading || 'N/A'} · Listening: ${examResult.objective.bySkill?.Listening || 'N/A'}`,
      ],
      weaknesses:
        (examResult.incorrectAnswers || []).length > 0
          ? examResult.incorrectAnswers!
              .slice(0, 4)
              .map(w => `Q${w.n} (${w.type}): "${w.q}" — Correct: "${w.correct}" (Answered: "${w.yours}")`)
          : ['Answered all 30 objective questions accurately'],
      overallSummary: `Completed Full English Level Exam (CEFR A1–C2). Objective Level: ${examResult.objective.level} (${objScore}/${objTotal} correct · ${objectivePct}%). Writing: ${examResult.writing.words} words (${examResult.writing.metrics?.band || 'N/A'}).`,
      englishExamResult: examResult,
    };

    state.attempts.unshift(newAttempt);
    interviewStore.save();

    return res.json({
      ok: true,
      attempt: newAttempt,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to save English Level Exam result.',
    });
  }
});

// ========================================================
// ADMIN CONTROL PANEL ROUTES (/api/interview/admin/*)
// ========================================================

// Admin Overview: Participants, Attempts, Question Bank, Rubric, Gemini Health, Audit Log
interviewCenterRouter.get('/admin/overview', requireAdmin, (_req: Request, res: Response) => {
  const state = interviewStore.getState();
  const apiKeyConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');

  let healthStatus: GeminiHealthSummary['status'] = 'idle';
  if (!apiKeyConfigured || state.stats.lastErrorClass === 'auth_401' || state.stats.lastErrorClass === 'permission_403') {
    healthStatus = 'config_error';
  } else if (state.stats.lastErrorClass === 'rate_limit_429') {
    healthStatus = 'degraded_rate_limited';
  } else if (state.stats.successfulRequests > 0) {
    healthStatus = 'healthy';
  }

  const geminiHealth: GeminiHealthSummary = {
    provider: 'gemini',
    primaryModel: PRIMARY_INTERVIEW_MODEL,
    transcribeModel: TRANSCRIBE_MODEL,
    ttsModel: TTS_MODEL,
    apiKeyConfigured,
    status: healthStatus,
    totalRequests: state.stats.totalRequests,
    successfulRequests: state.stats.successfulRequests,
    rateLimitEvents: state.stats.rateLimitEvents,
    configErrorEvents: state.stats.configErrorEvents,
    retryRecoveries: state.stats.retryRecoveries,
    lastSuccessAt: state.stats.lastSuccessAt,
    lastErrorAt: state.stats.lastErrorAt,
    lastErrorMessage: state.stats.lastErrorMessage,
    lastErrorClass: state.stats.lastErrorClass,
    recentEvents: state.providerEvents.slice(0, 40),
  };

  return res.json({
    approvedParticipants: state.approvedParticipants.map(p => sanitizeParticipantForClient(p, true)),
    attempts: state.attempts,
    rubricConfig: state.rubricConfig,
    roleRubricOverrides: state.roleRubricOverrides,
    questionBankVersion: QUESTION_BANK_VERSION,
    questionBankCount: interviewStore.getAllQuestions().length,
    questions: interviewStore.getAllQuestions(),
    geminiHealth,
    auditEvents: state.auditEvents.slice(0, 60),
  });
});

// Admin: Add or Update Approved Participant Gmail
interviewCenterRouter.post('/admin/participants', requireAdmin, (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const {
    email,
    displayName,
    status = 'approved',
    allowedCategories = ['all'],
    canViewResults = true,
    accessCode,
    expiresAt = null,
    notes = '',
  } = req.body;

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'A valid Gmail or email address is required.' });
  }

  const cleanAccessCode = accessCode !== undefined && accessCode !== null ? String(accessCode).trim() : '';

  const state = interviewStore.getState();
  const now = new Date().toISOString();
  const existing = state.approvedParticipants.find(p => p.email.toLowerCase() === cleanEmail);

  if (existing) {
    existing.displayName = displayName !== undefined ? String(displayName).trim() : existing.displayName;
    existing.status = status;
    existing.allowedCategories = Array.isArray(allowedCategories) && allowedCategories.length > 0 ? allowedCategories : ['all'];
    existing.canViewResults = Boolean(canViewResults);
    if (accessCode !== undefined) {
      if (cleanAccessCode) {
        existing.requireAccessCode = true;
        existing.accessCodeHash = hashSecretValue(cleanAccessCode);
        existing.accessCodeDisplay = cleanAccessCode;
      } else {
        existing.requireAccessCode = false;
        existing.accessCodeHash = null;
        existing.accessCodeDisplay = null;
      }
    }
    existing.sessionVersion = (existing.sessionVersion || 1) + 1;
    existing.expiresAt = expiresAt || null;
    existing.notes = notes !== undefined ? String(notes) : existing.notes;
    existing.updatedAt = now;

    if (status !== 'approved') {
      purgeParticipantSessions(cleanEmail);
    }
    interviewStore.recordAuditEvent(
      caller.email,
      'UPDATE_PARTICIPANT',
      cleanEmail,
      `Status=${status}, Categories=${existing.allowedCategories.join(',')}, AccessCode=${existing.requireAccessCode ? 'Required' : 'DirectEmail'}`
    );
    return res.json({ participant: sanitizeParticipantForClient(existing, true), updated: true });
  }

  const created: ApprovedParticipant = {
    id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: cleanEmail,
    displayName: String(displayName || cleanEmail.split('@')[0]).trim(),
    status,
    allowedCategories: Array.isArray(allowedCategories) && allowedCategories.length > 0 ? allowedCategories : ['all'],
    canViewResults: Boolean(canViewResults),
    requireAccessCode: Boolean(cleanAccessCode),
    accessCodeHash: cleanAccessCode ? hashSecretValue(cleanAccessCode) : null,
    accessCodeDisplay: cleanAccessCode || null,
    sessionVersion: 1,
    expiresAt: expiresAt || null,
    createdAt: now,
    updatedAt: now,
    createdBy: caller.email,
    notes: String(notes || ''),
  };

  state.approvedParticipants.unshift(created);
  interviewStore.recordAuditEvent(
    caller.email,
    'ADD_PARTICIPANT',
    cleanEmail,
    `Approved with categories: ${created.allowedCategories.join(',')}, AccessCode=${created.requireAccessCode ? 'Required' : 'DirectEmail'}`
  );
  return res.json({ participant: sanitizeParticipantForClient(created, true), created: true });
});

// Admin: Change Participant Status (approve / suspend / revoke), Rotate Access Code, or Remove
interviewCenterRouter.patch('/admin/participants/:id', requireAdmin, (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const { id } = req.params;
  const { status, allowedCategories, canViewResults, accessCode, expiresAt, notes } = req.body;

  const state = interviewStore.getState();
  const participant = state.approvedParticipants.find(p => p.id === id);
  if (!participant) {
    return res.status(404).json({ error: 'Participant record not found.' });
  }

  if (participant.email === AUTHORIZED_ADMIN_EMAIL && status && status !== 'approved') {
    return res.status(400).json({ error: 'Cannot suspend or revoke the primary administrator account.' });
  }

  let shouldPurgeSessions = false;

  if (status && status !== participant.status) {
    participant.status = status;
    if (status !== 'approved') {
      shouldPurgeSessions = true;
    }
  }
  if (Array.isArray(allowedCategories)) participant.allowedCategories = allowedCategories;
  if (typeof canViewResults === 'boolean') participant.canViewResults = canViewResults;
  if (accessCode !== undefined) {
    const cleanCode = accessCode !== null ? String(accessCode).trim() : '';
    if (cleanCode) {
      participant.requireAccessCode = true;
      participant.accessCodeHash = hashSecretValue(cleanCode);
      participant.accessCodeDisplay = cleanCode;
    } else {
      participant.requireAccessCode = false;
      participant.accessCodeHash = null;
      participant.accessCodeDisplay = null;
    }
    shouldPurgeSessions = true;
  }
  if (expiresAt !== undefined) participant.expiresAt = expiresAt || null;
  if (notes !== undefined) participant.notes = String(notes);
  participant.updatedAt = new Date().toISOString();

  if (shouldPurgeSessions) {
    participant.sessionVersion = (participant.sessionVersion || 1) + 1;
    purgeParticipantSessions(participant.email);
  }

  interviewStore.recordAuditEvent(
    caller.email,
    'PATCH_PARTICIPANT',
    participant.email,
    `Updated status=${participant.status}, expiresAt=${participant.expiresAt || 'none'}, sessionsPurged=${shouldPurgeSessions}`
  );

  return res.json({ participant: sanitizeParticipantForClient(participant, true) });
});

interviewCenterRouter.delete('/admin/participants/:id', requireAdmin, (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const { id } = req.params;
  const state = interviewStore.getState();
  const idx = state.approvedParticipants.findIndex(p => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Participant not found.' });
  }
  const target = state.approvedParticipants[idx];
  if (target.email === AUTHORIZED_ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Cannot delete the primary administrator account.' });
  }
  state.approvedParticipants.splice(idx, 1);
  // Immediately purge all active sessions for this deleted email
  purgeParticipantSessions(target.email);
  interviewStore.recordAuditEvent(caller.email, 'DELETE_PARTICIPANT', target.email, 'Removed from allowlist & terminated active sessions');
  return res.json({ deleted: true });
});

// Admin: Update Rubric & Pass Threshold Configuration
interviewCenterRouter.put('/admin/rubric', requireAdmin, (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const {
    roleKnowledgeWeight,
    situationalJudgmentWeight,
    grammarVocabWeight,
    clarityFluencyWeight,
    professionalismSafetyWeight,
    passThreshold,
    minDurationSecondsL1,
    minDurationSecondsL2,
    minDurationSecondsL3,
    minDurationSecondsCefr,
    strictFiveMinuteCap,
    showModelAnswersAfterCompletion,
  } = req.body;

  const state = interviewStore.getState();
  const nextRubric: RubricConfig = {
    roleKnowledgeWeight: Number(roleKnowledgeWeight ?? state.rubricConfig.roleKnowledgeWeight),
    situationalJudgmentWeight: Number(situationalJudgmentWeight ?? state.rubricConfig.situationalJudgmentWeight),
    grammarVocabWeight: Number(grammarVocabWeight ?? state.rubricConfig.grammarVocabWeight),
    clarityFluencyWeight: Number(clarityFluencyWeight ?? state.rubricConfig.clarityFluencyWeight),
    professionalismSafetyWeight: Number(professionalismSafetyWeight ?? state.rubricConfig.professionalismSafetyWeight),
    passThreshold: Number(passThreshold ?? state.rubricConfig.passThreshold),
    minDurationSecondsL1: Number(minDurationSecondsL1 ?? state.rubricConfig.minDurationSecondsL1),
    minDurationSecondsL2: Number(minDurationSecondsL2 ?? state.rubricConfig.minDurationSecondsL2),
    minDurationSecondsL3: Number(minDurationSecondsL3 ?? state.rubricConfig.minDurationSecondsL3),
    minDurationSecondsCefr: Number(minDurationSecondsCefr ?? state.rubricConfig.minDurationSecondsCefr),
    strictFiveMinuteCap: Boolean(strictFiveMinuteCap ?? state.rubricConfig.strictFiveMinuteCap),
    showModelAnswersAfterCompletion: Boolean(showModelAnswersAfterCompletion ?? state.rubricConfig.showModelAnswersAfterCompletion),
    version: `rubric-v1.${Date.now().toString().slice(-4)}`,
    updatedAt: new Date().toISOString(),
    updatedBy: caller.email,
  };

  state.rubricConfig = nextRubric;
  interviewStore.recordAuditEvent(
    caller.email,
    'UPDATE_RUBRIC',
    nextRubric.version,
    `PassThreshold=${nextRubric.passThreshold}, Strict5Min=${nextRubric.strictFiveMinuteCap}`
  );

  return res.json({ rubricConfig: state.rubricConfig });
});

// Admin: Delete Attempt / Transcript (Data Retention Control)
interviewCenterRouter.delete('/admin/attempts/:attemptId', requireAdmin, (req: Request, res: Response) => {
  const caller: VerifiedCaller = (req as any).caller;
  const { attemptId } = req.params;
  const state = interviewStore.getState();
  const idx = state.attempts.findIndex(a => a.attemptId === attemptId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Attempt not found.' });
  }
  const removed = state.attempts[idx];
  state.attempts.splice(idx, 1);
  interviewStore.recordAuditEvent(
    caller.email,
    'DELETE_ATTEMPT',
    attemptId,
    `Deleted attempt for ${removed.participantEmail} (${removed.roleTitle} ${removed.levelLabel})`
  );
  return res.json({ deleted: true });
});

// Admin: Live Gemini Health Check Ping
interviewCenterRouter.post('/admin/gemini-health-check', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { result, retryCount } = await callGeminiWithRetry('health_check', PRIMARY_INTERVIEW_MODEL, async ai => {
      const response = await ai.models.generateContent({
        model: PRIMARY_INTERVIEW_MODEL,
        contents: 'Respond with the single word HEALTHY.',
      });
      return (response.text || '').trim();
    });
    return res.json({
      ok: true,
      model: PRIMARY_INTERVIEW_MODEL,
      reply: result,
      retryCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(err?.statusCode || 500).json({
      ok: false,
      errorClass: err?.errorClass || 'unknown',
      error: err?.message || 'Gemini health check failed.',
    });
  }
});
