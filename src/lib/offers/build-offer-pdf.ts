import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const LINE_HEIGHT = 14;
const MAX_LINE_CHARS = 92;

// Fixed epoch so generated PDFs are byte-deterministic. pdf-lib otherwise embeds
// a live CreationDate/ModificationDate, which makes the content hash unstable
// (and made offer-pdf.test.ts flaky when two generations straddled a second).
const DETERMINISTIC_PDF_DATE = new Date("2020-01-01T00:00:00.000Z");

function wrapLine(line: string): string[] {
  if (line.length <= MAX_LINE_CHARS) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > MAX_LINE_CHARS) {
    let cut = rest.lastIndexOf(" ", MAX_LINE_CHARS);
    if (cut < MAX_LINE_CHARS * 0.5) cut = MAX_LINE_CHARS;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) out.push(rest);
  return out;
}

function sha256Base64Pdf(base64: string): string {
  return crypto.createHash("sha256").update(base64, "utf8").digest("hex");
}

/**
 * Render plain text (after template interpolation) into a PDF. Splits on newlines and wraps long lines.
 */
export async function buildOfferLetterPdfFromText(
  fullText: string,
): Promise<{ base64: string; contentHash: string }> {
  const doc = await PDFDocument.create();
  // Pin all metadata so identical input yields byte-identical output (stable contentHash).
  doc.setCreationDate(DETERMINISTIC_PDF_DATE);
  doc.setModificationDate(DETERMINISTIC_PDF_DATE);
  doc.setProducer("TigerHire");
  doc.setCreator("TigerHire");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const rawLines = fullText.replace(/\r\n/g, "\n").split("\n");
  const lines: { text: string; bold: boolean }[] = [];

  for (const raw of rawLines) {
    const trimmed = raw.trimEnd();
    if (!trimmed.trim()) {
      lines.push({ text: "", bold: false });
      continue;
    }
    const isHeading =
      trimmed === trimmed.toUpperCase() &&
      trimmed.length > 3 &&
      trimmed.length < 80 &&
      !trimmed.includes("{{");
    const wrapped = wrapLine(trimmed);
    for (const w of wrapped) {
      lines.push({ text: w, bold: isHeading });
    }
  }

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawParagraph = (text: string, useBold: boolean) => {
    if (!text) {
      y -= LINE_HEIGHT * 0.5;
      return;
    }
    const f = useBold ? bold : font;
    const size = useBold ? 13 : 11;
    if (y < MARGIN + LINE_HEIGHT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: f,
      color: rgb(0.1, 0.1, 0.12),
    });
    y -= LINE_HEIGHT * (size / 11);
  };

  for (const row of lines) {
    drawParagraph(row.text, row.bold);
  }

  const bytes = await doc.save();
  const base64 = Buffer.from(bytes).toString("base64");
  return { base64, contentHash: sha256Base64Pdf(base64) };
}
