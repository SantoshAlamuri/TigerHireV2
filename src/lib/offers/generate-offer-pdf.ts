import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const LINE_HEIGHT = 13;
const MAX_LINE_CHARS = 92;
const FOOTER_GAP = 40;

export function stripHtmlToPlainText(html: string): string {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const withBreaks = noScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return withBreaks
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, "\n")
    .trim();
}

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

function buildBodyLines(plainOfferText: string): { text: string; bold: boolean }[] {
  const rawLines = plainOfferText.replace(/\r\n/g, "\n").split("\n");
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
    for (const w of wrapLine(trimmed)) {
      lines.push({ text: w, bold: isHeading });
    }
  }
  return lines;
}

type EmbedFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

function drawWatermark(page: ReturnType<PDFDocument["addPage"]>, font: EmbedFont) {
  const text = "SIGNED COPY";
  const size = 44;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: PAGE_WIDTH / 2 - w / 2,
    y: PAGE_HEIGHT / 2,
    size,
    font,
    color: rgb(0.82, 0.82, 0.84),
    opacity: 0.22,
    rotate: degrees(-34),
  });
}

function drawPageNumber(
  page: ReturnType<PDFDocument["addPage"]>,
  font: EmbedFont,
  n: number,
  total: number,
) {
  const label = `Page ${n} of ${total}`;
  const size = 9;
  const w = font.widthOfTextAtSize(label, size);
  page.drawText(label, {
    x: PAGE_WIDTH - MARGIN - w,
    y: 28,
    size,
    font,
    color: rgb(0.45, 0.48, 0.52),
  });
}

function layoutLinesOnPages(
  doc: PDFDocument,
  font: EmbedFont,
  bold: EmbedFont,
  lines: { text: string; bold: boolean }[],
): void {
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawWatermark(page, font);
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawWatermark(page, font);
    y = PAGE_HEIGHT - MARGIN;
  };

  for (const row of lines) {
    const f = row.bold ? bold : font;
    const size = row.bold ? 12 : 10;
    const lineHeight = LINE_HEIGHT * (size / 10);
    if (!row.text) {
      y -= lineHeight * 0.45;
      continue;
    }
    if (y < MARGIN + FOOTER_GAP) {
      newPage();
    }
    page.drawText(row.text, {
      x: MARGIN,
      y,
      size,
      font: f,
      color: rgb(0.1, 0.1, 0.12),
    });
    y -= lineHeight;
  }
}

function formatSignedAtIst(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function drawCertificateBox(
  doc: PDFDocument,
  font: EmbedFont,
  bold: EmbedFont,
  params: {
    companyName: string;
    roleTitle: string;
    signerName: string;
    signedAt: Date;
    signerIp: string;
    signerUserAgent: string;
    documentHash: string;
  },
): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawWatermark(page, font);

  const ua = params.signerUserAgent.trim().slice(0, 80);
  const certLines: { text: string; bold: boolean }[] = [
    { text: "SIGNING CERTIFICATE", bold: true },
    { text: "", bold: false },
    { text: `Document: Offer of Employment — ${params.roleTitle}`, bold: false },
    { text: `Candidate: ${params.signerName}`, bold: false },
    { text: `Company: ${params.companyName}`, bold: false },
    { text: "", bold: false },
    { text: `Accepted by: ${params.signerName}`, bold: false },
    { text: `Date: ${formatSignedAtIst(params.signedAt)} IST`, bold: false },
    { text: `IP Address: ${params.signerIp}`, bold: false },
    { text: `Browser: ${ua}`, bold: false },
    { text: `Document Hash (SHA-256): ${params.documentHash}`, bold: false },
    { text: "", bold: false },
    {
      text: "This document was signed electronically and is legally binding under the Information Technology Act, 2000 (India).",
      bold: false,
    },
  ];

  const boxPad = 10;
  const boxLeft = MARGIN - boxPad;
  const boxWidth = PAGE_WIDTH - 2 * (MARGIN - boxPad);
  const boxBottom = MARGIN;
  const boxHeight = 260;
  const innerTop = boxBottom + boxHeight - 16;

  page.drawRectangle({
    x: boxLeft,
    y: boxBottom,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0.55, 0.58, 0.62),
    borderWidth: 1,
  });

  let y = innerTop;
  const innerLeft = MARGIN + 6;
  for (const row of certLines) {
    const f = row.bold ? bold : font;
    const size = row.bold ? 12 : 9;
    const lineHeight = LINE_HEIGHT * (size / 9);
    if (!row.text) {
      y -= lineHeight * 0.45;
      continue;
    }
    for (const w of wrapLine(row.text)) {
      if (y < boxBottom + FOOTER_GAP) break;
      page.drawText(w, {
        x: innerLeft,
        y,
        size,
        font: f,
        color: rgb(0.12, 0.14, 0.18),
      });
      y -= lineHeight;
    }
  }
}

export async function generateSignedOfferPdf(params: {
  companyName: string;
  roleTitle: string;
  documentHtml: string;
  signerName: string;
  signedAt: Date;
  signerIp: string;
  signerUserAgent: string;
  documentHash: string;
}): Promise<Uint8Array> {
  const plain = stripHtmlToPlainText(params.documentHtml);
  const headerLines: { text: string; bold: boolean }[] = [
    { text: params.companyName, bold: true },
    { text: `Offer of Employment — ${params.roleTitle}`, bold: true },
    { text: "", bold: false },
  ];
  const bodyLines = [...headerLines, ...buildBodyLines(plain)];

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  layoutLinesOnPages(doc, font, bold, bodyLines);
  drawCertificateBox(doc, font, bold, params);

  const allPages = doc.getPages();
  const total = allPages.length;
  let i = 1;
  for (const p of allPages) {
    drawPageNumber(p, font, i, total);
    i += 1;
  }

  return doc.save();
}
