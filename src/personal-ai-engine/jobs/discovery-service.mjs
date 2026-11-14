import { classifySponsorshipEvidence } from "./sponsorship-evidence.mjs";
import { scoreOpportunity } from "./opportunity-score.mjs";
import { matchesTarget, normalizeVacancy } from "./text.mjs";
import { AgentError } from "../core/errors.mjs";

export async function discoverAndStoreJobs({ userId, sources, repository, candidateProfile = {}, policy = {}, roles = [], countries = [] }) {
  if (!userId) throw new TypeError("userId is required.");
  if (!Array.isArray(sources)) throw new TypeError("sources must be an array.");
  const maxSources = policy.maxSourcesPerRun ?? 30;
  const maxJobsPerSource = policy.maxJobsPerSource ?? 250;
  if (sources.length > maxSources) throw new AgentError(`Configured source count exceeds the allowed limit (${maxSources}).`, { code: "SOURCE_LIMIT", status: 400 });

  const sourceResults = await Promise.all(sources.map(async (source) => {
    try {
      const rawJobs = await source.fetchJobs({ limit: maxJobsPerSource });
      const saved = [];
      for (const raw of rawJobs) {
        const job = normalizeVacancy(raw, source);
        if (!job.title || !job.url || !matchesTarget(job, { roles, countries })) continue;
        job.sponsorshipEvidenceCheckedAt = new Date().toISOString();
        job.sponsorshipEvidence = classifySponsorshipEvidence({
          title: job.title,
          description: job.description,
          sourceType: job.sourceType,
          sourceUrl: job.sourceUrl,
        });
        job.opportunityScore = scoreOpportunity(job, candidateProfile);
        saved.push(await repository.upsertVacancy(userId, job));
      }
      return { sourceId: source.id, ok: true, fetched: rawJobs.length, matched: saved.length, jobs: saved };
    } catch (error) {
      return { sourceId: source.id, ok: false, error: error instanceof Error ? error.message : String(error), jobs: [] };
    }
  }));

  return {
    totalSources: sourceResults.length,
    successfulSources: sourceResults.filter((item) => item.ok).length,
    failedSources: sourceResults.filter((item) => !item.ok).length,
    matchedJobs: sourceResults.reduce((sum, item) => sum + item.matched, 0),
    sourceResults: sourceResults.map(({ jobs, ...summary }) => summary),
    jobs: sourceResults.flatMap((item) => item.jobs).sort((a, b) => (b.opportunityScore?.score || 0) - (a.opportunityScore?.score || 0)),
  };
}
