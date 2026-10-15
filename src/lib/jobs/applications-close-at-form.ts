/** Shared helpers for datetime-local fields bound to `jobs.applications_close_at`. */

export function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * @returns ISO string to set, `null` to clear an existing deadline, or `undefined` to leave unchanged.
 */
export function applicationsCloseAtFromForm(
  form: FormData,
  fieldName: string,
  hadDeadline: boolean,
): string | null | undefined {
  const raw = (form.get(fieldName) as string) ?? "";
  if (raw.trim()) {
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) return undefined;
    return new Date(raw).toISOString();
  }
  if (hadDeadline) return null;
  return undefined;
}
