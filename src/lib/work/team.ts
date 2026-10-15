/** Split pasted text into emails: commas, spaces, semicolons or new lines all work. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const parts = text
    .split(/[\s,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  const ok = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  return { valid: unique.filter(ok), invalid: unique.filter((e) => !ok(e)) };
}
