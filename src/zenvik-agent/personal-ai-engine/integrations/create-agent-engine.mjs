import { CareerAgentPlatform } from "../agents/career-agent-platform.mjs";
import { createAgentRequestHandler } from "../http/create-agent-handler.mjs";
import { OllamaChatClient } from "../llm/ollama-client.mjs";
import { createSourcesFromEnv } from "../jobs/configure-sources.mjs";
import { assertHostAppAdapter } from "./host-app-contract.mjs";

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Bootstrap the engine inside the existing app's backend. The existing app
 * provides its real database repository, authentication, CV and Gmail adapters.
 */
export function createAgentEngine({ env = process.env, repository, host, authorizeRequest, fetchImpl = globalThis.fetch }) {
  assertHostAppAdapter(host);
  if (!repository) throw new TypeError("A production repository adapter using the existing database is required.");
  const provider = String(env.AGENT_MODEL_PROVIDER || "ollama").toLowerCase();
  let model = null;
  if (provider === "ollama") {
    model = new OllamaChatClient({
      baseUrl: env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api",
      model: env.OLLAMA_MODEL,
      timeoutMs: positiveInt(env.OLLAMA_TIMEOUT_MS, 90_000),
      keepAlive: env.OLLAMA_KEEP_ALIVE || "10m",
      bearerToken: env.OLLAMA_BEARER_TOKEN || null,
      fetchImpl,
    });
  } else if (provider !== "none") {
    throw new TypeError("Unsupported model provider. This kit intentionally defaults to Ollama and has no paid AI API fallback.");
  }
  const sources = createSourcesFromEnv(env, { fetchImpl });
  const platform = new CareerAgentPlatform({
    repository,
    model,
    host,
    sources,
    policy: {
      maxStepsPerRun: positiveInt(env.AGENT_MAX_STEPS_PER_RUN, 18),
      maxSourcesPerRun: positiveInt(env.AGENT_MAX_SOURCES_PER_RUN, 30),
      maxJobsPerSource: positiveInt(env.AGENT_MAX_JOBS_PER_SOURCE, 250),
      maxRunDurationMs: positiveInt(env.AGENT_MAX_RUN_DURATION_MS, 300_000),
      allowExternalEmailSend: String(env.AGENT_ALLOW_APPROVED_EMAIL_SEND || "false").toLowerCase() === "true",
      requireApprovalForExternalActions: true,
      allowBrowserFormSubmission: false,
      allowAutonomousAccountCreation: false,
      allowCodeExecution: false,
    },
  });
  const handler = createAgentRequestHandler({
    platform,
    authorizeRequest,
    schedulerSecret: env.AGENT_SCHEDULER_SECRET,
  });
  return { platform, handler, model, sources };
}
