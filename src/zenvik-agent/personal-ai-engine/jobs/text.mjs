export function stripHtml(input = "") {
  return String(input)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeJobUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|gh_src$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

export function stableVacancyKey(job) {
  const source = String(job.sourceId || job.source || "unknown").toLowerCase();
  const externalId = job.externalId ? String(job.externalId).trim() : "";
  const canonicalUrl = normalizeJobUrl(job.url);
  const identity = externalId || canonicalUrl || `${job.employer || ""}|${job.title || ""}|${job.location || ""}`.toLowerCase();
  return `${source}:${identity}`;
}

export function matchesTarget(job, { roles = [], countries = [] } = {}) {
  const roleTerms = roles.map((value) => String(value).trim().toLowerCase()).filter(Boolean);
  const countryTerms = countries.map((value) => String(value).trim().toLowerCase()).filter(Boolean);
  const title = String(job.title || "").toLowerCase();
  const location = String(job.location || "").toLowerCase();
  const roleMatch = roleTerms.length === 0 || roleTerms.some((term) => title.includes(term));
  const countryMatch = countryTerms.length === 0 || countryTerms.some((term) => location.includes(term));
  return roleMatch && countryMatch;
}

export function normalizeVacancy(raw, source) {
  const url = normalizeJobUrl(raw.url || raw.hostedUrl || raw.absolute_url);
  return {
    sourceId: source.id,
    sourceType: source.type,
    externalId: String(raw.externalId ?? raw.id ?? "").trim() || null,
    title: stripHtml(raw.title || "").slice(0, 300),
    employer: stripHtml(raw.employer || source.employer || source.name || "").slice(0, 300),
    location: stripHtml(raw.location || "").slice(0, 300),
    description: stripHtml(raw.description || "").slice(0, 30_000),
    url,
    publishedAt: raw.publishedAt || null,
    sourceUrl: url,
    sourceBoardUrl: source.sourceUrl || null,
    firstSeenAt: null,
    lastSeenAt: null,
  };
}
