const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const ESCAPE_RE = /[&<>"']/g;

/**
 * Escape HTML special characters to prevent XSS when interpolating
 * user-supplied values into HTML strings (e.g. email templates).
 */
export function escapeHtml(str: string): string {
  return str.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}
