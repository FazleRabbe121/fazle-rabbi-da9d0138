import { AgentError } from "../../core/errors.mjs";

export class GreenhouseJobBoardConnector {
  constructor({ boardToken, employer, timeoutMs = 20_000, fetchImpl = globalThis.fetch }) {
    if (!boardToken) throw new TypeError("A Greenhouse public board token is required.");
    this.boardToken = boardToken;
    this.employer = employer || boardToken;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.id = `greenhouse:${boardToken}`;
    this.type = "greenhouse_official_board";
    this.name = employer || boardToken;
    this.sourceUrl = `https://boards.greenhouse.io/${encodeURIComponent(boardToken)}`;
  }

  async fetchJobs({ limit = 250 } = {}) {
    const safeLimit = Math.max(1, Math.min(250, Number(limit) || 250));
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(this.boardToken)}/jobs?content=true`;
    let response;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new AgentError("Greenhouse job board could not be reached.", { code: "SOURCE_FETCH_FAILED", status: 502, details: { source: this.id, cause: String(error) } });
    }
    if (!response.ok) throw new AgentError(`Greenhouse returned HTTP ${response.status}.`, { code: "SOURCE_HTTP_ERROR", status: 502, details: { source: this.id } });
    const payload = await response.json();
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs.slice(0, safeLimit) : [];
    return jobs.map((job) => ({
      id: job.id,
      externalId: String(job.id),
      title: job.title,
      employer: this.employer,
      location: job.location?.name || "",
      description: job.content || "",
      url: job.absolute_url,
      publishedAt: job.updated_at || null,
    }));
  }
}
