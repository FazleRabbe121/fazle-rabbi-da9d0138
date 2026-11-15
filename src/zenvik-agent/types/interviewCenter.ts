export type InterviewRoleId =
  | 'waiter'
  | 'bartender'
  | 'barista'
  | 'electrician'
  | 'plumber'
  | 'cefr_english';

export type ProfessionalLevel = '1' | '2' | '3';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type InterviewLevel = ProfessionalLevel | CefrLevel;
export type InterviewMode = 'spoken' | 'written';
export type ParticipantStatus = 'approved' | 'suspended' | 'revoked';

export interface ApprovedParticipant {
  id: string;
  email: string; // normalized lowercase
  uid?: string;
  displayName?: string;
  status: ParticipantStatus;
  allowedCategories: string[]; // e.g., ['all'] or ['waiter', 'bartender', 'cefr_english']
  canViewResults: boolean;
  requireAccessCode?: boolean;
  accessCodeHash?: string | null;
  accessCodeDisplay?: string | null;
  sessionVersion?: number;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes?: string;
}

export interface LevelEvaluationCriteria {
  level: InterviewLevel;
  levelLabel: string;
  instructions: string;
  passingScoreThreshold: number;
  minQuestionsRequired: number;
  minWordCountPerAnswer: number;
  evaluationFocus: string[];
  passingRequirementsText: string;
}

export interface QuestionBankItem {
  id: string;
  category: 'professional' | 'english';
  role: InterviewRoleId;
  roleTitle: string;
  level: InterviewLevel;
  levelLabel: string;
  targetMinutesLabel: string;
  targetMinSeconds: number;
  questionNumber: number;
  questionText: string;
  evaluatorLooksFor: string;
  followUpPrompt: string;
  isSafetyCritical: boolean;
  safetyNote?: string;
  sourceVersion: string;
  instructions?: string;
  keyConcepts?: string[];
  acceptableVariations?: string[];
  modelAnswer?: string;
  passingScore?: number;
}

export interface RubricConfig {
  roleKnowledgeWeight: number; // default 25
  situationalJudgmentWeight: number; // default 25
  grammarVocabWeight: number; // default 20
  clarityFluencyWeight: number; // default 20
  professionalismSafetyWeight: number; // default 10
  passThreshold: number; // default 70
  minDurationSecondsL1: number; // default 300 (5 mins)
  minDurationSecondsL2: number; // default 480 (8 mins)
  minDurationSecondsL3: number; // default 600 (10 mins)
  minDurationSecondsCefr: number; // default 300 (5 mins)
  strictFiveMinuteCap: boolean; // if true, all levels require 300s (5 mins) minimum
  showModelAnswersAfterCompletion: boolean; // default true
  version: string;
  updatedAt: string;
  updatedBy: string;
}

export interface InterviewAnswerRecord {
  answerId: string;
  attemptId: string;
  questionId: string;
  questionText: string;
  isFollowUp: boolean;
  answerText: string;
  originalTranscript?: string;
  detectedLanguage?: string;
  englishTranslation?: string;
  wasTranslated?: boolean;
  inputMode: InterviewMode;
  audioDurationSeconds?: number;
  answeredAt: string;
  perQuestionScore: number; // 0-100
  questionPassStatus?: 'PASS' | 'FAIL';
  relevanceScore?: number; // 0-100
  rubricSubScores?: {
    roleKnowledge: number;
    situationalJudgment: number;
    grammarVocab: number;
    clarityFluency: number;
    professionalismSafety: number;
  };
  feedback: string;
  strengths: string[];
  improvements: string[];
  grammarCorrection?: {
    original: string;
    corrected: string;
    explanation: string;
  } | null;
  modelAnswerExample?: string;
  safetyFlagged: boolean;
  safetyReason?: string;
  needsFollowUp: boolean;
  generatedFollowUpQuestion?: string;
}

export type PassFailOutcome =
  | 'PASS'
  | 'FAIL'
  | 'Fail — Safety Concern'
  | 'Insufficient evidence—continue assessment';

export interface InterviewAttemptRecord {
  attemptId: string;
  participantEmail: string;
  participantUid: string;
  participantName: string;
  category: 'professional' | 'english';
  role: InterviewRoleId;
  roleTitle: string;
  level: InterviewLevel;
  levelLabel: string;
  levelInstructions?: string;
  levelPassingRequirements?: string;
  levelPassThreshold?: number;
  mode: InterviewMode;
  status: 'in_progress' | 'completed' | 'abandoned';
  consentGivenAt: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  durationSeconds: number;
  targetDurationSeconds: number;
  questionBankVersion: string;
  rubricSnapshot: RubricConfig;
  providerUsed: string;
  currentQuestionIndex: number;
  assignedQuestionIds: string[];
  activeFollowUpQuestion?: {
    parentQuestionId: string;
    questionId: string;
    questionText: string;
    evaluatorLooksFor: string;
    isSafetyCritical: boolean;
  } | null;
  answers: InterviewAnswerRecord[];
  totalScore?: number;
  percentageScore?: number;
  passFailStatus?: PassFailOutcome;
  rubricBreakdown?: {
    roleKnowledge: number;
    situationalJudgment: number;
    grammarVocab: number;
    clarityFluency: number;
    professionalismSafety: number;
  };
  cefrEvaluation?: {
    targetLevel: CefrLevel;
    estimatedLevel: CefrLevel | 'Insufficient evidence—continue assessment';
    confidence: 'High' | 'Medium' | 'Low';
    grammarScore: number;
    vocabularyScore: number;
    comprehensionScore: number;
    fluencyCoherenceScore: number;
    taskCompletionScore: number;
  };
  strengths?: string[];
  weaknesses?: string[];
  grammarCorrections?: {
    original: string;
    corrected: string;
    explanation: string;
  }[];
  recommendedPractice?: string[];
  nextLevelRecommendation?: string;
  overallSummary?: string;
  pronunciationDisclaimer?: string;
  safetyConcernDetails?: string;
  englishExamResult?: EnglishExamResultPayload;
}

export interface EnglishExamMetrics {
  words: number;
  wpm?: number | null;
  lexicalVariety?: number;
  avgWordLength?: number;
  band: string;
}

export interface EnglishExamResultPayload {
  candidate: {
    name: string;
    email: string;
    ref?: string;
  };
  submittedAt: string;
  timedOut: boolean;
  durationSec: number;
  objective: {
    level: CefrLevel | 'Below A1';
    score: number;
    total: number;
    byLevel: Record<string, string>; // e.g., { A1: '5/5', A2: '4/5', ... }
    bySkill: Record<string, string>; // e.g., { Grammar: '14/16', Vocabulary: '5/6', Reading: '4/4', Listening: '4/4' }
  };
  speaking: {
    prompt: string;
    seconds: number;
    transcript: string;
    metrics: EnglishExamMetrics;
  }[];
  writing: {
    prompt?: string;
    text: string;
    words: number;
    metrics: EnglishExamMetrics;
  };
  incorrectAnswers?: {
    n: number;
    type: string;
    q: string;
    yours: string;
    correct: string;
  }[];
  examinerReview: 'pending' | 'reviewed';
  aiExaminerFeedback?: string;
}

export interface GeminiProviderEvent {
  id: string;
  provider: 'gemini';
  model: string;
  operation: 'evaluate_answer' | 'finalize_attempt' | 'transcribe_audio' | 'generate_tts' | 'health_check';
  eventType:
    | 'success'
    | 'rate_limit_429'
    | 'auth_401'
    | 'permission_403'
    | 'timeout'
    | 'server_5xx'
    | 'retry_recovered';
  statusCode: number;
  message: string;
  latencyMs: number;
  retryAttempt: number;
  timestamp: string;
}

export interface GeminiHealthSummary {
  provider: 'gemini';
  primaryModel: string;
  transcribeModel: string;
  ttsModel: string;
  apiKeyConfigured: boolean;
  status: 'healthy' | 'degraded_rate_limited' | 'config_error' | 'idle';
  totalRequests: number;
  successfulRequests: number;
  rateLimitEvents: number;
  configErrorEvents: number;
  retryRecoveries: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastErrorClass: string | null;
  recentEvents: GeminiProviderEvent[];
}

export interface AdminAuditEvent {
  id: string;
  actorEmail: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}
