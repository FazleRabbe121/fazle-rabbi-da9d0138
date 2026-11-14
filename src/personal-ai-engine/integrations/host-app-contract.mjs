/**
 * Host application adapter contract. Implement these methods by reusing the
 * existing CareerPilot data, CV Library, auth, and Gmail integration. Do not
 * create duplicate profile/CV/application tables when equivalents exist.
 */
export function assertHostAppAdapter(host) {
  const required = ["getCandidateProfile"];
  const missing = required.filter((name) => typeof host?.[name] !== "function");
  if (missing.length) throw new TypeError(`Host application adapter is missing: ${missing.join(", ")}`);
  return host;
}

/**
 * Example shape only; the host app must supply real implementations:
 *
 * {
 *   async getCandidateProfile(userId) { return existingProfileService.get(userId); },
 *   async getCvText(userId, cvId) { return existingCvLibrary.extractText(userId, cvId); },
 *   async getConfiguredJobSources(userId) { return sourceConfigRepository.listEnabled(userId); },
 *   async sendApplication({ userId, draft }) {
 *     // Call the app's already-authorized Gmail adapter here.
 *     // Return { accepted: true, messageId, applicationId } only if provider accepted.
 *   },
 *   async getInterviewSourceMaterials({ userId, category, level }) {
 *     // Reuse existing uploaded interview PDFs / document store.
 *     return existingInterviewKnowledge.search({ category, level });
 *   },
 *   async listAgentEnabledUsers() { return settingsRepository.listOptedInUserIds(); },
 *   async claimDailyRun(userId, runKey) { return database.atomicInsertDailyRunLock(userId, runKey); },
 *   async completeDailyRunLock(userId, runKey, patch) { return database.updateDailyRunLock(userId, runKey, patch); },
 *   // Repository additionally implements upsert/get/list/update vacancy,
 *   // draft, approval, interview, run and interview-answer methods.
 *   // Daily lock claim must be an atomic unique (user_id, run_key) operation.
 * }
 */
