import { MonthlyStatsPayload } from '../types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function askAIAssistant(
  messages: ChatMessage[],
  contextSummary?: {
    currentStreakDays: number;
    habitName: string;
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlySavings: number;
    familyMoneyTotal: number;
    currency: string;
  }
): Promise<string> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      context: contextSummary,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `AI Assistant server error (${response.status})`);
  }

  const data = await response.json();
  return data.reply;
}

export async function generateMonthlyReport(
  payload: MonthlyStatsPayload,
  currency: string
): Promise<string> {
  const response = await fetch('/api/ai/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stats: payload,
      currency,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Report generation failed (${response.status})`);
  }

  const data = await response.json();
  return data.report;
}

// ========================================================
// 3-TIER MULTI-AI AGENT PIPELINE ARCHITECTURE (Requirement 2)
// Tier 1 - Agent 1 (Gemini): Web scraping & real-time job searching (continuous fetch via Google Search grounding)
// Tier 2 - Agent 2 (ChatGPT / OpenAI API): Data parsing, verification, ATS matching against user CV/profile
// Tier 3 - Agent 3 (Grok / Mailer): Draft generation and outreach execution with safety validation
// ========================================================

export interface ThreeTierPipelineRequest {
  market?: 'cyprus' | 'europe' | 'sponsorship';
  roles?: string[];
  locations?: string[];
  existingEmails?: string[];
  applicantName?: string;
  applicantEmail?: string;
  applicantPhone?: string;
  selectedCvId?: string;
  selectedCvTitle?: string;
  bypassCooldown?: boolean;
  forceFresh?: boolean;
}

export interface PreparedPipelineApplication {
  id: string;
  market: 'cyprus' | 'europe' | 'sponsorship';
  company: string;
  position: string;
  city?: string;
  country?: string;
  location: string;
  email: string;
  recipientEmail: string;
  emailVerificationStatus: 'verified' | 'needs_review';
  emailVerificationReason?: string;
  jobPostingDate?: string;
  jobPostingDateVerified?: boolean;
  jobStatus: 'verified' | 'needs_review';
  jobUrl?: string;
  applicationUrl?: string;
  sourceUrl?: string;
  sourceNotes?: string;
  verificationStatus: 'verified' | 'needs_review';
  reviewReason?: string;
  verifiedBy: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  subject: string;
  applicationMessage?: string;
  coverLetter: string;
  selectedCvId?: string;
  selectedCvTitle?: string;
  isApproved: boolean;
  isNewVacancy: boolean;
  overrideCooldown?: boolean;
  atsMatchScore: number;
  atsMatchedSkills: string[];
  sponsorshipStatus?: string;
  sponsorshipEvidence?: string;
  sponsorshipAssessment?: string;
  sixMonthSponsorshipScore?: number;
  sixMonthTimelineViable?: boolean;
  targetDate?: string;
  permitType?: string;
  processingTimeline?: string;
  quotaStatus?: string;
  nonEuHiringEvidence?: string;
  tier1SearchAgent: string;
  tier2VerificationAgent: string;
  tier3OutreachAgent: string;
}

export interface PipelineExecutionResult {
  market: string;
  applications: PreparedPipelineApplication[];
  agentPipeline: {
    agent1: string;
    agent2: string;
    agent3: string;
  };
}

/**
 * Agent 1 (Gemini): Web scraping and real-time job searching (continuous fetch)
 */
export async function searchJobsWithGemini(
  roles?: string[],
  locations?: string[]
): Promise<any[]> {
  const response = await fetch('/api/ai/jobs/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles, locations }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Gemini Job Search failed (${response.status})`);
  }
  const data = await response.json();
  return data.jobs || [];
}

/**
 * Agent 2 (ChatGPT / OpenAI API): Data parsing, verification & ATS matching against candidate CV/profile
 */
export async function verifyJobsWithOpenAI(
  jobs: any[],
  existingEmails: string[] = []
): Promise<any[]> {
  const response = await fetch('/api/ai/jobs/verify-openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobs, existingEmails }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `OpenAI Verification failed (${response.status})`);
  }
  const data = await response.json();
  return data.verifiedJobs || [];
}

/**
 * Agent 3 (Grok / Mailer): Cross-validation, draft generation & outreach execution
 */
export async function verifyJobsWithGrok(jobs: any[]): Promise<any[]> {
  const response = await fetch('/api/ai/jobs/verify-grok', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobs }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Grok Verification failed (${response.status})`);
  }
  const data = await response.json();
  return data.verifiedJobs || [];
}

/**
 * Orchestrates complete 3-Tier Multi-AI Agent Pipeline:
 * Agent 1 (Gemini) -> Agent 2 (OpenAI / ATS) -> Agent 3 (Grok / Mailer)
 */
export async function runThreeAIPipeline(params: ThreeTierPipelineRequest): Promise<PreparedPipelineApplication[]> {
  const response = await fetch('/api/ai/jobs/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `3-AI Pipeline failed (${response.status})`);
  }
  const data: PipelineExecutionResult = await response.json();
  return data.applications || [];
}

export interface ClassifiedEmployerReply {
  category: 'interview' | 'inforequest' | 'acknowledgement' | 'rejection';
  actionRequired: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
}

/**
 * Classifies an incoming employer email reply using Gemini API
 */
export async function classifyEmployerReplyWithGemini(
  subject: string,
  bodySnippet: string,
  company?: string
): Promise<ClassifiedEmployerReply> {
  try {
    const res = await fetch('/api/ai/classify-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, bodySnippet, company }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.category) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Classify reply note:', err);
  }

  // Resilient heuristic classification fallback
  const lower = `${subject} ${bodySnippet}`.toLowerCase();
  if (lower.includes('interview') || lower.includes('teams') || lower.includes('zoom') || lower.includes('call') || lower.includes('speak with you')) {
    return {
      category: 'interview',
      actionRequired: 'Reply promptly with your availability to schedule the interview.',
      sentiment: 'positive',
      summary: 'Interview invitation received from employer.',
    };
  }
  if (lower.includes('right to work') || lower.includes('video') || lower.includes('portfolio') || lower.includes('documents') || lower.includes('passport')) {
    return {
      category: 'inforequest',
      actionRequired: 'Provide requested passport/work-permit readiness details or portfolio video.',
      sentiment: 'positive',
      summary: 'Employer requested documentation or screening details.',
    };
  }
  if (lower.includes('unfortunately') || lower.includes('other candidates') || lower.includes('not moving forward') || lower.includes('not selected')) {
    return {
      category: 'rejection',
      actionRequired: 'Record in rejection tracking. Application cooldown active.',
      sentiment: 'negative',
      summary: 'Application not progressed by employer.',
    };
  }
  return {
    category: 'acknowledgement',
    actionRequired: 'Application acknowledged. Awaiting recruiter review.',
    sentiment: 'neutral',
    summary: 'Automated application confirmation received.',
  };
}

