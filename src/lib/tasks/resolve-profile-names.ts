import type { SupabaseClient } from "@supabase/supabase-js";

/** Batch-resolve profile ids to display names for task inbox rows. */
export async function resolveProfileNames(
  admin: SupabaseClient,
  profileIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...new Set([...profileIds].filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await admin.from("profiles").select("id, full_name").in("id", ids);
  if (error) return map;

  for (const row of data ?? []) {
    const id = row.id as string;
    const name = (row.full_name as string | null)?.trim();
    if (name) map.set(id, name);
  }
  return map;
}
