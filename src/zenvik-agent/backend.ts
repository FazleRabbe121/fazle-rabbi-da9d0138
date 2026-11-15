/**
 * ZENVIK-AGENT backend bridge (integration layer — no business logic).
 *
 * The CCD views call their Express server with relative URLs such as `/api/jobs/...`.
 * On static hosting (GitHub Pages / Lovable) that server does not exist, so this shim:
 *  - forwards `/api/*` and `/internal/*` calls to VITE_ZENVIK_API_URL when it is set
 *    (e.g. http://localhost:3000 while `bun run zenvik:server` is running), or
 *  - answers them locally with a JSON 503 "Backend not connected" response and emits
 *    a `zenvik-agent:backend` window event so the shell can show a friendly notice.
 * No API key is ever read or sent here; keys live only in the server's environment.
 */
export const BACKEND_EVENT = "zenvik-agent:backend";
export const BACKEND_MESSAGE =
  "Backend not connected. This feature needs the ZENVIK-AGENT server, which does not run on the static website.";

const API_URL = String(import.meta.env.VITE_ZENVIK_API_URL ?? "").trim().replace(/\/+$/, "");
export const backendConfigured = API_URL !== "";
const SERVER_PREFIXES = ["/api/", "/internal/"];

export interface BackendEventDetail {
  path: string;
  reason: "not-configured" | "unreachable";
}

function serverPath(input: RequestInfo | URL): string | null {
  let raw: string;
  if (typeof input === "string") raw = input;
  else if (input instanceof URL) raw = input.href;
  else raw = input.url;
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.origin !== window.location.origin) return null;
      path = u.pathname + u.search;
    } catch {
      return null;
    }
  }
  return SERVER_PREFIXES.some((p) => path.startsWith(p)) ? path : null;
}

function notify(detail: BackendEventDetail) {
  window.dispatchEvent(new CustomEvent<BackendEventDetail>(BACKEND_EVENT, { detail }));
}

function notConnected(path: string, reason: BackendEventDetail["reason"]): Response {
  notify({ path, reason });
  const body = { success: false, ok: false, error: BACKEND_MESSAGE, message: BACKEND_MESSAGE, backendNotConnected: true };
  return new Response(JSON.stringify(body), {
    status: 503,
    statusText: "Backend not connected",
    headers: { "Content-Type": "application/json" },
  });
}

/** Installs the fetch bridge; returns a function that removes it again. */
export function installBackendShim(): () => void {
  const original = window.fetch.bind(window);
  const shim: typeof fetch = async (input, init) => {
    const path = serverPath(input);
    if (!path) return original(input, init);
    if (!backendConfigured) return notConnected(path, "not-configured");
    const target = API_URL + path;
    try {
      return input instanceof Request ? await original(new Request(target, input), init) : await original(target, init);
    } catch (err) {
      if (init?.signal?.aborted) throw err;
      return notConnected(path, "unreachable");
    }
  };
  window.fetch = shim;
  return () => {
    if (window.fetch === shim) window.fetch = original;
  };
}
