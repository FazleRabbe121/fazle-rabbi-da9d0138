import { AgentError, AuthorizationError, ValidationError } from "../core/errors.mjs";
import { executeScheduledDailyRun } from "../scheduler/daily-run.mjs";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function readBody(request) {
  const maxBytes = 256 * 1024;
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new ValidationError("Request body is too large.");
  let raw;
  try { raw = await request.text(); }
  catch { throw new ValidationError("Request body could not be read."); }
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new ValidationError("Request body is too large.");
  try { return JSON.parse(raw || "{}"); }
  catch { throw new ValidationError("Request body must be valid JSON."); }
}

/**
 * Framework-neutral Fetch API handler. Mount this at the host server's route
 * boundary; pass the app's existing authentication and authorization logic.
 */
export function createAgentRequestHandler({ platform, authorizeRequest, schedulerSecret }) {
  if (!platform || typeof authorizeRequest !== "function") throw new TypeError("platform and authorizeRequest are required.");

  return async function handleAgentRequest(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "");
      const method = request.method.toUpperCase();

      if (path === "/internal/agent/v1/scheduler/daily" && method === "POST") {
        if (!schedulerSecret) throw new AuthorizationError("Scheduler secret is not configured.");
        const result = await executeScheduledDailyRun({
          authorizationHeader: request.headers.get("authorization"),
          expectedSecret: schedulerSecret,
          platform,
        });
        return json(result);
      }

      const identity = await authorizeRequest(request);
      if (!identity?.userId) throw new AuthorizationError("Sign in is required.");
      const userId = identity.userId;

      if (path === "/api/agent/v1/documents/pdf" && method === "POST") {
        if (!platform.documents || typeof platform.documents.createDocument !== "function") {
          return json({ error: "Document Intelligence is not configured." }, 503);
        }
        const body = await readBody(request);
        const result = await platform.documents.createDocument({
          userId,
          instruction: body.instruction,
          language: body.language || "English",
          type: body.type || "general",
          sourceMaterial: body.sourceMaterial || "",
          audience: body.audience || "general reader",
          tone: body.tone || "professional",
          requireSources: body.requireSources === true,
          minWords: Number.isInteger(body.minWords) ? Math.max(0, Math.min(body.minWords, 50000)) : 80,
        });
        return new Response(result.pdf, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="${result.filename}"`,
            "content-length": String(result.pdf.length),
            "cache-control": "private, no-store",
            "x-document-quality-score": String(result.qualityReport.score),
          },
        });
      }
      if (path === "/api/agent/v1/documents/review" && method === "POST") {
        if (!platform.documents || typeof platform.documents.reviewDocument !== "function") return json({ error: "Document Intelligence is not configured." }, 503);
        const body = await readBody(request);
        return json({ qualityReport: await platform.documents.reviewDocument(body.document, body.options || {}) });
      }
      if (path === "/api/agent/v1/health" && method === "GET") {
        let modelHealth = { reachable: false, modelInstalled: false };
        if (platform.model && typeof platform.model.health === "function") {
          try {
            const status = await platform.model.health();
            modelHealth = { reachable: status.ok === true, modelInstalled: status.modelInstalled === true, provider: status.provider || "unknown" };
          } catch {
            modelHealth = { reachable: false, modelInstalled: false, provider: "ollama-self-hosted" };
          }
        }
        return json({
          ok: true,
          engine: "careerpilot-agent-engine",
          model: platform.model ? "configured" : "not_configured",
          modelHealth,
          approvedEmailSendEnabled: platform.policy?.allowExternalEmailSend === true,
          automaticEmailSend: false,
        });
      }
      if (path === "/api/agent/v1/missions/execute" && method === "POST") {
        const body = await readBody(request);
        return json(await platform.runMission({ userId, goal: body.goal, context: body.context || {}, fallbackPlan: body.fallbackPlan || [] }));
      }
      if (path === "/api/agent/v1/jobs/discover" && method === "POST") {
        const body = await readBody(request);
        return json(await platform.discoverJobs({ userId, roles: body.roles, countries: body.countries }));
      }
      if (path === "/api/agent/v1/jobs" && method === "GET") {
        const limit = Number(url.searchParams.get("limit") || 100);
        const status = url.searchParams.get("status") || undefined;
        return json({ jobs: await platform.listJobs({ userId, limit, status }) });
      }
      if (path === "/api/agent/v1/daily/run" && method === "POST") {
        return json(await platform.runDailyCycle({ userId }));
      }
      if (path === "/api/agent/v1/actions" && method === "GET") {
        const limit = Number(url.searchParams.get("limit") || 50);
        return json({ actions: await platform.listPendingApprovals({ userId, limit }) });
      }
      if (path === "/api/agent/v1/applications/draft" && method === "POST") {
        const body = await readBody(request);
        return json(await platform.prepareApplicationDraft({ userId, vacancyId: body.vacancyId, cvId: body.cvId }), 201);
      }
      if (path === "/api/agent/v1/applications/request-send" && method === "POST") {
        const body = await readBody(request);
        return json(await platform.requestApplicationSendApproval({ userId, draftId: body.draftId }), 201);
      }
      const actionMatch = path.match(/^\/api\/agent\/v1\/actions\/([^/]+)\/(approve|reject)$/);
      if (actionMatch && method === "POST") {
        const [, actionId, decision] = actionMatch;
        if (decision === "approve") return json(await platform.approveAction({ userId, actionId }));
        const body = await readBody(request);
        return json(await platform.rejectAction({ userId, actionId, reason: body.reason }));
      }
      if (path === "/api/agent/v1/interviews/start" && method === "POST") {
        const body = await readBody(request);
        return json(await platform.startInterview({ ...body, userId }), 201);
      }
      const finishMatch = path.match(/^\/api\/agent\/v1\/interviews\/([^/]+)\/finish$/);
      if (finishMatch && method === "POST") {
        return json(await platform.finishInterview({ userId, sessionId: finishMatch[1] }));
      }
      const answerMatch = path.match(/^\/api\/agent\/v1\/interviews\/([^/]+)\/answers$/);
      if (answerMatch && method === "POST") {
        const body = await readBody(request);
        return json(await platform.submitInterviewAnswer({ ...body, userId, sessionId: answerMatch[1] }), 201);
      }
      return json({ error: "Route not found." }, 404);
    } catch (error) {
      const status = Number(error?.status || error?.statusCode || 500);
      const safeStatus = status >= 400 && status < 600 ? status : 500;
      return json({
        error: error instanceof Error ? error.message : "Unexpected agent error.",
        code: error instanceof AgentError ? error.code : (safeStatus === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
        ...(error instanceof AgentError && error.details ? { details: error.details } : {}),
      }, safeStatus);
    }
  };
}
