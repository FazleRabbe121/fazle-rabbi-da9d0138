import { ValidationError } from "../core/errors.mjs";

const words = (value) => String(value || "").trim().split(/\s+/u).filter(Boolean).length;

/** Deterministic content checks. These checks do not prove factual accuracy. */
export function inspectDocument(document, { requireSources = false, minWords = 80 } = {}) {
  const issues = [];
  const warnings = [];
  if (!document || typeof document !== "object") throw new ValidationError("Document must be an object.");
  if (!String(document.title || "").trim()) issues.push({ code: "MISSING_TITLE", message: "A document title is required." });
  if (!Array.isArray(document.sections) || document.sections.length === 0) issues.push({ code: "NO_SECTIONS", message: "At least one content section is required." });
  const headings = new Set();
  let totalWords = 0;
  let paragraphs = 0;
  for (const [index, section] of (document.sections || []).entries()) {
    if (!String(section.heading || "").trim()) issues.push({ code: "MISSING_HEADING", message: `Section ${index + 1} has no heading.` });
    const normalized = String(section.heading || "").trim().toLocaleLowerCase();
    if (normalized && headings.has(normalized)) warnings.push({ code: "DUPLICATE_HEADING", message: `Repeated heading: ${section.heading}` });
    headings.add(normalized);
    for (const paragraph of section.paragraphs || []) { totalWords += words(paragraph); paragraphs++; }
    for (const item of section.bullets || []) { totalWords += words(item); }
    for (const row of section.table?.rows || []) for (const cell of row) totalWords += words(cell);
  }
  if (totalWords < minWords) warnings.push({ code: "SHORT_CONTENT", message: `Document contains ${totalWords} words; expected at least ${minWords}.` });
  if (paragraphs === 0) warnings.push({ code: "NO_PROSE", message: "Document has no prose paragraphs." });
  if (requireSources && !(document.sources || []).some((source) => source.url || source.reference)) {
    issues.push({ code: "SOURCES_REQUIRED", message: "Research document requires at least one traceable source." });
  }
  const score = Math.max(0, Math.min(100, 100 - issues.length * 25 - warnings.length * 7));
  return { passed: issues.length === 0, score, wordCount: totalWords, issues, warnings, disclaimer: "Automated structural review only; it does not establish factual correctness, legal validity, or completeness." };
}

export function assertDocumentQuality(document, options) {
  const report = inspectDocument(document, options);
  if (!report.passed) throw new ValidationError("Document quality checks failed.", report);
  return report;
}
