# Existing CareerPilot host-app adapter

The host application is the source of truth. Implement a production adapter in the existing backend by calling the app's actual services. Do not guess filenames or invent database columns before inspecting the source.

## Required and optional methods

```ts
interface CareerPilotHostAdapter {
  // Required: use authenticated user ID supplied by the app server.
  getCandidateProfile(userId: string): Promise<{
    targetRoles?: string[];
    targetCountries?: string[];
    skills?: string[];
    defaultCvId?: string;
    [safeProfileFields: string]: unknown;
  } | null>;

  // Connect to the one existing CV Library. Do not create a second CV store.
  getCvText?(userId: string, cvId: string): Promise<string>;

  // Prefer admin-configured official public job board connectors from existing settings.
  getConfiguredJobSources?(userId: string): Promise<Array<{ id: string; type: string; fetchJobs(args: {limit: number}): Promise<unknown[]> }>>;

  // Reuse the current Gmail OAuth account, sender permissions and attachment pipeline.
  // This is called only after app-level admin opt-in and the user approves a draft.
  sendApplication?(args: { userId: string; draft: object }): Promise<{
    accepted: boolean; messageId?: string; applicationId?: string;
  }>;

  // Search the user's existing Interview Center PDFs / approved knowledge library.
  getInterviewSourceMaterials?(args: { userId: string; category: string; level: number }): Promise<Array<{
    title: string; excerpt: string; sourceId?: string; page?: number;
  }>>;

  // Return users who explicitly enabled scheduled discovery. Never return all users by default.
  listAgentEnabledUsers?(): Promise<string[]>;
}
```

## Important mapping notes

- `getCandidateProfile`: normalise the app's current profile without hardcoding personal details into the Agent Engine.
- `defaultCvId`: must reference the existing central CV Library's selected/default CV.
- `getCvText`: extract text securely server-side from the selected CV. Preserve the actual file and do not create a duplicate copy.
- `getConfiguredJobSources`: allow only admin-configured board identifiers. Avoid unrestricted scraping and respect each source's terms/rate limits.
- `sendApplication`: attach the correct CV and cover letter using the existing Gmail integration. Return accepted/message ID only on provider acceptance. Do not equate acceptance with successful delivery.
- `getInterviewSourceMaterials`: enforce the existing interview allowlist, user access and content permissions. Retrieve relevant passages from PDFs, with source document/page metadata.
- `listAgentEnabledUsers`: require per-user opt-in and respect account/plan status.

## Database adapter methods required by the platform

Implement these methods against the existing DB or compatible additive agent tables:

- `upsertVacancy(userId, vacancy)` — unique key per user and canonical vacancy identity.
- `getVacancy`, `updateVacancy`, `listVacancies`.
- `createDraft`, `getDraft`.
- `createAction`, `getAction`, `listActions`, `claimAction`, `updateAction` — `claimAction` must be atomic.
- `createInterview`, `getInterview`, `updateInterview`, `addInterviewAnswer`, `updateInterviewAnswer`, `listInterviewAnswers`.
- `claimDailyRun(userId, runKey)`, `completeDailyRunLock(userId, runKey, patch)` — atomic unique per user/day lock; return false if already running/completed.
- `createRun`, `finishRun`.

The supplied `InMemoryAgentRepository` implements the contract for local tests only. Do not use it in production or for multi-user data.

## Integration sequence

1. Inspect existing auth, role/allowlist, database and CV/Gmail services.
2. Add this module to the backend only.
3. Implement repository and host adapters.
4. Mount the routes behind existing authentication.
5. Add optional `AgentMissionControl` UI using existing theme/tokens.
6. Configure Ollama endpoint and official job source boards.
7. Run tests, then manual end-to-end checks in a non-production account.
