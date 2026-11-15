import { GreenhouseJobBoardConnector } from "./connectors/greenhouse.mjs";
import { LeverJobBoardConnector } from "./connectors/lever.mjs";

function parseArray(value, label) {
  if (!value) return [];
  let parsed;
  try { parsed = JSON.parse(value); }
  catch { throw new TypeError(`${label} must be valid JSON.`); }
  if (!Array.isArray(parsed)) throw new TypeError(`${label} must be a JSON array.`);
  return parsed;
}

/** Builds only configured public board connectors; it does not crawl the open web. */
export function createConfiguredPublicJobSources({ greenhouseBoards = [], leverSites = [], fetchImpl = globalThis.fetch } = {}) {
  const sources = [];
  for (const item of greenhouseBoards) {
    if (item?.enabled === false) continue;
    if (!item?.boardToken) throw new TypeError("Every Greenhouse source requires boardToken.");
    sources.push(new GreenhouseJobBoardConnector({ boardToken: item.boardToken, employer: item.employer, fetchImpl }));
  }
  for (const item of leverSites) {
    if (item?.enabled === false) continue;
    if (!item?.site) throw new TypeError("Every Lever source requires site.");
    sources.push(new LeverJobBoardConnector({ site: item.site, employer: item.employer, region: item.region || "global", fetchImpl }));
  }
  return sources;
}

export function createSourcesFromEnv(env = process.env, options = {}) {
  return createConfiguredPublicJobSources({
    greenhouseBoards: parseArray(env.GREENHOUSE_BOARD_TOKENS_JSON || "[]", "GREENHOUSE_BOARD_TOKENS_JSON"),
    leverSites: parseArray(env.LEVER_SITES_JSON || "[]", "LEVER_SITES_JSON"),
    ...options,
  });
}
