export type PersonalAIActivationState =
  | 'Development'
  | 'Testing'
  | 'Ready for Review'
  | 'Approved'
  | 'Active'
  | 'Disabled';

export interface PersonalAISourceConfig {
  id: string;
  provider: 'greenhouse' | 'lever' | 'careerpilot_official';
  employerName: string;
  boardIdentifier: string;
  region: 'global' | 'eu';
  enabled: boolean;
  createdAt: string;
}

export interface PersonalAIConfig {
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

export interface PersonalAIVacancy {
  id: string;
  stableKey: string;
  sourceId: string;
  sourceType: string;
  externalId: string | null;
  title: string;
  employer: string;
  location: string;
  description: string;
  url: string;
  sourceUrl: string;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status: string;
  sponsorshipEvidence?: {
    status: 'confirmed' | 'possible' | 'not_supported' | 'unknown';
    confidence: 'high' | 'medium' | 'low' | 'none';
    evidenceQuote: string | null;
    sourceUrl: string | null;
    reason: string;
  };
  opportunityScore?: {
    score: number;
    label: string;
    isHiringProbability: boolean;
    factors: {
      role: number;
      skills: number;
      location: number;
      sponsorshipEvidence: number;
      freshness: number;
      sourceQuality: number;
    };
    explanation: string[];
  };
}

const API_BASE = '/api/agent/v1';

async function agentFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err: any = new Error(data.error || `Personal AI request failed (${response.status})`);
    err.code = data.code;
    err.status = response.status;
    err.details = data.details;
    throw err;
  }
  return data as T;
}

export async function fetchPersonalAIOverview() {
  return agentFetch('/overview');
}

export async function fetchPersonalAIHealth() {
  return agentFetch('/health');
}

export async function probePersonalAIModel(params: {
  baseUrl?: string;
  model?: string;
  runGenerationTest?: boolean;
}) {
  return agentFetch('/model/probe', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updatePersonalAIActivationState(params: {
  state: PersonalAIActivationState;
  notes?: string;
  approvedBy?: string;
}) {
  return agentFetch('/activation-state', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updatePersonalAIConfig(patch: Partial<PersonalAIConfig>) {
  return agentFetch('/config', {
    method: 'POST',
    body: JSON.stringify(patch),
  });
}

export async function discoverPersonalAIJobs(params?: { roles?: string[]; countries?: string[] }) {
  return agentFetch('/jobs/discover', {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

export async function verifyPersonalAISponsorship(params: {
  vacancyId?: string;
  title?: string;
  employer?: string;
  location?: string;
  description?: string;
  sourceType?: string;
  sourceUrl?: string;
}) {
  return agentFetch('/sponsorship/verify', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function executePersonalAIMission(params: {
  goal: string;
  context?: Record<string, any>;
  fallbackPlan?: Array<{ agent: string; task: string; input: Record<string, any> }>;
}) {
  return agentFetch('/missions/execute', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function createPersonalAIApplicationDraft(params: {
  vacancyId: string;
  cvId?: string;
  allowDeterministicWhenModelOffline?: boolean;
}) {
  return agentFetch('/applications/draft', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function createPersonalAIFollowUpDraft(params: {
  application: {
    id: string;
    employer: string;
    role: string;
    status?: string;
    lastFollowUpAt?: string | null;
  };
  verifiedContact: {
    email: string;
    status: 'verified' | 'unverified';
    sourceUrl: string;
  };
  daysSinceApplication: number;
  allowDeterministicWhenModelOffline?: boolean;
}) {
  return agentFetch('/applications/follow-up', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function requestPersonalAISendApproval(draftId: string) {
  return agentFetch('/applications/request-send', {
    method: 'POST',
    body: JSON.stringify({ draftId }),
  });
}

export async function decidePersonalAIApprovalAction(
  actionId: string,
  decision: 'approve' | 'reject',
  reason?: string
) {
  return agentFetch(`/actions/${encodeURIComponent(actionId)}/${decision}`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || 'Decision recorded by owner.' }),
  });
}

export async function startPersonalAIInterview(params: {
  category: string;
  level: number;
  mode: 'spoken' | 'written';
}) {
  return agentFetch('/interviews/start', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function submitPersonalAIInterviewAnswer(
  sessionId: string,
  params: { answerText: string; audioTranscript?: string | null }
) {
  return agentFetch(`/interviews/${encodeURIComponent(sessionId)}/answers`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function finishPersonalAIInterview(
  sessionId: string,
  params?: { bypassDurationForTesting?: boolean }
) {
  return agentFetch(`/interviews/${encodeURIComponent(sessionId)}/finish`, {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

export async function runPersonalAIDailyCycle(params?: { resetTodayLock?: boolean }) {
  return agentFetch('/daily/run', {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

export async function reviewPersonalAIDocument(params: {
  document: any;
  options?: { requireSources?: boolean; minWords?: number };
}) {
  return agentFetch('/documents/review', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function renderPersonalAIStructuredPdf(params: {
  document: any;
  type?: string;
  requireSources?: boolean;
  minWords?: number;
}) {
  return agentFetch('/documents/render-pdf', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
