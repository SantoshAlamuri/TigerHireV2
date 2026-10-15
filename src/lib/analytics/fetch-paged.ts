/**
 * Supabase PostgREST returns at most `pageSize` rows per request. Analytics metrics
 * must not silently under-count when orgs exceed a single page.
 */
export const ANALYTICS_PAGE_SIZE = 800;

const MAX_ANALYTICS_ROWS_SAFETY = 500_000;

export async function fetchAllSupabasePages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = ANALYTICS_PAGE_SIZE,
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) return { data: rows, error };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
    if (offset > MAX_ANALYTICS_ROWS_SAFETY) {
      return { data: rows, error: new Error("Analytics query exceeded safety cap") };
    }
  }
  return { data: rows, error: null };
}
