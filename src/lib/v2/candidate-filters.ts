/**
 * Function and location filters, and the intent signal, for the candidate list.
 *
 * These exist on the v1 page and were dropped from the redesign. Converging the
 * route without them would ship a downgrade: a recruiter filtering by location
 * today would find no way to do it.
 */
export interface FilterableRow {
  jobTitle?: string | null;
  location?: string | null;
  intentScore?: number | null;
}

export interface Filters {
  fn?: string;
  location?: string;
  highIntentOnly?: boolean;
}

/** Anything above this is worth a recruiter reaching out to first. */
export const HIGH_INTENT = 60;

const clean = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function filterOptions(rows: FilterableRow[]): { functions: string[]; locations: string[] } {
  return {
    functions: clean(rows.map((r) => r.jobTitle)),
    locations: clean(rows.map((r) => r.location)),
  };
}

export function applyFilters<T extends FilterableRow>(rows: T[], f: Filters): T[] {
  return rows.filter((r) => {
    if (f.fn && (r.jobTitle ?? "").trim() !== f.fn) return false;
    if (f.location && (r.location ?? "").trim() !== f.location) return false;
    // Unknown intent is not low intent. Padding a high-intent list with people
    // nobody has scored would send a recruiter at the wrong candidates first.
    if (f.highIntentOnly && (r.intentScore ?? -1) < HIGH_INTENT) return false;
    return true;
  });
}
