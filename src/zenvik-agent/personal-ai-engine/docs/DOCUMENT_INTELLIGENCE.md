# Document Intelligence & PDF Engine — v1.1.0

## Scope

Adds professional long-form writing and PDF export to the CareerPilot Agent Engine. It does not replace the host application's existing CV Library or document storage. The host application must supply its authenticated user identity, model client, persistence adapter and download UI.

## Capabilities

- Structured document generation using the configured self-hosted model (Ollama `generateJSON()` supported) or a compatible `generateText()` / `generate()` adapter.
- Document types: general, guide, report, letter, CV, manual, book, training and interview-prep.
- Sections, prose, bullet lists, simple tables, references, cover/title page, optional contents page, page numbers and footer.
- PDF rendering with PDFKit.
- Deterministic quality checks for title, sections, repeated headings, minimum content length, prose presence and source presence for research requests.
- Optional repository persistence adapter; generated PDF is returned as a Buffer for host-controlled storage/download.
- Authenticated HTTP routes: `POST /api/agent/v1/documents/pdf` and `POST /api/agent/v1/documents/review`.

## Install

```bash
npm install
```

`pdfkit` is a runtime dependency. Node.js 20+ is required.

## Unicode / Bengali fonts

PDFKit's built-in Helvetica font does not cover Bengali or many non-Latin scripts. For Bengali, Arabic, Hindi and other scripts, configure a legally usable Unicode TTF/OTF font on the server:

```env
DOCUMENT_FONT_PATH=/absolute/path/to/NotoSansBengali-Regular.ttf
```

For broad coverage, use a suitable Noto Sans family font. Ensure the font license permits server-side embedding. Do not assume the font is present on Cloud Run; package or mount it deliberately.

## API example

Authenticated request:

```http
POST /api/agent/v1/documents/pdf
Content-Type: application/json
Authorization: Bearer <host-session>
```

```json
{
  "instruction": "Create a professional 12-section bartender interview preparation guide based on the supplied notes.",
  "language": "English",
  "type": "interview-prep",
  "audience": "hospitality job applicant",
  "tone": "professional and practical",
  "sourceMaterial": "Paste approved notes or retrieved PDF excerpts here.",
  "requireSources": false,
  "minWords": 900
}
```

The response is `application/pdf`. The host UI should display the `x-document-quality-score` header as an automated structural score, not as a factual accuracy score.

## Model contract

Preferred: `model.generateJSON({ system, user, temperature })` returning a parsed object. OllamaChatClient already implements this contract. Fallbacks: `generateText()` returning JSON text or `generate()` returning JSON text/object.

## Quality and truthfulness

Automated QC checks structure and completeness only. It cannot certify factual accuracy. Research documents should set `requireSources: true` and the model must return source URLs/references. The host should optionally run a separate source-verification agent before final export. Never fabricate citations, qualifications, work-permit rules or employer sponsorship guarantees. Clearly label estimates and uncertainty.

## Persistence adapter

Pass `repository.save({ userId, title, type, mimeType, byteLength, qualityReport, createdAt, pdf })`. Implement this adapter against the existing host database/storage. Do not create a second unrelated CV/document library. Apply user-level access checks and retention rules.

## Tests

```bash
npm test
npm run check
```

Tests inject a fake PDF renderer and validate document generation/QC/service behavior. To verify actual PDF bytes in the deployed app, install dependencies and run an integration smoke test with PDFKit and a Unicode font configured.
