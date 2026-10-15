/**
 * Build a redirect URL that carries the incoming query string forward, so
 * legacy/orphaned redirect pages don't drop context (returnTo, ref, parent,
 * utm_*) when they bounce a user to the canonical route.
 */
export function buildForwardUrl(
  base: string,
  params: Record<string, string | string[] | undefined>,
  defaults?: Record<string, string>,
): string {
  const search = new URLSearchParams();
  if (defaults) {
    for (const [key, value] of Object.entries(defaults)) search.set(key, value);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}
