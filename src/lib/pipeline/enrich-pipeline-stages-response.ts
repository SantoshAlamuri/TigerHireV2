import type { SupabaseClient } from "@supabase/supabase-js";
import { batchAuthEmailsByUserIds } from "@/lib/interviews/batch-auth-emails";

export type PipelineStageRowBase = {
  id: string;
  job_id: string;
  stage_name: string;
  stage_order: number;
  stage_type?: string | null;
  sla_days: number | null;
  is_locked: boolean;
  notify_candidate: boolean;
  color: string | null;
  notify_email_body: string | null;
  interviewer_email: string | null;
  interviewer_name: string | null;
  feedback_template_id?: string | null;
  interviewer_user_id?: string | null;
};

export type InterviewerSummary = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type PipelineStageApiRow = PipelineStageRowBase & {
  interviewer: InterviewerSummary | null;
};

export async function enrichPipelineStagesWithInterviewers(
  admin: SupabaseClient,
  rows: PipelineStageRowBase[],
): Promise<PipelineStageApiRow[]> {
  const uids = rows.map((r) => r.interviewer_user_id).filter((x): x is string => Boolean(x));
  const emailByUser = await batchAuthEmailsByUserIds(admin, uids);
  let profileById = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  if (uids.length > 0) {
    const uniq = [...new Set(uids)];
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", uniq);
    profileById = new Map(
      (data ?? []).map((p) => [
        p.id as string,
        {
          full_name: (p.full_name as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        },
      ]),
    );
  }

  return rows.map((r) => {
    const uid = r.interviewer_user_id?.trim() || null;
    if (!uid) {
      return { ...r, interviewer_user_id: r.interviewer_user_id ?? null, interviewer: null };
    }
    const pr = profileById.get(uid);
    return {
      ...r,
      interviewer_user_id: uid,
      interviewer: {
        user_id: uid,
        full_name: pr?.full_name ?? null,
        email: emailByUser.get(uid) ?? null,
        avatar_url: pr?.avatar_url ?? null,
      },
    };
  });
}
