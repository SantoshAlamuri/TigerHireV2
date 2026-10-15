/**
 * RFC-4180 CSV rendering, shared by the payout exports.
 *
 * This existed verbatim in two export routes before the payout statement made it
 * three. One copy, so a quoting fix lands everywhere at once.
 */
export function toCsv(headers: string[], rows: Record<string, unknown>[], keys: string[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(keys.map((k) => escape(row[k])).join(","));
  }
  return lines.join("\n");
}

export function csvResponseHeaders(filename: string): Record<string, string> {
  return {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename=${filename}`,
  };
}
