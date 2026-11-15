import { ProviderUnavailableError } from "../core/errors.mjs";

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function parseJsonContent(content) {
  if (typeof content !== "string") throw new Error("Model response did not contain text content.");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

/** Ollama's local REST API client. It sends no API key for local inference. */
export class OllamaChatClient {
  constructor({
    baseUrl = "http://127.0.0.1:11434/api",
    model,
    timeoutMs = 90_000,
    keepAlive = "10m",
    bearerToken = null,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (!model) throw new TypeError("OLLAMA_MODEL must name a model already installed on the Ollama host.");
    if (typeof fetchImpl !== "function") throw new TypeError("A Fetch API implementation is required.");
    const url = new URL(baseUrl);
    if (!new Set(["http:", "https:"]).has(url.protocol)) throw new TypeError("Ollama base URL must use HTTP or HTTPS.");
    this.baseUrl = trimSlash(url.toString());
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.keepAlive = keepAlive;
    this.bearerToken = bearerToken;
    this.fetchImpl = fetchImpl;
  }

  async #request(path, body) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: body ? "POST" : "GET",
        headers: { ...(body ? { "content-type": "application/json" } : {}), accept: "application/json", ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderUnavailableError("Cannot reach the configured Ollama host. Check that it is online and reachable from the backend.", {
        cause: error instanceof Error ? error.message : String(error),
        baseUrl: this.baseUrl,
      });
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 1200);
      throw new ProviderUnavailableError(`Ollama returned HTTP ${response.status}.`, { status: response.status, detail });
    }
    try {
      return await response.json();
    } catch {
      throw new ProviderUnavailableError("Ollama returned an invalid JSON response.");
    }
  }

  async generateText({ system, user, temperature = 0.2 }) {
    const payload = await this.#request("/chat", {
      model: this.model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) },
      ],
      stream: false,
      keep_alive: this.keepAlive,
      options: { temperature },
    });
    const content = payload?.message?.content;
    if (typeof content !== "string") throw new ProviderUnavailableError("Ollama response did not include message.content.");
    return content;
  }

  async generateJSON({ system, user, temperature = 0.1 }) {
    const payload = await this.#request("/chat", {
      model: this.model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) },
      ],
      format: "json",
      stream: false,
      keep_alive: this.keepAlive,
      options: { temperature },
    });
    try {
      return parseJsonContent(payload?.message?.content);
    } catch (error) {
      throw new ProviderUnavailableError("The local model did not return valid JSON for a structured task.", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async health() {
    const payload = await this.#request("/tags");
    const models = Array.isArray(payload?.models) ? payload.models : [];
    return { provider: "ollama-self-hosted", ok: true, configuredModel: this.model, modelInstalled: models.some((item) => item?.name === this.model || item?.model === this.model) };
  }
}
