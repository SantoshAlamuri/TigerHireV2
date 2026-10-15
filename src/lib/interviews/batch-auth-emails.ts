import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve primary emails for auth user ids (service-role client only). */
export async function batchAuthEmailsByUserIds(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(userIds.filter(Boolean))];
  await Promise.all(
    uniq.map(async (uid) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(uid);
        if (!error && data.user?.email) {
          out.set(uid, String(data.user.email).trim());
        }
      } catch {
        /* ignore missing users */
      }
    }),
  );
  return out;
}
