import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrescreenGateEnabled } from "@/lib/prescreen/flag";
import { logger } from "@/lib/observability/logger";
import type { WhatsAppSession } from "./sessions";

export async function handlePrescreenReply(params: {
  admin: SupabaseClient;
  session: WhatsAppSession;
  jobId: string;
  candidateId: string;
  questionId: string;
  answer: string;
  passed: boolean;
}): Promise<void> {
  const gateStatus = params.passed ? "passed" : "failed";
  const { error } = await params.admin.from("prescreen_responses").upsert(
    {
      candidate_id: params.candidateId,
      job_id: params.jobId,
      question_id: params.questionId,
      answer: params.answer,
      passed: params.passed,
      gate_status: gateStatus,
    },
    { onConflict: "candidate_id,job_id,question_id" },
  );
  if (error) throw error;
  logger.info("[whatsapp-prescreen] response saved", {
    jobId: params.jobId,
    candidateId: params.candidateId,
    passed: params.passed,
  });
}

export async function shouldStartPrescreen(organisationId?: string | null): Promise<boolean> {
  return isPrescreenGateEnabled(organisationId);
}
