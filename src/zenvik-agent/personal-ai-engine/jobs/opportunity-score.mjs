const normalize = (value) => String(value || "").toLowerCase();

/** Explainable prioritization score (0-100), not a probability of being hired. */
export function scoreOpportunity(job, candidate = {}) {
  const roles = (candidate.targetRoles || []).map(normalize);
  const skills = (candidate.skills || []).map(normalize);
  const countries = (candidate.targetCountries || []).map(normalize);
  const title = normalize(job.title);
  const description = normalize(job.description);
  const location = normalize(job.location);
  const sponsorship = job.sponsorshipEvidence?.status || "unknown";

  const roleMatched = roles.length === 0 ? 12 : (roles.some((term) => title.includes(term)) ? 25 : 0);
  const skillHits = skills.filter((skill) => skill && (title.includes(skill) || description.includes(skill))).length;
  const skillScore = skills.length === 0 ? 8 : Math.min(20, Math.round((skillHits / skills.length) * 20));
  const countryMatched = countries.length === 0 ? 8 : (countries.some((term) => location.includes(term)) ? 15 : 0);
  const sponsorshipScore = ({ confirmed: 20, possible: 12, unknown: 5, not_supported: 0 })[sponsorship] ?? 5;
  const freshnessDays = job.publishedAt ? Math.max(0, (Date.now() - new Date(job.publishedAt).getTime()) / 86_400_000) : 30;
  const freshnessScore = Number.isFinite(freshnessDays) ? (freshnessDays <= 7 ? 15 : freshnessDays <= 30 ? 10 : freshnessDays <= 90 ? 5 : 0) : 0;
  const sourceScore = job.sourceType?.includes("official") || job.sourceType?.includes("_official_") ? 5 : 2;
  const total = Math.max(0, Math.min(100, roleMatched + skillScore + countryMatched + sponsorshipScore + freshnessScore + sourceScore));

  return {
    score: total,
    label: total >= 75 ? "High fit" : total >= 50 ? "Review" : "Low fit",
    isHiringProbability: false,
    factors: {
      role: roleMatched,
      skills: skillScore,
      location: countryMatched,
      sponsorshipEvidence: sponsorshipScore,
      freshness: freshnessScore,
      sourceQuality: sourceScore,
    },
    explanation: [
      roleMatched ? "Job title aligns with target roles." : "Role title match is weak or unconfigured.",
      `${skillHits} of ${skills.length} configured skills matched the title or description.`,
      countries.length ? (countryMatched ? "Location matches a configured target country." : "Location does not match configured target countries.") : "No target-country filter was configured.",
      `Sponsorship evidence status: ${sponsorship}.`,
      job.publishedAt ? `Published ${Math.floor(freshnessDays)} day(s) ago.` : "Publication date is not supplied by the source.",
    ],
  };
}
