/**
 * Central policy. Keep these defaults restrictive and override only from an
 * authenticated administrator setting stored by the host application.
 */
export const DEFAULT_AGENT_POLICY = Object.freeze({
  maxStepsPerRun: 18,
  maxJobsPerSource: 250,
  maxSourcesPerRun: 30,
  maxRunDurationMs: 5 * 60 * 1000,
  allowExternalEmailSend: false,
  requireApprovalForExternalActions: true,
  allowBrowserFormSubmission: false,
  allowAutonomousAccountCreation: false,
  allowCodeExecution: false,
  requireEvidenceForConfirmedSponsorship: true,
});

export function mergePolicy(overrides = {}) {
  const merged = { ...DEFAULT_AGENT_POLICY, ...overrides };
  for (const key of ["maxStepsPerRun", "maxJobsPerSource", "maxSourcesPerRun", "maxRunDurationMs"]) {
    if (!Number.isFinite(merged[key]) || merged[key] <= 0) {
      throw new TypeError(`Policy ${key} must be a positive number.`);
    }
  }
  return Object.freeze(merged);
}
