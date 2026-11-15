/**
 * Type boundary for the ZENVIK-AGENT app. The real module (src/zenvik-agent/ZenvikAgentApp.tsx)
 * is resolved by the Vite plugin in src/zenvik-agent/vite-plugin.ts and type-checked with its
 * own, looser tsconfig (src/zenvik-agent/tsconfig.json) instead of the portfolio's strict one.
 */
declare module "virtual:zenvik-agent" {
  import type { ComponentType } from "react";
  const ZenvikAgentApp: ComponentType;
  export default ZenvikAgentApp;
}
