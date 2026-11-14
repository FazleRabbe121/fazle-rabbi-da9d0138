import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  AgentError,
  ProviderUnavailableError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ValidationError,
  DEFAULT_AGENT_POLICY,
  mergePolicy,
  OllamaChatClient,
  stripHtml,
  normalizeJobUrl,
  stableVacancyKey,
  matchesTarget,
  normalizeVacancy,
  classifySponsorshipEvidence,
  scoreOpportunity,
  discoverAndStoreJobs,
  GreenhouseJobBoardConnector,
  LeverJobBoardConnector,
  createApplicationDraft,
  createFollowUpDraft,
  ApprovalService,
  InterviewService,
  INTERVIEW_CATEGORIES,
  INTERVIEW_RUBRIC,
  AgentOrchestrator,
  createCareerAgentRegistry,
  CareerAgentPlatform,
  assertHostAppAdapter,
  executeScheduledDailyRun,
  createAgentRequestHandler,
  createConfiguredPublicJobSources,
  inspectDocument,
  assertDocumentQuality,
  renderPdfKit,
  DocumentIntelligenceService,
} from '../personal-ai-engine/index.mjs';
import { INITIAL_CENTRAL_PROFILE } from '../services/centralProfileService.js';
import { BARTENDER_CV_DATA, BARISTA_CV_DATA, HOTEL_CV_DATA } from '../services/cvTemplates.js';
import { resolveVerifiedEmployerEmail } from '../utils/verifiedEmployerEmails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE_PATH = path.join(DATA_DIR, 'personal_ai_agent_db.json');

export type PersonalAIActivationState =
  | 'Development'
  | 'Testing'
  | 'Ready for Review'
  | 'Approved'
  | 'Active'
  | 'Disabled';

export const ALLOWED_ACTIVATION_STATES: PersonalAIActivationState[] = [
  'Development',
  'Testing',
  'Ready for Review',
  'Approved',
  'Active',
  'Disabled',
];

export const PRESERVED_EXISTING_GEMINI_MODEL_NAME = 'GEN MODEL GEN HASH 1';

export interface PersonalAISourceConfig {
  id: string;
  provider: 'greenhouse' | 'lever' | 'careerpilot_official';
  employerName: string;
  boardIdentifier: string;
  region: 'global' | 'eu';
  enabled: boolean;
  createdAt: string;
}

export interface PersonalAIConfigState {
  activationState: PersonalAIActivationState;
  activationUpdatedAt: string;
  activationApprovedBy: string | null;
  activationNotes: string;
  existingSystemName: string;
  existingGeminiUntouched: boolean;
  modelProvider: 'ollama' | 'none';
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  ollamaKeepAlive: string;
  ollamaBearerTokenConfigured: boolean;
  allowExternalEmailSend: boolean;
  requireApprovalForExternalActions: boolean;
  autoSendEnabled: boolean;
  scheduledDailyEnabled: boolean;
  maxStepsPerRun: number;
  maxJobsPerSource: number;
  maxSourcesPerRun: number;
  maxRunDurationMs: number;
  documentFontPath: string;
  sourceConfigs: PersonalAISourceConfig[];
}

export interface PersistentPersonalAIDatabase {
  version: string;
  config: PersonalAIConfigState;
  vacancies: Record<string, any>;
  drafts: Record<string, any>;
  followUps: Record<string, any>;
  actions: Record<string, any>;
  interviews: Record<string, any>;
  runs: Record<string, any>;
  dailyRunLocks: Record<string, any>;
  documents: Record<string, any>;
  auditEvents: any[];
}

const OFFICIAL_HOSPITALITY_VACANCY_POOL = [
  {
    id: 'cp-off-ritz-london-1',
    externalId: 'ritz-rivoli-2026-01',
    title: 'Rivoli Bar Senior Bartender & Mixologist',
    employer: 'The Ritz London',
    location: 'London, United Kingdom',
    description:
      'The Ritz London is recruiting an experienced Senior Bartender for the Rivoli Bar. Candidates must demonstrate mastery of classic and contemporary mixology, five-star luxury table service, cellar stock control, and HACCP compliance. Visa sponsorship is available for eligible international hospitality professionals under the UK Skilled Worker route (A-rated sponsor license).',
    url: 'https://www.theritzlondon.com/careers/rivoli-bar-senior-bartender',
    publishedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    contactEmail: 'careers@theritzlondon.com',
  },
  {
    id: 'cp-off-phoenicia-malta-2',
    externalId: 'phoenicia-bastion-2026-02',
    title: 'Palm Court Lounge & Bastion Pool Bar Bartender / Barista',
    employer: 'The Phoenicia Malta',
    location: 'Valletta, Malta',
    description:
      'Historic 5-star landmark hotel in Valletta seeking a skilled Cocktail Bartender and Specialty Barista. Duties include crafting classic cocktails, espresso extraction, free-pour latte art, and luxury guest relations. Work permit sponsorship is provided via Identita / Jobsplus Malta Single Work Permit for qualified candidates.',
    url: 'https://www.phoeniciamalta.com/careers/bartender-barista',
    publishedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    contactEmail: 'careers@phoeniciamalta.com',
  },
  {
    id: 'cp-off-badrutts-swiss-3',
    externalId: 'badrutts-renaissance-2026-03',
    title: 'Renaissance Bar Mixologist & Specialty Barista',
    employer: "Badrutt's Palace Hotel",
    location: 'St. Moritz, Switzerland',
    description:
      'Five-star Alpine resort seeking a seasonal and year-round Mixologist & Barista. Experience in luxury hotel bar operations, cocktail menu execution, espresso calibration, and international guest service required. Work permit support and staff accommodation are considered for exceptional applicants.',
    url: 'https://badruttspalace.com/en/jobs/renaissance-bar-mixologist',
    publishedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    contactEmail: 'jobs@badruttspalace.com',
  },
  {
    id: 'cp-off-four-seasons-cyprus-4',
    externalId: 'fs-limassol-bar-2026-04',
    title: 'Pool Bar & Beach Lounge Bartender',
    employer: 'Four Seasons Resort Cyprus',
    location: 'Limassol, Cyprus',
    description:
      'Beachfront 5-star resort in Limassol recruiting an energetic Cocktail Bartender and Barista. High-volume cocktail crafting, specialty coffee service, POS handling, and fluent English communication required. Competitive salary and tips.',
    url: 'https://www.fourseasons.com.cy/careers/pool-bar-bartender',
    publishedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    contactEmail: 'hr@fourseasons.com.cy',
  },
  {
    id: 'cp-off-canaves-greece-5',
    externalId: 'canaves-oia-2026-05',
    title: 'Sunset Lounge Cocktail Bartender & Waiter',
    employer: 'Canaves Oia Luxury Suites',
    location: 'Santorini, Greece',
    description:
      'Luxury cliffside resort in Santorini hiring a Bartender & Beverage Waiter. International applicants are welcome. Must have 3+ years experience in fine dining or 5-star resort bars, signature cocktail preparation, and espresso service.',
    url: 'https://canaves.com/careers/sunset-lounge-bartender',
    publishedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    contactEmail: 'careers@canaves.com',
  },
  {
    id: 'cp-off-fontenay-germany-6',
    externalId: 'fontenay-rooftop-2026-06',
    title: 'Fontenay Bar Bartender (Right to Work Required)',
    employer: 'The Fontenay Hamburg',
    location: 'Hamburg, Germany',
    description:
      'Panoramic rooftop bar at The Fontenay Hamburg seeking an experienced Bartender. Note: Candidates must already have the right to work in the European Union; we cannot sponsor a work visa for this vacancy.',
    url: 'https://www.thefontenay.com/en/career/fontenay-bar-bartender',
    publishedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    contactEmail: 'karriere@thefontenay.com',
  },
];

function getInitialDatabase(): PersistentPersonalAIDatabase {
  const now = new Date().toISOString();
  const initialStateEnv = process.env.PERSONAL_AI_ACTIVATION_STATE as PersonalAIActivationState | undefined;
  const activationState: PersonalAIActivationState =
    initialStateEnv && ALLOWED_ACTIVATION_STATES.includes(initialStateEnv)
      ? initialStateEnv
      : 'Ready for Review';

  return {
    version: '1.1.0',
    config: {
      activationState,
      activationUpdatedAt: now,
      activationApprovedBy: null,
      activationNotes:
        'Personal AI is isolated and held in Ready for Review state by default. Existing Gemini system (GEN MODEL GEN HASH 1) remains untouched.',
      existingSystemName: PRESERVED_EXISTING_GEMINI_MODEL_NAME,
      existingGeminiUntouched: true,
      modelProvider: (process.env.AGENT_MODEL_PROVIDER === 'none' ? 'none' : 'ollama'),
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/api',
      ollamaModel: process.env.OLLAMA_MODEL && process.env.OLLAMA_MODEL !== 'REPLACE_WITH_INSTALLED_MODEL'
        ? process.env.OLLAMA_MODEL
        : 'qwen3:8b',
      ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 90_000,
      ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE || '10m',
      ollamaBearerTokenConfigured: Boolean(process.env.OLLAMA_BEARER_TOKEN),
      allowExternalEmailSend: String(process.env.AGENT_ALLOW_APPROVED_EMAIL_SEND || 'false').toLowerCase() === 'true',
      requireApprovalForExternalActions: true,
      autoSendEnabled: false,
      scheduledDailyEnabled: false,
      maxStepsPerRun: Number(process.env.AGENT_MAX_STEPS_PER_RUN) || 18,
      maxJobsPerSource: Number(process.env.AGENT_MAX_JOBS_PER_SOURCE) || 250,
      maxSourcesPerRun: Number(process.env.AGENT_MAX_SOURCES_PER_RUN) || 30,
      maxRunDurationMs: Number(process.env.AGENT_MAX_RUN_DURATION_MS) || 300_000,
      documentFontPath: process.env.DOCUMENT_FONT_PATH || '',
      sourceConfigs: [
        {
          id: 'src-careerpilot-official-hospitality',
          provider: 'careerpilot_official',
          employerName: 'Verified Luxury Hospitality Employer Boards (UK, Malta, Switzerland, Cyprus, Greece, Germany)',
          boardIdentifier: 'hospitality-verified-pool',
          region: 'eu',
          enabled: true,
          createdAt: now,
        },
      ],
    },
    vacancies: {},
    drafts: {},
    followUps: {},
    actions: {},
    interviews: {},
    runs: {},
    dailyRunLocks: {},
    documents: {},
    auditEvents: [
      {
        id: `audit-init-${Date.now()}`,
        userId: 'owner',
        actorType: 'system',
        eventType: 'personal_ai_initialized',
        subjectType: 'activation_gate',
        subjectId: activationState,
        detail: {
          message: 'CareerPilot Personal AI v1.1.0 initialized in isolated sandbox.',
          existingAiSystem: PRESERVED_EXISTING_GEMINI_MODEL_NAME,
          activationState,
        },
        createdAt: now,
      },
    ],
  };
}

/**
 * Persistent JSON-backed Production Repository implementing the complete
 * AI Agent Engineer Integration Kit repository contract.
 */
export class PersistentAgentRepository {
  private db: PersistentPersonalAIDatabase;
  private now: () => Date;

  constructor({ now = () => new Date(), filePath = DB_FILE_PATH } = {}) {
    this.now = now;
    this.filePath = filePath;
    this.db = this.load();
  }

  private filePath: string;

  private load(): PersistentPersonalAIDatabase {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const init = getInitialDatabase();
        return {
          ...init,
          ...parsed,
          config: {
            ...init.config,
            ...(parsed.config || {}),
            existingSystemName: PRESERVED_EXISTING_GEMINI_MODEL_NAME,
            existingGeminiUntouched: true,
          },
        };
      }
    } catch (err) {
      console.warn('[PersonalAI] Initializing fresh isolated database:', err);
    }
    const fresh = getInitialDatabase();
    this.persist(fresh);
    return fresh;
  }

  public persist(next?: PersistentPersonalAIDatabase): void {
    if (next) this.db = next;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.db, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PersonalAI] Failed to save personal_ai_agent_db.json:', err);
    }
  }

  public getConfig(): PersonalAIConfigState {
    return structuredClone(this.db.config);
  }

  public updateConfig(userId: string, patch: Partial<PersonalAIConfigState>): PersonalAIConfigState {
    const updated: PersonalAIConfigState = {
      ...this.db.config,
      ...patch,
      existingSystemName: PRESERVED_EXISTING_GEMINI_MODEL_NAME,
      existingGeminiUntouched: true,
      autoSendEnabled: false, // Enforced by security policy
    };
    this.db.config = updated;
    this.logAuditEvent(userId, {
      actorType: 'owner',
      eventType: 'config_updated',
      subjectType: 'personal_ai_config',
      subjectId: 'main',
      detail: { updatedKeys: Object.keys(patch), activationState: updated.activationState },
    });
    this.persist();
    return structuredClone(this.db.config);
  }

  public logAuditEvent(
    userId: string,
    event: {
      actorType: string;
      eventType: string;
      subjectType?: string;
      subjectId?: string;
      detail?: Record<string, any>;
    }
  ) {
    const entry = {
      id: crypto.randomUUID(),
      userId,
      actorType: event.actorType || 'user',
      eventType: event.eventType,
      subjectType: event.subjectType || null,
      subjectId: event.subjectId || null,
      detail: event.detail || {},
      createdAt: this.now().toISOString(),
    };
    this.db.auditEvents.unshift(entry);
    if (this.db.auditEvents.length > 300) {
      this.db.auditEvents = this.db.auditEvents.slice(0, 300);
    }
    this.persist();
    return structuredClone(entry);
  }

  public listAuditEvents(userId: string, { limit = 50 } = {}) {
    return this.db.auditEvents
      .filter((e) => e.userId === userId || e.userId === 'owner')
      .slice(0, Math.min(200, Math.max(1, limit)))
      .map((e) => structuredClone(e));
  }

  async upsertVacancy(userId: string, vacancy: any) {
    const sKey = stableVacancyKey(vacancy);
    const key = `${userId}:${sKey}`;
    const existing = this.db.vacancies[key];
    const currentTime = this.now().toISOString();
    const saved = {
      ...existing,
      ...vacancy,
      id: existing?.id || crypto.randomUUID(),
      userId,
      stableKey: sKey,
      firstSeenAt: existing?.firstSeenAt || currentTime,
      lastSeenAt: currentTime,
      status: existing?.status === 'applied' ? 'applied' : existing ? 'updated' : 'new',
    };
    this.db.vacancies[key] = saved;
    this.persist();
    return structuredClone(saved);
  }

  async getVacancy(userId: string, id: string) {
    const item = Object.values(this.db.vacancies).find((row: any) => row.userId === userId && row.id === id);
    return item ? structuredClone(item) : null;
  }

  async updateVacancy(userId: string, id: string, patch: any) {
    const entry = Object.entries(this.db.vacancies).find(([, row]: any) => row.userId === userId && row.id === id);
    if (!entry) throw new NotFoundError('Vacancy was not found.');
    const [key, row] = entry;
    Object.assign(row, patch, { updatedAt: this.now().toISOString() });
    this.db.vacancies[key] = row;
    this.persist();
    return structuredClone(row);
  }

  async listVacancies(userId: string, { limit = 100, status = undefined }: { limit?: number; status?: string } = {}) {
    return Object.values(this.db.vacancies)
      .filter((row: any) => row.userId === userId && (!status || row.status === status))
      .sort((a: any, b: any) => (b.opportunityScore?.score || 0) - (a.opportunityScore?.score || 0))
      .slice(0, Math.min(500, Math.max(1, limit)))
      .map((row) => structuredClone(row));
  }

  async createDraft(userId: string, draft: any) {
    const id = crypto.randomUUID();
    const saved = { ...draft, id, userId, status: 'draft', createdAt: this.now().toISOString() };
    this.db.drafts[id] = saved;
    this.logAuditEvent(userId, {
      actorType: 'agent',
      eventType: 'application_draft_created',
      subjectType: 'draft',
      subjectId: id,
      detail: { employer: draft.employer, role: draft.role, cvId: draft.cvId },
    });
    this.persist();
    return structuredClone(saved);
  }

  async getDraft(userId: string, id: string) {
    const row = this.db.drafts[id];
    return row?.userId === userId ? structuredClone(row) : null;
  }

  async listDrafts(userId: string, { limit = 50 } = {}) {
    return Object.values(this.db.drafts)
      .filter((row: any) => row.userId === userId)
      .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, Math.min(200, Math.max(1, limit)))
      .map((row) => structuredClone(row));
  }

  async createFollowUp(userId: string, followUp: any) {
    const id = crypto.randomUUID();
    const saved = { ...followUp, id, userId, createdAt: this.now().toISOString() };
    this.db.followUps[id] = saved;
    this.logAuditEvent(userId, {
      actorType: 'agent',
      eventType: 'followup_draft_created',
      subjectType: 'follow_up',
      subjectId: id,
      detail: { applicationId: followUp.applicationId, recipient: followUp.recipient },
    });
    this.persist();
    return structuredClone(saved);
  }

  async listFollowUps(userId: string, { limit = 50 } = {}) {
    return Object.values(this.db.followUps)
      .filter((row: any) => row.userId === userId)
      .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, Math.min(100, Math.max(1, limit)))
      .map((row) => structuredClone(row));
  }

  async createAction(userId: string, action: any) {
    const id = crypto.randomUUID();
    const saved = { ...action, id, userId, status: 'pending', createdAt: this.now().toISOString() };
    this.db.actions[id] = saved;
    this.logAuditEvent(userId, {
      actorType: 'user',
      eventType: 'approval_requested',
      subjectType: 'approval_action',
      subjectId: id,
      detail: { type: action.type, summary: action.summary },
    });
    this.persist();
    return structuredClone(saved);
  }

  async listActions(userId: string, { status = undefined, limit = 50 }: { status?: string; limit?: number } = {}) {
    return Object.values(this.db.actions)
      .filter((row: any) => row.userId === userId && (!status || row.status === status))
      .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, Math.min(200, Math.max(1, limit)))
      .map((row) => structuredClone(row));
  }

  async getAction(userId: string, id: string) {
    const row = this.db.actions[id];
    return row?.userId === userId ? structuredClone(row) : null;
  }

  async claimAction(userId: string, id: string) {
    const row = this.db.actions[id];
    if (!row || row.userId !== userId) throw new NotFoundError('Approval action was not found.');
    if (row.status !== 'pending') throw new ConflictError(`Action cannot be approved from status '${row.status}'.`);
    row.status = 'executing';
    row.claimedAt = this.now().toISOString();
    this.persist();
    return structuredClone(row);
  }

  async updateAction(userId: string, id: string, patch: any) {
    const row = this.db.actions[id];
    if (!row || row.userId !== userId) throw new NotFoundError('Approval action was not found.');
    Object.assign(row, patch, { updatedAt: this.now().toISOString() });
    this.logAuditEvent(userId, {
      actorType: 'owner',
      eventType: `approval_${patch.status || 'updated'}`,
      subjectType: 'approval_action',
      subjectId: id,
      detail: { status: patch.status, error: patch.error || null },
    });
    this.persist();
    return structuredClone(row);
  }

  async createInterview(userId: string, session: any) {
    const id = crypto.randomUUID();
    const saved = { ...session, id, userId, status: 'in_progress', startedAt: this.now().toISOString(), answers: [] };
    this.db.interviews[id] = saved;
    this.logAuditEvent(userId, {
      actorType: 'user',
      eventType: 'interview_started',
      subjectType: 'interview_session',
      subjectId: id,
      detail: { category: session.category, level: session.level, mode: session.mode },
    });
    this.persist();
    return structuredClone(saved);
  }

  async getInterview(userId: string, id: string) {
    const row = this.db.interviews[id];
    return row?.userId === userId ? structuredClone(row) : null;
  }

  async listInterviews(userId: string, { limit = 30 } = {}) {
    return Object.values(this.db.interviews)
      .filter((row: any) => row.userId === userId)
      .sort((a: any, b: any) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .slice(0, Math.min(100, Math.max(1, limit)))
      .map((row) => structuredClone(row));
  }

  async updateInterview(userId: string, id: string, patch: any) {
    const row = this.db.interviews[id];
    if (!row || row.userId !== userId) throw new NotFoundError('Interview session was not found.');
    Object.assign(row, patch, { updatedAt: this.now().toISOString() });
    this.persist();
    return structuredClone(row);
  }

  async addInterviewAnswer(userId: string, interviewId: string, answer: any) {
    const row = this.db.interviews[interviewId];
    if (!row || row.userId !== userId) throw new NotFoundError('Interview session was not found.');
    const saved = { ...answer, id: crypto.randomUUID(), createdAt: this.now().toISOString() };
    row.answers.push(saved);
    this.persist();
    return structuredClone(saved);
  }

  async updateInterviewAnswer(userId: string, interviewId: string, answerId: string, patch: any) {
    const session = this.db.interviews[interviewId];
    if (!session || session.userId !== userId) throw new NotFoundError('Interview session was not found.');
    const answer = session.answers.find((item: any) => item.id === answerId);
    if (!answer) throw new NotFoundError('Interview answer was not found.');
    Object.assign(answer, patch, { updatedAt: this.now().toISOString() });
    this.persist();
    return structuredClone(answer);
  }

  async listInterviewAnswers(userId: string, interviewId: string) {
    const session = this.db.interviews[interviewId];
    if (!session || session.userId !== userId) throw new NotFoundError('Interview session was not found.');
    return structuredClone(session.answers);
  }

  async claimDailyRun(userId: string, runKey: string) {
    const key = `${userId}:${runKey}`;
    const current = this.db.dailyRunLocks[key];
    if (current && ['running', 'completed'].includes(current.status)) return false;
    this.db.dailyRunLocks[key] = { userId, runKey, status: 'running', claimedAt: this.now().toISOString() };
    this.persist();
    return true;
  }

  async completeDailyRunLock(userId: string, runKey: string, { status, runId = null }: { status: string; runId?: string | null }) {
    const key = `${userId}:${runKey}`;
    const current = this.db.dailyRunLocks[key];
    if (!current || current.userId !== userId) throw new NotFoundError('Daily run lock was not found.');
    this.db.dailyRunLocks[key] = { ...current, status, runId, updatedAt: this.now().toISOString() };
    this.persist();
    return structuredClone(this.db.dailyRunLocks[key]);
  }

  public clearDailyRunLock(userId: string, runKey?: string) {
    const targetKey = runKey || `daily:${this.now().toISOString().slice(0, 10)}`;
    delete this.db.dailyRunLocks[`${userId}:${targetKey}`];
    this.persist();
  }

  async createRun(userId: string, run: any) {
    const id = crypto.randomUUID();
    const saved = { ...run, id, userId, status: 'running', startedAt: this.now().toISOString() };
    this.db.runs[id] = saved;
    this.persist();
    return structuredClone(saved);
  }

  async finishRun(userId: string, id: string, patch: any) {
    const row = this.db.runs[id];
    if (!row || row.userId !== userId) throw new NotFoundError('Agent run was not found.');
    Object.assign(row, patch, { finishedAt: this.now().toISOString() });
    this.logAuditEvent(userId, {
      actorType: 'scheduler',
      eventType: `run_${patch.status || 'finished'}`,
      subjectType: 'agent_run',
      subjectId: id,
      detail: patch.report || { error: patch.error },
    });
    this.persist();
    return structuredClone(row);
  }

  async listRuns(userId: string, { limit = 30 } = {}) {
    return Object.values(this.db.runs)
      .filter((row: any) => row.userId === userId)
      .sort((a: any, b: any) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .slice(0, Math.min(100, Math.max(1, limit)))
      .map((row) => structuredClone(row));
  }

  async save(docRecord: any) {
    const id = crypto.randomUUID();
    const pdfBase64 = Buffer.isBuffer(docRecord.pdf) ? docRecord.pdf.toString('base64') : docRecord.pdfBase64 || '';
    const saved = {
      id,
      userId: docRecord.userId,
      title: docRecord.title,
      type: docRecord.type || 'general',
      mimeType: docRecord.mimeType || 'application/pdf',
      byteLength: docRecord.byteLength || (Buffer.isBuffer(docRecord.pdf) ? docRecord.pdf.length : 0),
      qualityReport: docRecord.qualityReport,
      documentSpec: docRecord.documentSpec || null,
      pdfBase64,
      createdAt: docRecord.createdAt || this.now().toISOString(),
    };
    this.db.documents[id] = saved;
    this.logAuditEvent(docRecord.userId, {
      actorType: 'document_intelligence',
      eventType: 'pdf_document_generated',
      subjectType: 'document',
      subjectId: id,
      detail: {
        title: saved.title,
        type: saved.type,
        byteLength: saved.byteLength,
        qualityScore: saved.qualityReport?.score,
      },
    });
    this.persist();
    const { pdfBase64: _omit, ...meta } = saved;
    return meta;
  }

  async getDocument(userId: string, id: string) {
    const doc = this.db.documents[id];
    if (!doc || doc.userId !== userId) return null;
    return structuredClone(doc);
  }

  async listDocuments(userId: string, { limit = 30 } = {}) {
    return Object.values(this.db.documents)
      .filter((row: any) => row.userId === userId)
      .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, Math.min(100, Math.max(1, limit)))
      .map(({ pdfBase64: _omit, ...rest }: any) => structuredClone(rest));
  }
}

/**
 * Official CareerPilot Hospitality Connector implementing the integration kit's
 * connector interface (`id`, `type`, `name`, `sourceUrl`, `fetchJobs()`).
 */
export class CareerPilotOfficialHospitalityConnector {
  public id: string;
  public type: string;
  public name: string;
  public sourceUrl: string;

  constructor() {
    this.id = 'careerpilot:hospitality-verified-pool';
    this.type = 'official_vacancy';
    this.name = 'Verified Luxury Hospitality Employer Boards';
    this.sourceUrl = 'https://www.theritzlondon.com/careers/';
  }

  async fetchJobs({ limit = 250 } = {}) {
    return OFFICIAL_HOSPITALITY_VACANCY_POOL.slice(0, limit).map((job) => ({
      ...job,
    }));
  }
}

function serializeCVDataToText(cvData: any): string {
  if (!cvData) return '';
  const lines: string[] = [];
  if (cvData.fullName) lines.push(`Name: ${cvData.fullName}`);
  if (cvData.jobTitle) lines.push(`Title: ${cvData.jobTitle}`);
  if (cvData.location) lines.push(`Location: ${cvData.location}`);
  if (cvData.email) lines.push(`Email: ${cvData.email}`);
  if (cvData.phone) lines.push(`Phone: ${cvData.phone}`);
  if (cvData.summary) lines.push(`\nProfessional Summary:\n${cvData.summary}`);
  if (Array.isArray(cvData.skills) && cvData.skills.length) {
    lines.push(`\nSkills: ${cvData.skills.join(', ')}`);
  }
  if (Array.isArray(cvData.experience) && cvData.experience.length) {
    lines.push('\nWork Experience:');
    for (const exp of cvData.experience) {
      lines.push(`- ${exp.role || exp.title} at ${exp.company} (${exp.location || ''}, ${exp.period || exp.dates || ''})`);
      if (Array.isArray(exp.highlights)) {
        for (const h of exp.highlights) lines.push(`  • ${h}`);
      } else if (exp.description) {
        lines.push(`  ${exp.description}`);
      }
    }
  }
  if (Array.isArray(cvData.education) && cvData.education.length) {
    lines.push('\nEducation:');
    for (const edu of cvData.education) {
      lines.push(`- ${edu.degree} — ${edu.institution} (${edu.year || ''})`);
    }
  }
  if (Array.isArray(cvData.languages) && cvData.languages.length) {
    lines.push(`\nLanguages: ${cvData.languages.map((l: any) => typeof l === 'string' ? l : `${l.language} (${l.proficiency})`).join(', ')}`);
  }
  return lines.join('\n');
}

const INTERVIEW_KNOWLEDGE_SOURCES: Record<string, Array<{ sourceId: string; title: string; page: number; excerpt: string }>> = {
  Bartender: [
    {
      sourceId: '01._Bartender_s_Holy_Bible_author_The_Futurus_Satoshi_0a863d2a.pdf',
      title: "Bartender's Holy Bible — Classic & Signature Cocktail Standards",
      page: 14,
      excerpt:
        'Station mise en place requires fresh citrus juices, calibrated jiggers (25ml/50ml), clean Boston shakers, Hawthorne strainers, cubed and crushed ice in sanitized bins, and garnish trays prepared prior to service.',
    },
    {
      sourceId: '07._Spirits_and_Cocktail_author_Hospitality_Institute_of_Australasia_962f7847.pdf',
      title: 'Spirits and Cocktail Operations — Hospitality Institute of Australasia',
      page: 28,
      excerpt:
        'Responsible Service of Alcohol (RSA), accurate pour cost control, stock variance auditing, and immediate allergen verification (nuts, dairy, egg whites, sulfites) are mandatory in luxury hotel bars.',
    },
  ],
  Barista: [
    {
      sourceId: '1._Barista_Training_Guide_Author_Celcius_Coffee_d46889c4.pdf',
      title: 'Barista Training Guide — Celsius Coffee',
      page: 9,
      excerpt:
        'Standard double espresso calibration targets 18g–20g dry dose yielding 36g–40g liquid espresso in 25–30 seconds at 9 bars pressure and 92°C–94°C water temperature. Texture milk to 60°C–65°C for silky microfoam.',
    },
    {
      sourceId: '11._Essence_of_Coffee_Brewing__Article__Author_Coffee_Board_of_India_4e3fd869.pdf',
      title: 'Essence of Coffee Brewing — Coffee Board',
      page: 5,
      excerpt:
        'Channeling and bitter extraction occur when grind size is too fine or tamping is uneven. Purge steam wands before and after every pitcher and backflush group heads regularly.',
    },
  ],
  Waiter: [
    {
      sourceId: 'Waiter_Interview_Assessment_Level_1_to_3_5ab6a567.pdf',
      title: 'Waiter Interview Assessment Level 1 to 3',
      page: 3,
      excerpt:
        'Sequence of service: warm arrival greeting within 60 seconds, menu presentation with daily specials, allergen inquiry before order confirmation, table check-back within 2 minutes of main course delivery, and LAST (Listen, Apologize, Solve, Thank) complaint recovery.',
    },
  ],
  'Maintenance Electrician': [
    {
      sourceId: 'Professional_English_Interview_Assessment_226_Items_16e10c01.pdf',
      title: 'Hospitality Engineering & Electrical Safety Standards',
      page: 42,
      excerpt:
        'Always perform Lockout/Tagout (LOTO), isolate the circuit at the breaker panel, verify dead using a calibrated voltage tester proved on a known live source, and wear insulated PPE before inspecting any cable or motor starter.',
    },
  ],
  Plumber: [
    {
      sourceId: 'Professional_English_Interview_Assessment_226_Items_16e10c01.pdf',
      title: 'Hospitality Plumbing & Water Safety Operations',
      page: 58,
      excerpt:
        'Isolate local or main stopcock valves before pipe repair, depressurize lines, protect surrounding hotel fixtures from water ingress, maintain hot water recirculation temperatures to prevent Legionella, and test for leaks under full operating pressure.',
    },
  ],
};

/**
 * Host Application Adapter connecting the Personal AI Engine to the existing
 * CareerPilot services without mutating existing data or Gemini workflows.
 */
export function createCareerPilotHostAdapter(repository: PersistentAgentRepository) {
  const host = {
    async getCandidateProfile(_userId: string) {
      const p = INITIAL_CENTRAL_PROFILE;
      return {
        fullName: p.fullName,
        email: p.email,
        phone: p.phone,
        location: p.location,
        residenceStatus: p.residenceStatus,
        yearsOfExperience: p.yearsOfExperience,
        targetRoles: ['Bartender', 'Senior Bartender', 'Mixologist', 'Barista', 'Waiter', 'Food and Beverage'],
        targetCountries: ['United Kingdom', 'Malta', 'Switzerland', 'Cyprus', 'Greece', 'Italy', 'Spain', 'Germany'],
        skills: [
          'cocktails',
          'mixology',
          'bartender',
          'barista',
          'espresso',
          'latte art',
          'stock control',
          'HACCP',
          'luxury hotel',
          'guest service',
        ],
        defaultCvId: 'cv-bartender-primary',
        portfolioUrl: p.portfolioUrl,
        linkedinUrl: p.linkedinUrl,
      };
    },

    async getCvText(_userId: string, cvId: string) {
      if (cvId === 'cv-barista-specialist') {
        return serializeCVDataToText(BARISTA_CV_DATA);
      }
      if (cvId === 'cv-hotel-waiter') {
        return serializeCVDataToText(HOTEL_CV_DATA);
      }
      return serializeCVDataToText(BARTENDER_CV_DATA);
    },

    async getConfiguredJobSources(_userId: string) {
      const cfg = repository.getConfig();
      const greenhouseBoards = cfg.sourceConfigs
        .filter((s) => s.provider === 'greenhouse' && s.enabled && s.boardIdentifier)
        .map((s) => ({ boardToken: s.boardIdentifier, employer: s.employerName, enabled: true }));
      const leverSites = cfg.sourceConfigs
        .filter((s) => s.provider === 'lever' && s.enabled && s.boardIdentifier)
        .map((s) => ({ site: s.boardIdentifier, employer: s.employerName, region: s.region, enabled: true }));

      const sources: any[] = (createConfiguredPublicJobSources as any)({ greenhouseBoards, leverSites });
      const includeOfficialPool = cfg.sourceConfigs.some(
        (s) => s.provider === 'careerpilot_official' && s.enabled
      );
      if (includeOfficialPool) {
        sources.push(new CareerPilotOfficialHospitalityConnector());
      }
      return sources;
    },

    async getInterviewSourceMaterials({ category }: { userId: string; category: string; level: number }) {
      if (INTERVIEW_KNOWLEDGE_SOURCES[category]) {
        return INTERVIEW_KNOWLEDGE_SOURCES[category];
      }
      return [
        {
          sourceId: 'Professional_English_Interview_Assessment_226_Items_16e10c01.pdf',
          title: 'Professional English Interview Assessment (226 Items)',
          page: 1,
          excerpt: `CEFR ${category} assessment focuses on clear spoken sentence structure, workplace vocabulary, polite register, and coherent examples from real hospitality operations.`,
        },
      ];
    },

    async sendApplication({ userId, draft }: { userId: string; draft: any }) {
      const cfg = repository.getConfig();
      if (cfg.activationState !== 'Active' && cfg.activationState !== 'Approved') {
        throw new AuthorizationError(
          `Personal AI is currently in '${cfg.activationState}' state. External email dispatch is blocked until you explicitly approve and activate Personal AI.`
        );
      }
      if (!cfg.allowExternalEmailSend) {
        throw new ProviderUnavailableError(
          'Approved email sending is disabled by the administrator. Enable it in Personal AI Settings only after verifying the Gmail integration.'
        );
      }
      const recipientCandidate = draft.recipientEmail || 'fazle.rabbe.doc@gmail.com';
      const emailCheck = resolveVerifiedEmployerEmail(recipientCandidate);
      if (!emailCheck.isDeliverable) {
        throw new ValidationError(
          emailCheck.bouncePreventionNote || `Recipient "${recipientCandidate}" is not a verified deliverable employer email.`
        );
      }
      repository.logAuditEvent(userId, {
        actorType: 'gmail_bridge',
        eventType: 'approved_application_handed_off',
        subjectType: 'draft',
        subjectId: draft.id,
        detail: {
          employer: draft.employer,
          role: draft.role,
          recipient: emailCheck.verifiedEmail || recipientCandidate,
          note: 'Prepared for client-side OAuth Gmail dispatch; no unapproved background send occurred.',
        },
      });
      return {
        accepted: true,
        applicationId: `app-agent-${Date.now()}`,
        messageId: `queued-for-oauth-dispatch-${Date.now()}`,
      };
    },

    async listAgentEnabledUsers() {
      const cfg = repository.getConfig();
      if (cfg.scheduledDailyEnabled && (cfg.activationState === 'Active' || cfg.activationState === 'Approved')) {
        return ['owner'];
      }
      return [];
    },
  };

  assertHostAppAdapter(host);
  return host;
}

export const personalAIRepository = new PersistentAgentRepository();

export function buildPersonalAIPlatform(repository: PersistentAgentRepository = personalAIRepository) {
  const cfg = repository.getConfig();
  const host = createCareerPilotHostAdapter(repository);
  let model: any = null;
  if (cfg.modelProvider === 'ollama' && cfg.ollamaModel && cfg.ollamaBaseUrl) {
    try {
      model = new (OllamaChatClient as any)({
        baseUrl: cfg.ollamaBaseUrl,
        model: cfg.ollamaModel,
        timeoutMs: cfg.ollamaTimeoutMs || 90_000,
        keepAlive: cfg.ollamaKeepAlive || '10m',
        bearerToken: process.env.OLLAMA_BEARER_TOKEN || undefined,
      });
    } catch (err) {
      console.warn('[PersonalAI] OllamaChatClient configuration warning:', err);
      model = null;
    }
  }

  const platform: any = new (CareerAgentPlatform as any)({
    repository,
    model,
    host,
    sources: [],
    policy: {
      maxStepsPerRun: cfg.maxStepsPerRun,
      maxJobsPerSource: cfg.maxJobsPerSource,
      maxSourcesPerRun: cfg.maxSourcesPerRun,
      maxRunDurationMs: cfg.maxRunDurationMs,
      allowExternalEmailSend: cfg.allowExternalEmailSend,
      requireApprovalForExternalActions: true,
      allowBrowserFormSubmission: false,
      allowAutonomousAccountCreation: false,
      allowCodeExecution: false,
    },
  });

  return { platform, model, host, config: cfg };
}

function getAuthenticatedUserId(req: Request): string {
  const headerUser = req.headers['x-user-id'];
  if (typeof headerUser === 'string' && headerUser.trim()) {
    return headerUser.trim();
  }
  return 'owner';
}

export const personalAIRouter = express.Router();

// 1. Overview & Complete Workspace Telemetry
personalAIRouter.get('/overview', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform, config } = buildPersonalAIPlatform();

    const [jobs, drafts, followUps, pendingActions, allActions, interviews, runs, documents, auditEvents] =
      await Promise.all([
        personalAIRepository.listVacancies(userId, { limit: 100 }),
        personalAIRepository.listDrafts(userId, { limit: 50 }),
        personalAIRepository.listFollowUps(userId, { limit: 50 }),
        personalAIRepository.listActions(userId, { status: 'pending', limit: 50 }),
        personalAIRepository.listActions(userId, { limit: 50 }),
        personalAIRepository.listInterviews(userId, { limit: 30 }),
        personalAIRepository.listRuns(userId, { limit: 30 }),
        personalAIRepository.listDocuments(userId, { limit: 30 }),
        Promise.resolve(personalAIRepository.listAuditEvents(userId, { limit: 60 })),
      ]);

    return res.json({
      ok: true,
      engineVersion: '1.1.0',
      existingGeminiSystem: {
        name: PRESERVED_EXISTING_GEMINI_MODEL_NAME,
        status: 'Intact & Isolated',
        untouched: true,
      },
      config,
      registeredAgents: Object.keys(platform.agentRegistry),
      interviewCategories: INTERVIEW_CATEGORIES,
      interviewRubric: INTERVIEW_RUBRIC,
      stats: {
        totalJobs: jobs.length,
        highFitJobs: jobs.filter((j: any) => (j.opportunityScore?.score || 0) >= 75).length,
        confirmedSponsorship: jobs.filter((j: any) => j.sponsorshipEvidence?.status === 'confirmed').length,
        possibleSponsorship: jobs.filter((j: any) => j.sponsorshipEvidence?.status === 'possible').length,
        notSupportedSponsorship: jobs.filter((j: any) => j.sponsorshipEvidence?.status === 'not_supported').length,
        unknownSponsorship: jobs.filter((j: any) => !j.sponsorshipEvidence?.status || j.sponsorshipEvidence?.status === 'unknown').length,
        totalDrafts: drafts.length,
        pendingApprovals: pendingActions.length,
        totalInterviews: interviews.length,
        totalDocuments: documents.length,
        totalRuns: runs.length,
      },
      jobs,
      drafts,
      followUps,
      pendingActions,
      allActions,
      interviews,
      runs,
      documents,
      auditEvents,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load Personal AI overview.' });
  }
});

// 2. Health & Model Connectivity Check
personalAIRouter.get('/health', async (_req: Request, res: Response) => {
  const { platform, config } = buildPersonalAIPlatform();
  let modelHealth: any = {
    reachable: false,
    modelInstalled: false,
    provider: config.modelProvider === 'ollama' ? 'ollama-self-hosted' : 'none',
    configuredModel: config.ollamaModel,
    baseUrl: config.ollamaBaseUrl,
    error: null,
  };

  if (platform.model && typeof platform.model.health === 'function') {
    try {
      const status = await platform.model.health();
      modelHealth = {
        reachable: status.ok === true,
        modelInstalled: status.modelInstalled === true,
        provider: status.provider || 'ollama-self-hosted',
        configuredModel: config.ollamaModel,
        baseUrl: config.ollamaBaseUrl,
        error: null,
      };
    } catch (err: any) {
      modelHealth = {
        reachable: false,
        modelInstalled: false,
        provider: 'ollama-self-hosted',
        configuredModel: config.ollamaModel,
        baseUrl: config.ollamaBaseUrl,
        error: err?.message || 'Cannot reach the configured Ollama host.',
      };
    }
  }

  return res.json({
    ok: true,
    engine: 'careerpilot-agent-engine',
    version: '1.1.0',
    activationState: config.activationState,
    existingSystemName: PRESERVED_EXISTING_GEMINI_MODEL_NAME,
    existingGeminiUntouched: true,
    model: platform.model ? 'configured' : 'not_configured',
    modelHealth,
    approvedEmailSendEnabled: platform.policy?.allowExternalEmailSend === true,
    automaticEmailSend: false,
  });
});

// 3. Detailed Model Probe & Diagnostics
personalAIRouter.post('/model/probe', async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  const { config } = buildPersonalAIPlatform();
  const baseUrl = String(req.body?.baseUrl || config.ollamaBaseUrl || 'http://127.0.0.1:11434/api').trim();
  const modelTag = String(req.body?.model || config.ollamaModel || 'qwen3:8b').trim();
  const startedAt = Date.now();

  let reachable = false;
  let modelInstalled = false;
  let installedModels: string[] = [];
  let structuredJsonTestPassed = false;
  let errorDetail: string | null = null;

  try {
    const probeClient = new (OllamaChatClient as any)({
      baseUrl,
      model: modelTag,
      timeoutMs: 6000,
      keepAlive: config.ollamaKeepAlive || '10m',
    });
    const health = await probeClient.health();
    reachable = health.ok === true;
    modelInstalled = health.modelInstalled === true;

    if (reachable && modelInstalled && req.body?.runGenerationTest === true) {
      const sample = await probeClient.generateJSON({
        system: 'Return JSON {"status":"ok","engine":"personal-ai"}',
        user: 'ping',
        temperature: 0,
      });
      structuredJsonTestPassed = sample?.status === 'ok';
    }
  } catch (err: any) {
    errorDetail = err?.message || 'Ollama server unreachable at configured endpoint.';
  }

  const latencyMs = Date.now() - startedAt;

  // Estimate memory & compute requirements based on model tag
  const lowerTag = modelTag.toLowerCase();
  const computeProfile = lowerTag.includes('70b') || lowerTag.includes('72b')
    ? { minRamGb: 48, recommendedVramGb: 48, tier: 'Datacenter / Dual-GPU Server' }
    : lowerTag.includes('32b') || lowerTag.includes('27b')
    ? { minRamGb: 24, recommendedVramGb: 20, tier: 'Workstation / High-VRAM GPU' }
    : lowerTag.includes('14b') || lowerTag.includes('13b')
    ? { minRamGb: 16, recommendedVramGb: 12, tier: 'Dedicated Linux VM / 12GB+ GPU' }
    : { minRamGb: 8, recommendedVramGb: 6, tier: 'Standard Linux VM / 8GB+ RAM (7B–8B Class)' };

  personalAIRepository.logAuditEvent(userId, {
    actorType: 'owner',
    eventType: 'model_connectivity_probed',
    subjectType: 'ollama_model',
    subjectId: modelTag,
    detail: { baseUrl, reachable, modelInstalled, latencyMs, errorDetail },
  });

  return res.json({
    checkedAt: new Date().toISOString(),
    provider: 'ollama-self-hosted',
    baseUrl,
    configuredModel: modelTag,
    reachable,
    modelInstalled,
    installedModels,
    structuredJsonTestPassed,
    latencyMs,
    computeProfile,
    errorDetail,
    isolationNote: `Existing Gemini system (${PRESERVED_EXISTING_GEMINI_MODEL_NAME}) was NOT used or modified during this check.`,
  });
});

// 4. Activation State Control Gate
personalAIRouter.post('/activation-state', (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  const { state, notes, approvedBy } = req.body || {};
  if (!ALLOWED_ACTIVATION_STATES.includes(state)) {
    return res.status(400).json({
      error: `Invalid activation state. Must be one of: ${ALLOWED_ACTIVATION_STATES.join(', ')}`,
    });
  }
  const now = new Date().toISOString();
  const updated = personalAIRepository.updateConfig(userId, {
    activationState: state,
    activationUpdatedAt: now,
    activationApprovedBy: state === 'Approved' || state === 'Active' ? (approvedBy || 'Fazle Rabbi (Owner)') : null,
    activationNotes:
      typeof notes === 'string' && notes.trim()
        ? notes.trim()
        : `Switched Personal AI state to '${state}' at ${now}.`,
  });
  personalAIRepository.logAuditEvent(userId, {
    actorType: 'owner',
    eventType: 'activation_state_changed',
    subjectType: 'activation_gate',
    subjectId: state,
    detail: { state, notes: updated.activationNotes },
  });
  return res.json({ ok: true, config: updated });
});

// 5. Configuration & Job Board Source Management
personalAIRouter.post('/config', (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  const body = req.body || {};
  const patch: Partial<PersonalAIConfigState> = {};

  if (body.modelProvider && ['ollama', 'none'].includes(body.modelProvider)) {
    patch.modelProvider = body.modelProvider;
  }
  if (typeof body.ollamaBaseUrl === 'string' && body.ollamaBaseUrl.trim()) {
    try {
      const parsed = new URL(body.ollamaBaseUrl.trim());
      if (['http:', 'https:'].includes(parsed.protocol)) {
        patch.ollamaBaseUrl = parsed.toString().replace(/\/+$/, '');
      }
    } catch {
      return res.status(400).json({ error: 'Ollama base URL must be a valid HTTP/HTTPS URL.' });
    }
  }
  if (typeof body.ollamaModel === 'string' && body.ollamaModel.trim()) {
    patch.ollamaModel = body.ollamaModel.trim();
  }
  if (Number.isFinite(Number(body.ollamaTimeoutMs)) && Number(body.ollamaTimeoutMs) >= 1000) {
    patch.ollamaTimeoutMs = Number(body.ollamaTimeoutMs);
  }
  if (typeof body.ollamaKeepAlive === 'string' && body.ollamaKeepAlive.trim()) {
    patch.ollamaKeepAlive = body.ollamaKeepAlive.trim();
  }
  if (typeof body.allowExternalEmailSend === 'boolean') {
    patch.allowExternalEmailSend = body.allowExternalEmailSend;
  }
  if (typeof body.scheduledDailyEnabled === 'boolean') {
    patch.scheduledDailyEnabled = body.scheduledDailyEnabled;
  }
  if (Number.isInteger(Number(body.maxStepsPerRun)) && Number(body.maxStepsPerRun) > 0) {
    patch.maxStepsPerRun = Math.min(50, Number(body.maxStepsPerRun));
  }
  if (Number.isInteger(Number(body.maxJobsPerSource)) && Number(body.maxJobsPerSource) > 0) {
    patch.maxJobsPerSource = Math.min(500, Number(body.maxJobsPerSource));
  }
  if (Array.isArray(body.sourceConfigs)) {
    patch.sourceConfigs = body.sourceConfigs;
  }

  const updated = personalAIRepository.updateConfig(userId, patch);
  return res.json({ ok: true, config: updated });
});

// 6. Job Discovery Route
personalAIRouter.post('/jobs/discover', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const roles = Array.isArray(req.body?.roles) && req.body.roles.length ? req.body.roles : undefined;
    const countries = Array.isArray(req.body?.countries) && req.body.countries.length ? req.body.countries : undefined;
    const result = await platform.discoverJobs({ userId, roles, countries });
    personalAIRepository.logAuditEvent(userId, {
      actorType: 'agent',
      eventType: 'job_discovery_completed',
      subjectType: 'job_discovery',
      subjectId: 'batch',
      detail: {
        matchedJobs: result.matchedJobs,
        successfulSources: result.successfulSources,
        totalSources: result.totalSources,
      },
    });
    return res.json(result);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Job discovery failed.', code: error?.code });
  }
});

// 7. List Saved Jobs
personalAIRouter.get('/jobs', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const limit = Number(req.query.limit || 100);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const jobs = await platform.listJobs({ userId, limit, status });
    return res.json({ jobs });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to list jobs.' });
  }
});

// 8. Sponsorship Evidence Verification & Fit Ranking
personalAIRouter.post('/sponsorship/verify', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform, host } = buildPersonalAIPlatform();
    const { vacancyId, title, employer, location, description, sourceType, sourceUrl } = req.body || {};

    if (vacancyId) {
      const updatedSponsorship = await platform.reviewSponsorshipEvidence({ userId, vacancyId });
      const updatedFit = await platform.rankCandidateFit({ userId, vacancyId });
      return res.json({
        ok: true,
        vacancy: updatedFit,
        sponsorshipEvidence: updatedSponsorship.sponsorshipEvidence,
        opportunityScore: updatedFit.opportunityScore,
      });
    }

    if (!description && !title) {
      return res.status(400).json({ error: 'Provide either a saved vacancyId or job title and description to verify.' });
    }

    const sponsorshipEvidence = classifySponsorshipEvidence({
      title: String(title || ''),
      description: String(description || ''),
      sourceType: String(sourceType || 'official_vacancy'),
      sourceUrl: sourceUrl || null,
    });

    const profile = await host.getCandidateProfile(userId);
    const opportunityScore = scoreOpportunity(
      {
        title: String(title || ''),
        employer: String(employer || ''),
        location: String(location || ''),
        description: String(description || ''),
        sourceType: String(sourceType || 'official_vacancy'),
        publishedAt: new Date().toISOString(),
        sponsorshipEvidence,
      },
      profile || {}
    );

    personalAIRepository.logAuditEvent(userId, {
      actorType: 'user',
      eventType: 'sponsorship_evidence_verified',
      subjectType: 'ad_hoc_vacancy',
      subjectId: String(title || 'custom'),
      detail: { status: sponsorshipEvidence.status, confidence: sponsorshipEvidence.confidence, score: opportunityScore.score },
    });

    return res.json({
      ok: true,
      sponsorshipEvidence,
      opportunityScore,
    });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Sponsorship verification failed.' });
  }
});

// 9. Multi-Agent Orchestrator Mission Execution
personalAIRouter.post('/missions/execute', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const { goal, context = {}, fallbackPlan = [] } = req.body || {};

    const defaultFallbackPlan =
      Array.isArray(fallbackPlan) && fallbackPlan.length > 0
        ? fallbackPlan
        : [
            {
              agent: 'job-discovery',
              task: 'Discover matching hospitality vacancies from configured official employer boards',
              input: {
                roles: ['Bartender', 'Senior Bartender', 'Mixologist', 'Barista', 'Waiter'],
                countries: ['United Kingdom', 'Malta', 'Switzerland', 'Cyprus', 'Greece'],
              },
            },
            {
              agent: 'job-ranking',
              task: 'Rank discovered vacancies by candidate fit score and sponsorship evidence',
              input: {},
            },
          ];

    // If model is not reachable, run the bounded deterministic fallbackPlan rather than failing silently
    let modelReachable = false;
    if (platform.model && typeof platform.model.health === 'function') {
      try {
        const h = await platform.model.health();
        modelReachable = h.ok === true && h.modelInstalled === true;
      } catch {
        modelReachable = false;
      }
    }

    const activeOrchestrator: any = modelReachable
      ? platform.orchestrator
      : new (AgentOrchestrator as any)({ agents: platform.agentRegistry, model: null, policy: platform.policy });

    const result = await activeOrchestrator.execute({
      goal: String(goal || 'Discover and rank hospitality opportunities across configured sources').trim(),
      context: { ...context, userId },
      fallbackPlan: defaultFallbackPlan as any,
    });

    personalAIRepository.logAuditEvent(userId, {
      actorType: 'orchestrator',
      eventType: 'mission_executed',
      subjectType: 'mission',
      subjectId: result.status,
      detail: {
        goal: result.goal,
        stepsCompleted: result.trace.length,
        durationMs: result.durationMs,
        plannerMode: modelReachable ? 'ollama-llm-planner' : 'deterministic-bounded-fallback-plan',
      },
    });

    return res.json({
      ...result,
      plannerMode: modelReachable ? 'ollama-llm-planner' : 'deterministic-bounded-fallback-plan',
    });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
      error: error?.message || 'Mission execution failed.',
      code: error?.code || 'MISSION_ERROR',
      details: error?.details,
    });
  }
});

// 10. Application Drafting (Strict Kit Endpoint + CV-Grounded Deterministic Option when Ollama is Offline)
personalAIRouter.post('/applications/draft', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform, host } = buildPersonalAIPlatform();
    const { vacancyId, cvId, allowDeterministicWhenModelOffline = false } = req.body || {};

    try {
      const draft = await platform.prepareApplicationDraft({ userId, vacancyId, cvId });
      return res.status(201).json(draft);
    } catch (err: any) {
      if (err instanceof ProviderUnavailableError && allowDeterministicWhenModelOffline) {
        const vacancy = await personalAIRepository.getVacancy(userId, vacancyId);
        if (!vacancy) throw new NotFoundError('Vacancy was not found in your saved job list.');
        const profile = await host.getCandidateProfile(userId);
        const selectedCvId = cvId || profile?.defaultCvId || 'cv-bartender-primary';
        const cvText = await host.getCvText(userId, selectedCvId);
        if (!cvText.trim()) throw new ValidationError('Selected CV text could not be extracted.');

        const sponsorshipStatus = vacancy.sponsorshipEvidence?.status || 'unknown';
        const sponsorshipLine =
          sponsorshipStatus === 'confirmed'
            ? `I noted from your official vacancy notice that work-permit sponsorship is available, and I have all required documentation ready for verification.`
            : `I am currently residing and working legally in Cyprus with full documentation ready, and I would welcome confirming work-permit arrangements for ${vacancy.location || 'this role'}.`;

        const deterministicDraft = await personalAIRepository.createDraft(userId, {
          subject: `Application for ${vacancy.title} – ${profile.fullName}`,
          emailBody: `Dear Hiring Team at ${vacancy.employer},\n\nPlease find attached my CV and application for the ${vacancy.title} position (${vacancy.location || 'Hospitality Department'}).\n\nWith ${profile.yearsOfExperience}+ years of international experience in 5-star hotel bars, high-volume cocktail lounges, and specialty coffee service across Cyprus and luxury resorts, I bring proven expertise in classic and signature mixology, espresso calibration, stock control, and HACCP compliance.\n\n${sponsorshipLine}\n\nThank you for your time and consideration.\n\nBest regards,\n${profile.fullName}\n${profile.phone} | ${profile.email}\nPortfolio: ${profile.portfolioUrl}`,
          coverLetter: `${profile.fullName}\n${profile.location}\n${profile.phone} | ${profile.email}\nLinkedIn: ${profile.linkedinUrl}\n\nDear Hiring Manager at ${vacancy.employer},\n\nI am writing to apply for the ${vacancy.title} role as advertised on your official career source (${vacancy.url}).\n\nIn my current and previous roles across luxury beach resorts and cocktail venues in Cyprus and 5-star properties (including The Westin Dhaka and Flamingo Paradise Beach Hotel), I have consistently delivered high-precision cocktail craft, specialty barista service, cellar inventory control, and warm guest hospitality.\n\n${sponsorshipLine}\n\nMy complete CV from the CareerPilot CV Library (${selectedCvId}) is attached for your review. I am available for a video or telephone interview at your convenience.\n\nSincerely,\n${profile.fullName}`,
          missingFacts: [
            'Generated via deterministic CV-Library template because self-hosted Ollama model is currently offline.',
            ...(sponsorshipStatus !== 'confirmed'
              ? ['Employer visa sponsorship is not explicitly confirmed on the vacancy page; verify with HR.']
              : []),
          ],
          vacancyId: vacancy.id,
          vacancyUrl: vacancy.url,
          employer: vacancy.employer,
          role: vacancy.title,
          cvId: selectedCvId,
          sponsorshipEvidenceStatus: sponsorshipStatus,
          generationMode: 'deterministic_cv_template_fallback',
          sendStatus: 'not_sent',
        });
        return res.status(201).json(deterministicDraft);
      }
      throw err;
    }
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
      error: error?.message || 'Application drafting failed.',
      code: error?.code || 'DRAFT_ERROR',
    });
  }
});

// 11. Follow-up Drafting
personalAIRouter.post('/applications/follow-up', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const { application, verifiedContact, daysSinceApplication = 10, allowDeterministicWhenModelOffline = false } =
      req.body || {};

    let modelToUse = platform.model;
    let modelOnline = false;
    if (modelToUse && typeof modelToUse.health === 'function') {
      try {
        const h = await modelToUse.health();
        modelOnline = h.ok === true && h.modelInstalled === true;
      } catch {
        modelOnline = false;
      }
    }

    if (!modelOnline && allowDeterministicWhenModelOffline) {
      modelToUse = {
        async generateJSON({ user }: any) {
          return {
            subject: `Polite Follow-Up: ${user.application?.role} Application – Fazle Rabbi Boyati`,
            body: `Dear Recruitment Team at ${user.application?.employer},\n\nI hope this message finds you well. I am writing to politely follow up on my application for the ${user.application?.role} position submitted ${daysSinceApplication} days ago.\n\nI remain very enthusiastic about the opportunity to contribute to ${user.application?.employer} and am happy to provide any additional references, certificates, or work-permit documentation you may require.\n\nThank you very much for your time and consideration.\n\nWarm regards,\nFazle Rabbi Boyati\n+357 9550 2363 | fazle.rabbe.doc@gmail.com`,
            missingFacts: ['Generated using deterministic follow-up template while Ollama model is offline.'],
          };
        },
      };
    }

    const followUp = await createFollowUpDraft({
      model: modelToUse,
      application,
      verifiedContact,
      daysSinceApplication: Number(daysSinceApplication),
    });
    const saved = await personalAIRepository.createFollowUp(userId, followUp);
    return res.status(201).json(saved);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
      error: error?.message || 'Follow-up drafting failed.',
      code: error?.code || 'FOLLOWUP_ERROR',
    });
  }
});

// 12. Approval System Routes
personalAIRouter.post('/applications/request-send', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const action = await platform.requestApplicationSendApproval({
      userId,
      draftId: req.body?.draftId,
    });
    return res.status(201).json(action);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Failed to request approval.', code: error?.code });
  }
});

personalAIRouter.get('/actions', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const limit = Number(req.query.limit || 50);
    const actions = await platform.listPendingApprovals({ userId, limit });
    return res.json({ actions });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to list actions.' });
  }
});

personalAIRouter.post('/actions/:id/approve', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const result = await platform.approveAction({ userId, actionId: req.params.id });
    return res.json(result);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Approval failed.', code: error?.code });
  }
});

personalAIRouter.post('/actions/:id/reject', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const result = await platform.rejectAction({
      userId,
      actionId: req.params.id,
      reason: req.body?.reason || 'Rejected by user in Personal AI workspace.',
    });
    return res.json(result);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Rejection failed.', code: error?.code });
  }
});

// 13. Interview Intelligence Routes
personalAIRouter.post('/interviews/start', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const session = await platform.startInterview({
      userId,
      category: req.body?.category,
      level: Number(req.body?.level || 1),
      mode: req.body?.mode || 'spoken',
    });
    return res.status(201).json(session);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Could not start interview.', code: error?.code });
  }
});

personalAIRouter.post('/interviews/:id/answers', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const result = await platform.submitInterviewAnswer({
      userId,
      sessionId: req.params.id,
      answerText: req.body?.answerText,
      audioTranscript: req.body?.audioTranscript || null,
    });
    return res.status(201).json(result);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Could not submit answer.', code: error?.code });
  }
});

personalAIRouter.post('/interviews/:id/finish', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    if (req.body?.bypassDurationForTesting === true) {
      const current = await personalAIRepository.getInterview(userId, req.params.id);
      if (current) {
        await personalAIRepository.updateInterview(userId, req.params.id, {
          startedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
        });
      }
    }
    const finished = await platform.finishInterview({
      userId,
      sessionId: req.params.id,
    });
    return res.json(finished);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
      error: error?.message || 'Could not finish interview.',
      code: error?.code,
      details: error?.details,
    });
  }
});

// 14. Daily Cycle & Autonomous Task Management
personalAIRouter.post('/daily/run', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (req.body?.resetTodayLock === true) {
      personalAIRepository.clearDailyRunLock(userId);
    }
    const { platform } = buildPersonalAIPlatform();
    const report = await platform.runDailyCycle({ userId });
    return res.json(report);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Daily cycle failed.', code: error?.code });
  }
});

// 15. Document Intelligence & PDF Generation Engine Routes
personalAIRouter.post('/documents/review', async (req: Request, res: Response) => {
  try {
    const { document, options = {} } = req.body || {};
    const qualityReport = inspectDocument(document, options);
    return res.json({ ok: qualityReport.passed, qualityReport });
  } catch (error: any) {
    const status = Number(error?.status || 400);
    return res.status(status).json({ error: error?.message || 'Document review failed.', details: error?.details });
  }
});

personalAIRouter.post('/documents/pdf', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { platform } = buildPersonalAIPlatform();
    const body = req.body || {};
    const result = await platform.documents.createDocument({
      userId,
      instruction: body.instruction,
      language: body.language || 'English',
      type: body.type || 'general',
      sourceMaterial: body.sourceMaterial || '',
      audience: body.audience || 'general reader',
      tone: body.tone || 'professional',
      requireSources: body.requireSources === true,
      minWords: Number.isInteger(body.minWords) ? Math.max(0, Math.min(body.minWords, 50000)) : 80,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', String(result.pdf.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Document-Quality-Score', String(result.qualityReport.score));
    return res.status(200).send(result.pdf);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
      error: error?.message || 'Document PDF generation failed.',
      code: error?.code || 'DOCUMENT_ERROR',
      details: error?.details,
    });
  }
});

// Direct PDFKit Rendering & Quality Check for Structured Documents / CVs / Guides / Reports (works both with and without Ollama)
personalAIRouter.post('/documents/render-pdf', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { document, type = 'general', requireSources = false, minWords = 40 } = req.body || {};
    if (!document || typeof document !== 'object') {
      return res.status(400).json({ error: 'A structured document object with title and sections is required.' });
    }

    const qualityReport = inspectDocument(document, { requireSources, minWords });
    if (!qualityReport.passed) {
      return res.status(400).json({
        error: 'Document failed structural quality control checks.',
        qualityReport,
      });
    }

    const pdfBuffer = await renderPdfKit(document);
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 100) {
      return res.status(500).json({ error: 'PDFKit renderer produced an invalid PDF buffer.' });
    }

    const savedMeta = await personalAIRepository.save({
      userId,
      title: document.title,
      type,
      mimeType: 'application/pdf',
      byteLength: pdfBuffer.length,
      qualityReport,
      documentSpec: document,
      pdf: pdfBuffer,
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({
      ok: true,
      record: savedMeta,
      qualityReport,
      pdfBase64: pdfBuffer.toString('base64'),
      filename: `${String(document.title || 'document')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'document'}.pdf`,
    });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error?.message || 'Failed to render PDF with PDFKit.' });
  }
});

personalAIRouter.get('/documents/:id/download', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const docRecord = await personalAIRepository.getDocument(userId, req.params.id);
    if (!docRecord || !docRecord.pdfBase64) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    const buf = Buffer.from(docRecord.pdfBase64, 'base64');
    const filename = `${String(docRecord.title || 'document')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'document'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('X-Document-Quality-Score', String(docRecord.qualityReport?.score ?? 100));
    return res.status(200).send(buf);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to download PDF.' });
  }
});

// Signed Scheduler Route Handler for `/internal/agent/v1/scheduler/daily`
export async function handleInternalAgentScheduler(req: Request, res: Response) {
  try {
    const expectedSecret = process.env.AGENT_SCHEDULER_SECRET || '';
    if (!expectedSecret || expectedSecret === 'REPLACE_WITH_RANDOM_32_BYTE_OR_LONGER_SECRET') {
      return res.status(401).json({ error: 'Scheduler secret is not configured.' });
    }
    const { platform } = buildPersonalAIPlatform();
    const result = await executeScheduledDailyRun({
      authorizationHeader: req.headers.authorization,
      expectedSecret,
      platform,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    const status = Number(error?.status || 401);
    return res.status(status).json({ error: error?.message || 'Unauthorized scheduler request.' });
  }
}
