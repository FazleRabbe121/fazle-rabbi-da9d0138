import test from "node:test";
import assert from "node:assert/strict";
import { inspectDocument, assertDocumentQuality } from "../../src/personal-ai-engine/documents/document-quality.mjs";

const good = { title: "A useful guide", sections: [{ heading: "Introduction", paragraphs: ["This is a sufficiently detailed paragraph containing useful information for a reader who wants to understand the subject and apply the guidance in practice."], bullets: ["First practical action", "Second practical action"] }], sources: [{ title: "Official source", url: "https://example.org" }] };

test("document quality accepts structured content", () => {
  const report = inspectDocument(good, { minWords: 10 });
  assert.equal(report.passed, true);
  assert.ok(report.score >= 90);
});

test("document quality rejects missing title and sections", () => {
  const report = inspectDocument({ title: "", sections: [] });
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((issue) => issue.code === "MISSING_TITLE"));
  assert.throws(() => assertDocumentQuality({ title: "", sections: [] }), /quality checks failed/i);
});

test("research mode requires traceable sources", () => {
  const report = inspectDocument(good, { requireSources: true, minWords: 10 });
  assert.equal(report.passed, true);
  const missing = inspectDocument({ ...good, sources: [] }, { requireSources: true, minWords: 10 });
  assert.equal(missing.passed, false);
});
