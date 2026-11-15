import { createRequire } from "node:module";
import { ValidationError } from "../core/errors.mjs";

const require = createRequire(import.meta.url);

function safeText(value) { return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, ""); }

/** PDFKit renderer. Provide a Unicode TTF/OTF via fontPath for Bengali and other non-Latin scripts. */
export async function renderPdfKit(document, { fontPath = process.env.DOCUMENT_FONT_PATH, pageSize = "A4", margins = 54 } = {}) {
  let PDFDocument;
  try { PDFDocument = require("pdfkit"); }
  catch { throw new Error("PDF rendering dependency missing. Run npm install; pdfkit is required."); }
  if (!Array.isArray(document.sections)) throw new ValidationError("Document sections are required for PDF rendering.");
  return await new Promise((resolve, reject) => {
    try {
      const pdf = new PDFDocument({ size: pageSize, margins: { top: margins, bottom: margins + 22, left: margins, right: margins }, bufferPages: true, info: { Title: safeText(document.title), Author: safeText(document.author || "CareerPilot AI Document Studio"), Subject: safeText(document.description || "") } });
      const chunks = [];
      pdf.on("data", (chunk) => chunks.push(chunk));
      pdf.on("error", reject);
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      if (fontPath) pdf.font(fontPath); else pdf.font("Helvetica");
      const title = safeText(document.title);
      pdf.fontSize(25).fillColor("#14243a").text(title, { align: "left" });
      pdf.moveDown(0.5);
      if (document.subtitle) pdf.fontSize(13).fillColor("#52647a").text(safeText(document.subtitle));
      if (document.author) pdf.moveDown(0.4).fontSize(10).fillColor("#52647a").text(`Prepared for: ${safeText(document.author)}`);
      if (document.dateLabel) pdf.text(safeText(document.dateLabel));
      pdf.moveDown(1.5).strokeColor("#d8e0e9").moveTo(margins, pdf.y).lineTo(540, pdf.y).stroke();
      if (document.includeToc !== false && document.sections.length > 2) {
        pdf.addPage(); pdf.fontSize(18).fillColor("#14243a").text("Contents"); pdf.moveDown();
        document.sections.forEach((section, i) => pdf.fontSize(10).fillColor("#26384d").text(`${i + 1}. ${safeText(section.heading)}`, { indent: 8, paragraphGap: 5 }));
      }
      for (const section of document.sections) {
        pdf.addPage();
        pdf.fontSize(17).fillColor("#173b63").text(safeText(section.heading), { keepTogether: true });
        pdf.moveDown(0.5);
        for (const paragraph of section.paragraphs || []) { pdf.fontSize(10.5).fillColor("#202b38").text(safeText(paragraph), { align: "left", lineGap: 3 }); pdf.moveDown(0.55); }
        for (const item of section.bullets || []) { pdf.fontSize(10.5).fillColor("#202b38").text(`•  ${safeText(item)}`, { indent: 12, lineGap: 2 }); pdf.moveDown(0.2); }
        if (section.table?.headers?.length) {
          pdf.moveDown(0.5);
          const allRows = [section.table.headers, ...(section.table.rows || [])];
          for (const row of allRows) {
            const cells = row.map((cell) => safeText(cell)).join("   |   ");
            pdf.fontSize(8.5).fillColor("#26384d").text(cells, { lineGap: 2 });
            pdf.moveDown(0.2);
          }
        }
      }
      if (document.sources?.length) {
        pdf.addPage(); pdf.fontSize(17).fillColor("#173b63").text("Sources & References"); pdf.moveDown();
        for (const source of document.sources) pdf.fontSize(9).fillColor("#26384d").text(`${safeText(source.title || source.reference || "Reference")}\n${safeText(source.url || "")}`, { link: source.url || undefined, underline: Boolean(source.url), lineGap: 2 }).moveDown(0.5);
      }
      const range = pdf.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        pdf.switchToPage(i);
        const y = pdf.page.height - 35;
        pdf.fontSize(8).fillColor("#718096").text(safeText(document.footer || "CareerPilot Document Studio"), margins, y, { lineBreak: false });
        pdf.text(`Page ${i + 1} of ${range.count}`, margins, y, { align: "right", lineBreak: false });
      }
      pdf.end();
    } catch (error) { reject(error); }
  });
}
