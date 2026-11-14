import test from "node:test";
import assert from "node:assert/strict";
import { DocumentIntelligenceService } from "../../src/personal-ai-engine/documents/document-service.mjs";

const generated = {
  title: "Bartender Interview Preparation",
  subtitle: "A practical preparation guide",
  sections: [
    { heading: "Preparation", paragraphs: ["Prepare clear examples from real hospitality experience. Structure answers with a situation, action and result. Practice concise English responses and ask for clarification when needed."], bullets: ["Review the job description", "Prepare examples"] },
  ],
  sources: [],
};

test("document service generates, quality-checks and renders a PDF buffer", async () => {
  let saved;
  const service = new DocumentIntelligenceService({
    model: { generateJSON: async ({ user }) => { assert.equal(user.language, "English"); return generated; } },
    renderer: async (doc) => { assert.equal(doc.title, generated.title); return Buffer.from("%PDF-1.7\n" + "x".repeat(200)); },
    repository: { save: async (record) => { saved = record; return { id: "doc-1" }; } },
  });
  const result = await service.createDocument({ userId: "user-1", instruction: "Create an interview guide", minWords: 10 });
  assert.equal(result.record.id, "doc-1");
  assert.equal(result.pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(result.qualityReport.passed, true);
  assert.equal(saved.mimeType, "application/pdf");
});

test("document service rejects invalid type and malformed model output", async () => {
  const service = new DocumentIntelligenceService({ model: { generateText: async () => "not json" }, renderer: async () => Buffer.from("x") });
  await assert.rejects(() => service.createDocument({ userId: "u", instruction: "Write", type: "unknown" }), /Unsupported document type/);
  await assert.rejects(() => service.createDocument({ userId: "u", instruction: "Write" }), /valid document JSON/);
});

test("document service enforces research citations when requested", async () => {
  const service = new DocumentIntelligenceService({ model: { generateJSON: async () => generated }, renderer: async () => Buffer.from("%PDF-" + "x".repeat(200)) });
  await assert.rejects(() => service.createDocument({ userId: "u", instruction: "Research", requireSources: true, minWords: 10 }), /quality checks/);
});
