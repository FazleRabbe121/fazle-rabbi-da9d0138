import { ValidationError } from "../core/errors.mjs";
import { assertDocumentQuality, inspectDocument } from "./document-quality.mjs";
import { renderPdfKit } from "./pdf-renderer.mjs";

const ALLOWED_TYPES = new Set(["guide", "report", "letter", "cv", "manual", "book", "training", "interview-prep", "general"]);
const systemPrompt = `You are a professional document writer and editor. Return ONLY valid JSON matching this schema: {"title":string,"subtitle":string,"description":string,"author":string,"dateLabel":string,"includeToc":boolean,"sections":[{"heading":string,"paragraphs":string[],"bullets":string[],"table":{"headers":string[],"rows":string[][]}|null}],"sources":[{"title":string,"url":string,"reference":string}]}. Write coherent, useful, well-structured content. Never invent citations, credentials, legal rules, job offers, or facts. Mark uncertain information clearly. For user-provided material, preserve its meaning and do not add unsupported claims. Use the requested language. Do not include markdown fences.`;

function parseModelJson(result) {
  const text = typeof result === "string" ? result : result?.text ?? result?.response ?? "";
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")); }
  catch { throw new ValidationError("The writing model did not return valid document JSON."); }
}

export class DocumentIntelligenceService {
  constructor({ model, renderer = renderPdfKit, repository, maxPromptChars = 30000, quality = {} }) {
    if (!model || !["generate", "generateJSON", "generateText"].some((method) => typeof model[method] === "function")) throw new TypeError("A model with generateJSON(), generateText(), or generate() is required.");
    this.model = model; this.renderer = renderer; this.repository = repository; this.maxPromptChars = maxPromptChars; this.quality = quality;
  }

  async createDocument({ userId, instruction, language = "English", type = "general", sourceMaterial = "", audience = "general reader", tone = "professional", requireSources = false, minWords = 80 }) {
    if (!userId) throw new ValidationError("userId is required.");
    if (!instruction?.trim()) throw new ValidationError("A document instruction is required.");
    if (!ALLOWED_TYPES.has(type)) throw new ValidationError("Unsupported document type.");
    const payload = { instruction: instruction.slice(0, 12000), language, type, audience, tone, sourceMaterial: sourceMaterial.slice(0, this.maxPromptChars) };
    let generated;
    if (typeof this.model.generateJSON === "function") {
      generated = await this.model.generateJSON({ system: systemPrompt, user: payload, temperature: 0.25 });
    } else if (typeof this.model.generateText === "function") {
      generated = await this.model.generateText({ system: systemPrompt, user: JSON.stringify(payload), temperature: 0.25 });
    } else if (typeof this.model.generate === "function") {
      generated = await this.model.generate({ system: systemPrompt, prompt: JSON.stringify(payload), temperature: 0.25, format: "json" });
    } else {
      throw new TypeError("Model must implement generateJSON(), generateText(), or generate().");
    }
    const document = typeof generated === "object" && generated !== null ? generated : parseModelJson(generated);
    document.author ||= "Prepared with CareerPilot AI";
    const qualityReport = inspectDocument(document, { requireSources, minWords });
    if (!qualityReport.passed) throw new ValidationError("Generated document did not pass quality checks.", qualityReport);
    const pdf = await this.renderer(document);
    if (!Buffer.isBuffer(pdf) || pdf.length < 100) throw new ValidationError("PDF renderer returned an invalid or empty file.");
    const record = { userId, title: document.title, type, mimeType: "application/pdf", byteLength: pdf.length, qualityReport, createdAt: new Date().toISOString() };
    const saved = this.repository?.save ? await this.repository.save({ ...record, pdf }) : null;
    return { document, qualityReport, pdf, filename: `${slugify(document.title)}.pdf`, record: saved || record };
  }

  async reviewDocument(document, options = {}) { return assertDocumentQuality(document, { ...this.quality, ...options }); }
}

function slugify(value) { return String(value || "document").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 80).toLowerCase() || "document"; }
