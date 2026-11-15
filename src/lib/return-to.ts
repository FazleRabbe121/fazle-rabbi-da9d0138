/**
 * Remembers which private area (recipe book or ZENVIK-AGENT) the visitor was heading to,
 * so the shared passcode gate and sign-in screen can send them back there afterwards.
 * Only known in-app paths are accepted (no open redirects).
 */
export const PRIVATE_AREAS = ["/dashboard", "/zenvik-agent"] as const;
export type PrivateArea = (typeof PRIVATE_AREAS)[number];
const KEY = "fr-private-return-to";

const isArea = (v: unknown): v is PrivateArea => typeof v === "string" && (PRIVATE_AREAS as readonly string[]).includes(v);

export function setReturnTo(path: string) {
  if (typeof window === "undefined") return;
  const clean = path.replace(/\/+$/, "") || "/";
  const area = PRIVATE_AREAS.find((a) => clean === a || clean.endsWith(a));
  if (area) sessionStorage.setItem(KEY, area);
}
export function getReturnTo(): PrivateArea {
  if (typeof window === "undefined") return "/dashboard";
  const v = sessionStorage.getItem(KEY);
  return isArea(v) ? v : "/dashboard";
}
