/**
 * Sanitize user-supplied search/location strings before using in Supabase
 * .ilike() / .or() to avoid accidental wildcard injection and special chars.
 * Supabase query builder parameterizes values; this is a defensive layer for
 * concatenated filter strings.
 */
const SEARCH_DANGEROUS = /[%_\\,().'"]/g;
const LOCATION_DANGEROUS = /[%_\\'"]/g;

export function sanitizeSearchQuery(value: string): string {
  return value.replace(SEARCH_DANGEROUS, "").trim();
}

export function sanitizeLocationQuery(value: string): string {
  return value.replace(LOCATION_DANGEROUS, "").trim();
}
