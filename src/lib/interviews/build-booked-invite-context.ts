import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePipelineStageInterviewerContact } from "@/lib/interviews/resolve-stage-interviewer-contact";
import type { BookedInviteContext } from "@/lib/interviews/send-booked-invites";

export async function buildBookedInviteContext(
  supabase: SupabaseClient,
  input: {
    jobId: string;
    slotId: string;
    pipelineCandidateId: string;
    slotUserId?: string | null;
    slotStartAt: string;
    slotEndAt: string;
    interviewerEmailOverride?: string | null;
  },
): Promise<BookedInviteContext | null> {
  const { data: pcData } = await supabase
    .from("pipeline_candidates")
    .select("id, candidate_id, stage_id, candidates(name, email, phone)")
    .eq("id", input.pipelineCandidateId)
    .eq("job_id", input.jobId)
    .single();

  if (!pcData) return null;

  const { data: jobData } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", input.jobId)
    .single();

  let stageName = "Interview";
  let interviewerEmail: string | null =
    input.interviewerEmailOverride?.trim().toLowerCase() ?? null;
  let interviewerName: string | null = null;
  if (pcData.stage_id) {
    const { data: stageData } = await supabase
      .from("pipeline_stages")
      .select("stage_name, interviewer_email, interviewer_name, interviewer_user_id")
      .eq("id", pcData.stage_id as string)
      .eq("job_id", input.jobId)
      .maybeSingle();
    stageName = (stageData?.stage_name as string | undefined) ?? stageName;
    const resolved = await resolvePipelineStageInterviewerContact(supabase, {
      interviewer_user_id: stageData?.interviewer_user_id as string | null | undefined,
      interviewer_email: stageData?.interviewer_email as string | null | undefined,
      interviewer_name: stageData?.interviewer_name as string | null | undefined,
    });
    if (!interviewerEmail && resolved.email) {
      interviewerEmail = resolved.email.trim().toLowerCase();
    }
    interviewerName = resolved.name;
  }

  const slotUserId = input.slotUserId;
  if (slotUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, full_name, email")
      .eq("id", slotUserId)
      .maybeSingle();
    if (!interviewerName) {
      interviewerName = (profile?.full_name as string | undefined) ?? null;
    }
    const profileEmail = (profile?.email as string | undefined) ?? null;
    if (!interviewerEmail && profileEmail) interviewerEmail = profileEmail.trim().toLowerCase();
  }

  const candidate = pcData.candidates as {
    name?: string;
    email?: string;
    phone?: string;
  } | null;

  return {
    jobId: input.jobId,
    jobTitle: jobData?.title ?? "Interview",
    stageName,
    pipelineCandidateId: input.pipelineCandidateId,
    candidateId: (pcData.candidate_id as string | undefined) ?? null,
    candidateName: candidate?.name ?? null,
    candidateEmail: candidate?.email ?? null,
    candidatePhone: candidate?.phone ?? null,
    interviewerEmail,
    interviewerName,
    slotStartAt: input.slotStartAt,
    slotEndAt: input.slotEndAt,
    slotId: input.slotId,
  };
}
