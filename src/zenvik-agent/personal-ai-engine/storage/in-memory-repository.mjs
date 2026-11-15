import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError } from "../core/errors.mjs";
import { stableVacancyKey } from "../jobs/text.mjs";

/** Development/test adapter only. Replace with the host app's real database. */
export class InMemoryAgentRepository {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.vacancies = new Map();
    this.drafts = new Map();
    this.actions = new Map();
    this.interviews = new Map();
    this.answers = new Map();
    this.runs = new Map();
    this.dailyRunLocks = new Map();
  }

  async upsertVacancy(userId, vacancy) {
    const key = `${userId}:${stableVacancyKey(vacancy)}`;
    const existing = this.vacancies.get(key);
    const currentTime = this.now().toISOString();
    const saved = {
      ...existing,
      ...vacancy,
      id: existing?.id || randomUUID(),
      userId,
      stableKey: stableVacancyKey(vacancy),
      firstSeenAt: existing?.firstSeenAt || currentTime,
      lastSeenAt: currentTime,
      status: existing?.status === "applied" ? "applied" : (existing ? "updated" : "new"),
    };
    this.vacancies.set(key, saved);
    return structuredClone(saved);
  }

  async getVacancy(userId, id) {
    const item = [...this.vacancies.values()].find((row) => row.userId === userId && row.id === id);
    return item ? structuredClone(item) : null;
  }

  async updateVacancy(userId, id, patch) {
    const entry = [...this.vacancies.entries()].find(([, row]) => row.userId === userId && row.id === id);
    if (!entry) throw new NotFoundError("Vacancy was not found.");
    const [key, row] = entry;
    Object.assign(row, patch, { updatedAt: this.now().toISOString() });
    this.vacancies.set(key, row);
    return structuredClone(row);
  }

  async listVacancies(userId, { limit = 100, status = undefined } = {}) {
    return [...this.vacancies.values()]
      .filter((row) => row.userId === userId && (!status || row.status === status))
      .sort((a, b) => (b.opportunityScore?.score || 0) - (a.opportunityScore?.score || 0))
      .slice(0, Math.min(500, Math.max(1, limit)))
      .map((row) => structuredClone(row));
  }

  async createDraft(userId, draft) {
    const id = randomUUID();
    const saved = { ...draft, id, userId, status: "draft", createdAt: this.now().toISOString() };
    this.drafts.set(id, saved);
    return structuredClone(saved);
  }

  async getDraft(userId, id) {
    const row = this.drafts.get(id);
    return row?.userId === userId ? structuredClone(row) : null;
  }

  async createAction(userId, action) {
    const id = randomUUID();
    const saved = { ...action, id, userId, status: "pending", createdAt: this.now().toISOString() };
    this.actions.set(id, saved);
    return structuredClone(saved);
  }

  async listActions(userId, { status = undefined, limit = 50 } = {}) {
    return [...this.actions.values()]
      .filter((row) => row.userId === userId && (!status || row.status === status))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, Math.min(200, Math.max(1, limit)))
      .map((row) => structuredClone(row));
  }

  async getAction(userId, id) {
    const row = this.actions.get(id);
    return row?.userId === userId ? structuredClone(row) : null;
  }

  async claimAction(userId, id) {
    const row = this.actions.get(id);
    if (!row || row.userId !== userId) throw new NotFoundError("Approval action was not found.");
    if (row.status !== "pending") throw new ConflictError(`Action cannot be approved from status '${row.status}'.`);
    row.status = "executing";
    row.claimedAt = this.now().toISOString();
    return structuredClone(row);
  }

  async updateAction(userId, id, patch) {
    const row = this.actions.get(id);
    if (!row || row.userId !== userId) throw new NotFoundError("Approval action was not found.");
    Object.assign(row, patch, { updatedAt: this.now().toISOString() });
    return structuredClone(row);
  }

  async createInterview(userId, session) {
    const id = randomUUID();
    const saved = { ...session, id, userId, status: "in_progress", startedAt: this.now().toISOString(), answers: [] };
    this.interviews.set(id, saved);
    return structuredClone(saved);
  }

  async getInterview(userId, id) {
    const row = this.interviews.get(id);
    return row?.userId === userId ? structuredClone(row) : null;
  }

  async updateInterview(userId, id, patch) {
    const row = this.interviews.get(id);
    if (!row || row.userId !== userId) throw new NotFoundError("Interview session was not found.");
    Object.assign(row, patch, { updatedAt: this.now().toISOString() });
    return structuredClone(row);
  }

  async addInterviewAnswer(userId, interviewId, answer) {
    const row = this.interviews.get(interviewId);
    if (!row || row.userId !== userId) throw new NotFoundError("Interview session was not found.");
    const saved = { ...answer, id: randomUUID(), createdAt: this.now().toISOString() };
    row.answers.push(saved);
    return structuredClone(saved);
  }

  async updateInterviewAnswer(userId, interviewId, answerId, patch) {
    const session = this.interviews.get(interviewId);
    if (!session || session.userId !== userId) throw new NotFoundError("Interview session was not found.");
    const answer = session.answers.find((item) => item.id === answerId);
    if (!answer) throw new NotFoundError("Interview answer was not found.");
    Object.assign(answer, patch, { updatedAt: this.now().toISOString() });
    return structuredClone(answer);
  }

  async listInterviewAnswers(userId, interviewId) {
    const session = this.interviews.get(interviewId);
    if (!session || session.userId !== userId) throw new NotFoundError("Interview session was not found.");
    return structuredClone(session.answers);
  }

  async claimDailyRun(userId, runKey) {
    const key = `${userId}:${runKey}`;
    const current = this.dailyRunLocks.get(key);
    if (current && ["running", "completed"].includes(current.status)) return false;
    this.dailyRunLocks.set(key, { userId, runKey, status: "running", claimedAt: this.now().toISOString() });
    return true;
  }

  async completeDailyRunLock(userId, runKey, { status, runId = null } = {}) {
    const key = `${userId}:${runKey}`;
    const current = this.dailyRunLocks.get(key);
    if (!current || current.userId !== userId) throw new NotFoundError("Daily run lock was not found.");
    this.dailyRunLocks.set(key, { ...current, status, runId, updatedAt: this.now().toISOString() });
    return structuredClone(this.dailyRunLocks.get(key));
  }

  async createRun(userId, run) {
    const id = randomUUID();
    const saved = { ...run, id, userId, status: "running", startedAt: this.now().toISOString() };
    this.runs.set(id, saved);
    return structuredClone(saved);
  }

  async finishRun(userId, id, patch) {
    const row = this.runs.get(id);
    if (!row || row.userId !== userId) throw new NotFoundError("Agent run was not found.");
    Object.assign(row, patch, { finishedAt: this.now().toISOString() });
    return structuredClone(row);
  }
}
