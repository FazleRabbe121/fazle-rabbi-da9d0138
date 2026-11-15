/** Register only approved, purpose-built agents; never pass arbitrary shell tools. */
export function createCareerAgentRegistry(platform) {
  return {
    "job-discovery": {
      execute: ({ userId, input }) => platform.discoverJobs({ userId, roles: input.roles, countries: input.countries }),
      summarize: (result) => `${result.matchedJobs} matching jobs from ${result.successfulSources}/${result.totalSources} sources.`,
    },
    "sponsorship-evidence-review": {
      execute: ({ userId, input }) => platform.reviewSponsorshipEvidence({ userId, vacancyId: input.vacancyId }),
      summarize: (job) => `Sponsorship evidence classified as ${job.sponsorshipEvidence?.status || "unknown"}.`,
    },
    "candidate-fit-ranking": {
      execute: ({ userId, input }) => platform.rankCandidateFit({ userId, vacancyId: input.vacancyId }),
      summarize: (job) => `Candidate fit score: ${job.opportunityScore?.score ?? "not scored"}/100.`,
    },
    "job-ranking": {
      execute: async ({ userId }) => platform.listJobs({ userId, limit: 100 }),
      summarize: (jobs) => `${jobs.length} saved vacancies ranked by fit score.`,
    },
    "application-drafting": {
      execute: ({ userId, input }) => platform.prepareApplicationDraft({ userId, vacancyId: input.vacancyId, cvId: input.cvId }),
      summarize: (draft) => `Draft prepared for ${draft.role} at ${draft.employer}; not sent.`,
    },
    "interview-preparation": {
      execute: ({ userId, input }) => platform.startInterview({ userId, category: input.category, level: input.level, mode: input.mode || "spoken" }),
      summarize: (session) => `${session.category} Level ${session.level} practice session started.`,
    },
  };
}
