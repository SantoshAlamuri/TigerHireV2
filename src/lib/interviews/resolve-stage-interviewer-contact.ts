import type { SupabaseClient } from "@supabase/supabase-js";
import { batchAuthEmailsByUserIds } from "@/lib/interviews/batch-auth-emails";

export async function resolvePipelineStageInterviewerContact(
  admin: SupabaseClient,
  stage: {
    interviewer_user_id?: string | null;
    interviewer_email?: string | null;
    interviewer_name?: string | null;
  },
): Promise<{ email: string | null; name: string | null }> {
  const uid = stage.interviewer_user_id?.trim();
  if (uid) {
    const map = await batchAuthEmailsByUserIds(admin, [uid]);
    const email = map.get(uid) ?? null;
    let name = (stage.interviewer_name ?? "").trim() || null;
    if (!name) {
      const { data } = await admin.from("profiles").select("full_name").eq("id", uid).maybeSingle();
      name = ((data?.full_name as string | null) ?? "").trim() || null;
    }
    return { email, name };
  }
  return {
    email: stage.interviewer_email?.trim() || null,
    name: stage.interviewer_name?.trim() || null,
  };
}
