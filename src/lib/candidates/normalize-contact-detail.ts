/** Coerce API/DB contact fields (string or numeric) for display and tel:/mailto: links. */
export function normalizeContactDetail(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "bigint") {
    const s = value.toString().trim();
    return s.length > 0 ? s : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const s = String(value).trim();
    return s.length > 0 ? s : null;
  }
  if (typeof value === "string") {
    const s = value.trim();
    return s.length > 0 ? s : null;
  }
  return null;
}
