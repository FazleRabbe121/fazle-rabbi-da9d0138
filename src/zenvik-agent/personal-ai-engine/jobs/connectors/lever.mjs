import { AgentError } from "../../core/errors.mjs";

export class LeverJobBoardConnector {
  constructor({ site, employer, region = "global", timeoutMs = 20_000, fetchImpl = globalThis.fetch }) {
    if (!site) throw new TypeError("A Lever public site slug is required.");
    if (!new Set(["global", "eu"]).has(region)) throw new TypeError("Lever region must be 'global' or 'eu'.");
    this.site = site;
    this.employer = employer || site;
    this.region = region;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.id = `lever:${region}:${site}`;
    this.type = "lever_official_board";
    this.name = employer || site;
    this.sourceUrl = `https://jobs.lever.co/${encodeURIComponent(site)}`;
  }

  async fetchJobs({ limit = 250 } = {}) {
    const host = this.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
    const url = `https://${host}/v0/postings/${encodeURIComponent(this.site)}?mode=json`;
    let response;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new AgentError("Lever postings API could not be reached.", { code: "SOURCE_FETCH_FAILED", status: 502, details: { source: this.id, cause: String(error) } });
    }
    if (!response.ok) throw new AgentError(`Lever returned HTTP ${response.status}.`, { code: "SOURCE_HTTP_ERROR", status: 502, details: { source: this.id } });
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload.slice(0, Math.max(1, Math.min(250, Number(limit) || 250))) : [];
    return rows.map((job) => ({
      id: job.id,
      externalId: String(job.id || ""),
      title: job.text || "",
      employer: this.employer,
      location: job.categories?.location || job.categories?.allLocations || "",
      description: [job.descriptionPlain, job.additionalPlain, ...(job.lists || []).map((list) => `${list.text || ""} ${(list.content || []).join(" ")}`)].filter(Boolean).join("\n"),
      url: job.hostedUrl || job.applyUrl,
      publishedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    }));
  }
}
