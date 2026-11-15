import { timingSafeEqual } from "node:crypto";

export function secureSecretEquals(received, expected) {
  if (typeof received !== "string" || typeof expected !== "string" || !received || !expected) return false;
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called by Cloud Scheduler or the host app's durable scheduler. */
export async function executeScheduledDailyRun({ authorizationHeader, expectedSecret, platform }) {
  const received = String(authorizationHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!secureSecretEquals(received, expectedSecret)) {
    const error = new Error("Invalid scheduler credential.");
    error.status = 401;
    throw error;
  }
  return platform.runDailyCycleForEnabledUsers();
}
