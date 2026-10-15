export type LegacySearchParams = Record<string, string | string[] | undefined>;

/** Keep bookmarked filters and candidate context when consolidating a route. */
export function legacyRouteTarget(path: string, searchParams: LegacySearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}
