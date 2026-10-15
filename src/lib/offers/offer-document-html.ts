import crypto from "node:crypto";

/**
 * Build immutable HTML for an offer at send time (stored in offers.document_content).
 * Body is plain text from the org template after interpolation; wrapped for safe display.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFrozenOfferLetterHtml(params: {
  companyName: string;
  roleTitle: string;
  plainBody: string;
}): string {
  const body = escapeHtml(params.plainBody);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Offer — ${escapeHtml(params.roleTitle)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.55; margin: 0; padding: 24px; background: #fafafa; }
    .card { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px 24px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; color: #0f172a; }
    .sub { font-size: 0.9rem; color: #64748b; margin-bottom: 20px; }
    .body { white-space: pre-wrap; font-size: 0.95rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(params.companyName)}</h1>
    <p class="sub">Offer of employment — ${escapeHtml(params.roleTitle)}</p>
    <div class="body">${body}</div>
  </div>
</body>
</html>`;
}

export function sha256HexOfUtf8(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
