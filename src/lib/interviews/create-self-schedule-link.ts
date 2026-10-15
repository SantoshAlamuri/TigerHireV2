import type { SupabaseClient } from "@supabase/supabase-js";
import { newScheduleTokenPair } from "@/lib/interviews/schedule-token-crypto";
import { safeNotifyRecruiterSelfScheduleLinkCreated } from "@/lib/calendar/scheduling-recruiter-notify";

export type CreateSelfScheduleLinkInput = {
  admin: SupabaseClient;
  jobId: string;
  baseUrl: string;
  pipelineCandidateId?: string | null;
  expiresInHours?: number;
  createdBy?: string | null;
  notifyRecruiter?: boolean;
};

export type CreateSelfScheduleLinkResult = {
  url: string;
  expiresAt: string;
  candidateSpecific: boolean;
};

/**
 * Inserts an interview_schedule_tokens row and returns the public booking URL.
 */
export async function createSelfScheduleLink(
  input: CreateSelfScheduleLinkInput,
): Promise<CreateSelfScheduleLinkResult> {
  const pcId = input.pipelineCandidateId ?? null;
  const { raw, hash } = newScheduleTokenPair();
  const hours = input.expiresInHours ?? 168;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);

  const { error: insErr } = await input.admin.from("interview_schedule_tokens").insert({
    job_id: input.jobId,
    pipeline_candidate_id: pcId,
    token_hash: hash,
    expires_at: expiresAt.toISOString(),
    created_by: input.createdBy ?? null,
  });
  if (insErr) {
    throw new Error(insErr.message);
  }

  const base = input.baseUrl.replace(/\/$/, "");
  const candidateSpecific = pcId !== null;

  if (input.notifyRecruiter !== false) {
    safeNotifyRecruiterSelfScheduleLinkCreated({
      jobId: input.jobId,
      actorUserId: input.createdBy ?? null,
      candidateSpecific,
    });
  }

  return {
    url: `${base}/schedule/${raw}`,
    expiresAt: expiresAt.toISOString(),
    candidateSpecific,
  };
}
