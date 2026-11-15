/**
 * Conservative sponsorship classification. A label is never a legal decision.
 * "Confirmed" requires explicit positive wording on an official employer or
 * official vacancy source. A generic "non-EU welcome" statement is not enough.
 */
const EXPLICIT_POSITIVE = [
  /visa sponsorship (?:is|will be|can be)?\s*(?:available|provided|offered)\b/i,
  /(?:we|the employer|the company|employer) (?:will|can) sponsor (?:a |the )?(?:work )?(?:visa|work permit)/i,
  /work permit sponsorship (?:is|will be|can be)?\s*(?:available|provided|offered)\b/i,
  /(?:visa|work permit) sponsorship is available/i,
  /sponsorship for (?:a |the )?(?:work )?visa (?:is )?(?:available|provided|offered)/i,
];
const EXPLICIT_NEGATIVE = [
  /no visa sponsorship/i,
  /cannot sponsor (?:a |the )?(?:work )?visa/i,
  /unable to sponsor (?:a |the )?(?:work )?visa/i,
  /will not sponsor/i,
  /must already have (?:the )?right to work/i,
  /must have existing work authori[sz]ation/i,
];
const POSSIBLE = [
  /visa sponsorship.{0,60}considered/i,
  /visa sponsorship.{0,60}supported/i,
  /(?:we|the employer|the company|employer) may sponsor (?:a |the )?(?:work )?(?:visa|work permit)/i,
  /work permit (?:support|assistance|process)/i,
  /visa (?:support|assistance|process)/i,
  /non[- ]eu applicants? (?:are )?welcome/i,
  /applicants from non[- ]eu countries (?:are )?welcome/i,
  /international applicants? (?:are )?welcome/i,
  /relocation (?:and )?(?:work permit|visa)/i,
];

export function classifySponsorshipEvidence({ description = "", sourceType = "unknown", sourceUrl = null, title = "" } = {}) {
  const text = `${title}. ${description}`.replace(/\s+/g, " ").trim();
  const official = sourceType === "official_employer" || sourceType === "official_vacancy" || sourceType === "greenhouse_official_board" || sourceType === "lever_official_board";
  const negative = EXPLICIT_NEGATIVE.find((pattern) => pattern.test(text));
  if (negative) {
    return { status: "not_supported", confidence: "high", evidenceQuote: excerptAround(text, negative), sourceUrl, reason: "The source explicitly indicates sponsorship is unavailable or prior work authorisation is required." };
  }
  const positive = EXPLICIT_POSITIVE.find((pattern) => pattern.test(text));
  if (positive && official && sourceUrl) {
    return { status: "confirmed", confidence: "high", evidenceQuote: excerptAround(text, positive), sourceUrl, reason: "Explicit sponsorship wording was found on an official employer or vacancy source. Nationality and individual eligibility still require confirmation." };
  }
  if (positive) {
    return { status: "possible", confidence: "low", evidenceQuote: excerptAround(text, positive), sourceUrl, reason: "Positive wording exists, but the source is not classified as official or lacks a source URL." };
  }
  const possible = POSSIBLE.find((pattern) => pattern.test(text));
  if (possible) {
    return { status: "possible", confidence: "medium", evidenceQuote: excerptAround(text, possible), sourceUrl, reason: "The source mentions a related signal, but it does not explicitly guarantee employer sponsorship." };
  }
  return { status: "unknown", confidence: "none", evidenceQuote: null, sourceUrl, reason: "No reliable sponsorship statement was detected. Ask the employer directly; do not treat this as sponsorship." };
}

function excerptAround(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return null;
  const start = Math.max(0, match.index - 100);
  const end = Math.min(text.length, match.index + match[0].length + 120);
  return text.slice(start, end).trim();
}
