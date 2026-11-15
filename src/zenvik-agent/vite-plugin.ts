import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Resolves `virtual:zenvik-agent` to the ZENVIK-AGENT mount component (lazy-loaded by /zenvik-agent). */
export function zenvikAgentPlugin(): Plugin {
  const id = "virtual:zenvik-agent";
  return {
    name: "zenvik-agent-entry",
    enforce: "pre",
    resolveId(source) {
      return source === id ? path.join(here, "ZenvikAgentApp.tsx") : null;
    },
  };
}
