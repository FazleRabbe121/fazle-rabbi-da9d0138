import { ApprovalService } from "../approvals/approval-service.mjs";
import { createApplicationDraft } from "../applications/application-draft.mjs";
import { discoverAndStoreJobs } from "../jobs/discovery-service.mjs";
import { InterviewService } from "../interviews/interview-service.mjs";
import { DocumentIntelligenceService } from "../documents/document-service.mjs";
import { assertDocumentQuality } from "../documents/document-quality.mjs";
import { ProviderUnavailableError, NotFoundError, ValidationError, ConflictError } from "../core/errors.mjs";
import { mergePolicy } from "../core/policy.mjs";
import { classifySponsorshipEvidence } from "../jobs/sponsorship-evidence.mjs";
import { scoreOpportunity } from "../jobs/opportunity-score.mjs";
import { AgentOrchestrator } from "./agent-orchestrator.mjs";
import { createCareerAgentRegistry } from "./create-agent-registry.mjs";

export class CareerAgentPlatform {
  constructor({ repository, model = null, host, sources = [], policy = {}, now = () => new Date(), renderer = undefined }) {
    if (!repository || !host) throw new TypeError("repository and host application adapter are required.");
    this.repository = repository;
    this.model = model;
    this.host = host;
    this.sources = sources;
    this.policy = mergePolicy(policy);
    this.now = now;
    this.approvals = new ApprovalService(repository);
    this.interviews = new InterviewService({ repository, model, host, now });
    this.documents = model && ["generate", "generateJSON", "generateText"].some((m) => typeof model[m] === "function")
      ? new DocumentIntelligenceService({ model, renderer, repository })
      : {
          async createDocument() {
            throw new ProviderUnavailableError("Document generation requires the configured self-hosted Ollama model. No paid AI API fallback is enabled.");
          },
          async reviewDocument(document, options = {}) {
            return assertDocumentQuality(document, options);
          },
        };
    this.agentRegistry = createCareerAgentRegistry(this);
    this.orchestrator = new AgentOrchestrator({ agents: this.agentRegistry, model, policy: this.policy });
  }

  async runMission({ userId, goal, context = {}, fallbackPlan = [] } = {}) {
    if (!userId) throw new ValidationError("userId is required.");
    if (typeof goal !== "string" || !goal.trim() || goal.length > 2_000) throw new ValidationError("A concise mission goal is required.");
    if (context == null || typeof context !== "object" || Array.isArray(context)) throw new ValidationError("Mission context must be a JSON object.");
    return this.orchestrator.execute({
      goal: goal.trim(),
      context: { ...context, userId },
      fallbackPlan,
    });
  }

  async discoverJobs({ userId, roles = undefined, countries = undefined } = {}) {
    const profile = await this.host.getCandidateProfile(userId);
    if (!profile) throw new NotFoundError("Candidate profile was not found in the existing app.");
    const selectedRoles = roles ?? profile.targetRoles ?? ["Bartender", "Senior Bartender", "Mixologist", "Barista", "Waiter", "Food and Beverage"];
    const selectedCountries = countries ?? profile.targetCountries ?? [];
    if (!Array.isArray(selectedRoles) || !selectedRoles.every((item) => typeof item === "string")) throw new ValidationError("Target roles must be an array of strings.");
    if (!Array.isArray(selectedCountries) || !selectedCountries.every((item) => typeof item === "string")) throw new ValidationError("Target countries must be an array of strings.");
    const configuredSources = typeof this.host.getConfiguredJobSources === "function"
      ? await this.host.getConfiguredJobSources(userId)
      : null;
    const sourceList = Array.isArray(configuredSources) ? configuredSources : this.sources;
    return discoverAndStoreJobs({
      userId,
      sources: sourceList,
      repository: this.repository,
      candidateProfile: profile,
      policy: this.policy,
      roles: selectedRoles,
      countries: selectedCountries,
    });
  }

  async listJobs({ userId, limit = 100, status = undefined } = {}) {
    return this.repository.listVacancies(userId, { limit, status });
  }

  async reviewSponsorshipEvidence({ userId, vacancyId } = {}) {
    const vacancy = await this.repository.getVacancy(userId, vacancyId);
    if (!vacancy) throw new NotFoundError("Vacancy was not found.");
    const sponsorshipEvidence = classifySponsorshipEvidence({
      title: vacancy.title, description: vacancy.description,
      sourceType: vacancy.sourceType, sourceUrl: vacancy.sourceUrl || vacancy.url,
    });
    return this.repository.updateVacancy(userId, vacancyId, { sponsorshipEvidence });
  }

  async rankCandidateFit({ userId, vacancyId } = {}) {
    const vacancy = await this.repository.getVacancy(userId, vacancyId);
    if (!vacancy) throw new NotFoundError("Vacancy was not found.");
    const profile = await this.host.getCandidateProfile(userId);
    if (!profile) throw new NotFoundError("Candidate profile was not found in the existing app.");
    const opportunityScore = scoreOpportunity(vacancy, profile);
    return this.repository.updateVacancy(userId, vacancyId, { opportunityScore });
  }

  async prepareApplicationDraft({ userId, vacancyId, cvId = undefined } = {}) {
    if (!this.model) throw new ProviderUnavailableError("The self-hosted model is not configured. No paid provider fallback is enabled.");
    const vacancy = await this.repository.getVacancy(userId, vacancyId);
    if (!vacancy) throw new NotFoundError("Vacancy was not found in your saved job list.");
    const profile = await this.host.getCandidateProfile(userId);
    const selectedCvId = cvId || profile?.defaultCvId;
    if (!selectedCvId || typeof this.host.getCvText !== "function") {
      throw new ValidationError("Connect the existing single-source CV Library and select an available CV before drafting.");
    }
    const cvText = await this.host.getCvText(userId, selectedCvId);
    if (typeof cvText !== "string" || !cvText.trim()) throw new ValidationError("The selected CV could not be converted to readable text. Check the existing CV Library extraction service.");
    const draft = await createApplicationDraft({ model: this.model, vacancy, candidateProfile: profile, cvText });
    return this.repository.createDraft(userId, { ...draft, cvId: selectedCvId, status: "draft" });
  }

  async requestApplicationSendApproval({ userId, draftId } = {}) {
    if (!this.policy.allowExternalEmailSend) throw new ProviderUnavailableError("Approved email sending is disabled by the administrator. Enable it only after the existing Gmail integration is tested.");
    const draft = await this.repository.getDraft(userId, draftId);
    if (!draft) throw new NotFoundError("Application draft was not found.");
    return this.approvals.request({
      userId,
      type: "send_application",
      payload: { draftId: draft.id },
      summary: `Review and send the application for ${draft.role} at ${draft.employer}. This action uses the existing app's connected Gmail account.`,
    });
  }

  async listPendingApprovals({ userId, limit = 50 } = {}) {
    return this.approvals.listPending({ userId, limit });
  }

  async approveAction({ userId, actionId } = {}) {
    if (!this.policy.allowExternalEmailSend) throw new ProviderUnavailableError("Approved email sending is disabled by the administrator.");
    return this.approvals.approve({
      userId,
      actionId,
      execute: async (payload) => {
        if (payload?.draftId == null) throw new ValidationError("The approved action has no draft reference.");
        if (typeof this.host.sendApplication !== "function") throw new ProviderUnavailableError("The existing Gmail integration is not connected to the Agent Engine.");
        const draft = await this.repository.getDraft(userId, payload.draftId);
        if (!draft) throw new NotFoundError("Approved application draft no longer exists.");
        const providerResult = await this.host.sendApplication({ userId, draft });
        // Gmail/API acceptance is not proof of final inbox delivery or employer response.
        return {
          applicationId: providerResult?.applicationId || null,
          providerMessageId: providerResult?.messageId || null,
          status: providerResult?.accepted ? "accepted_by_mail_provider" : "send_result_unknown",
          note: "Provider acceptance is not confirmed delivery. Check bounces and employer replies separately.",
        };
      },
    });
  }

  async rejectAction({ userId, actionId, reason } = {}) {
    return this.approvals.reject({ userId, actionId, reason });
  }

  async startInterview(input) {
    return this.interviews.start(input);
  }

  async submitInterviewAnswer(input) {
    return this.interviews.submitAnswer(input);
  }

  async finishInterview(input) {
    return this.interviews.finish(input);
  }

  async runDailyCycle({ userId } = {}) {
    if (typeof this.repository.claimDailyRun !== "function" || typeof this.repository.completeDailyRunLock !== "function") {
      throw new ValidationError("The production repository must implement atomic daily-run locking before scheduled automation is enabled.");
    }
    const runKey = `daily:${this.now().toISOString().slice(0, 10)}`;
    const claimed = await this.repository.claimDailyRun(userId, runKey);
    if (!claimed) throw new ConflictError("A daily Agent run is already running or has completed for this user today.");
    let run = null;
    try {
      run = await this.repository.createRun(userId, { type: "daily-career-cycle", policyVersion: "1.0", runKey });
      const discovery = await this.discoverJobs({ userId });
      const jobs = await this.repository.listVacancies(userId, { limit: 100 });
      const report = {
        runId: run.id,
        completedAt: this.now().toISOString(),
        jobsDiscoveredThisRun: discovery.matchedJobs,
        totalSavedJobs: jobs.length,
        highFitJobs: jobs.filter((job) => job.opportunityScore?.score >= 75).length,
        confirmedSponsorshipSignals: jobs.filter((job) => job.sponsorshipEvidence?.status === "confirmed").length,
        needsReview: jobs.filter((job) => ["possible", "unknown"].includes(job.sponsorshipEvidence?.status)).length,
        failedSources: discovery.sourceResults.filter((item) => !item.ok).map((item) => ({ sourceId: item.sourceId, error: item.error })),
        note: "This cycle discovers, deduplicates, scores and records jobs. It does not submit applications or send emails automatically.",
      };
      await this.repository.finishRun(userId, run.id, { status: "completed", report });
      await this.repository.completeDailyRunLock(userId, runKey, { status: "completed", runId: run.id });
      return report;
    } catch (error) {
      if (run?.id) await this.repository.finishRun(userId, run.id, { status: "failed", error: error instanceof Error ? error.message : String(error) }).catch(() => null);
      await this.repository.completeDailyRunLock(userId, runKey, { status: "failed", runId: run?.id || null }).catch(() => null);
      throw error;
    }
  }

  async runDailyCycleForEnabledUsers() {
    if (typeof this.host.listAgentEnabledUsers !== "function") {
      throw new ValidationError("The host application must implement listAgentEnabledUsers before scheduled multi-user runs can be enabled.");
    }
    const userIds = await this.host.listAgentEnabledUsers();
    const outcomes = [];
    for (const userId of userIds) {
      try {
        outcomes.push({ userId, ok: true, report: await this.runDailyCycle({ userId }) });
      } catch (error) {
        outcomes.push({ userId, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { usersProcessed: outcomes.length, outcomes };
  }
}
