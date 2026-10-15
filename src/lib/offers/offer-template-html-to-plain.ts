/**
 * Convert template body (plain text or HTML from the rich editor) to plain text for pdf-lib.
 * Interpolation should run **before** this (tokens may sit inside HTML tags).
 */

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Heuristic: treat as HTML when it looks like markup (TipTap / hand-authored HTML).
 */
function looksLikeHtml(body: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(body.trim());
}

/**
 * Strip HTML-ish markup to a readable plain string for `buildOfferLetterPdfFromText`.
 */
export function offerTemplateBodyToPdfPlainText(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (!looksLikeHtml(trimmed)) return body;

  let s = trimmed;
  s = s.replace(/<\s*hr[^>]*\/?>/gi, "\n────────\n");
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\s*\/\s*td\s*>\s*<\s*td[^>]*>/gi, "  |  ");
  s = s.replace(/<\s*\/\s*tr\s*>/gi, "\n");
  s = s.replace(/<\s*li[^>]*>/gi, "\n• ");
  s = s.replace(/<\s*\/\s*li\s*>/gi, "\n");
  s = s.replace(/<\s*\/\s*p\s*>/gi, "\n\n");
  s = s.replace(/<\s*\/\s*h[1-6]\s*>/gi, "\n\n");
  s = s.replace(/<\s*\/\s*(div|section|article|blockquote)\s*>/gi, "\n");
  s = s.replace(/<\s*\/\s*(ul|ol)\s*>/gi, "\n");
  s = s.replace(/<\s*\/\s*table\s*>/gi, "\n\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeBasicEntities(s);
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
