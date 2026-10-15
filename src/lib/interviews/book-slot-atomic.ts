import { logger } from "@/lib/observability/logger";

type RpcLikeClient = {
  rpc?: (
    fn: string,
    args: { p_job_id: string; p_slot_id: string; p_pipeline_candidate_id: string },
  ) => any;
  from: (table: string) => any;
};
type RpcOnlyClient = {
  rpc?: (
    fn: string,
    args: { p_job_id: string; p_slot_id: string; p_pipeline_candidate_id: string },
  ) => any;
};

export type BookSlotAtomicErrorCode =
  | "slot_not_found"
  | "slot_unavailable"
  | "pipeline_candidate_not_found"
  | "pipeline_candidate_already_booked"
  | "unknown";

type BookSlotAtomicResult =
  | {
      ok: true;
      startAt: string;
      endAt: string | null;
      usedAtomicRpc: boolean;
    }
  | {
      ok: false;
      errorCode: BookSlotAtomicErrorCode;
      usedAtomicRpc: boolean;
    };

function isMissingBookRpcFunction(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? error ?? "");
  return (
    message.includes("th_book_interview_slot") &&
    (message.includes("Could not find the function") || message.includes("PGRST202"))
  );
}

export async function bookInterviewSlotAtomically(params: {
  supabase: RpcLikeClient;
  rpcClient?: RpcOnlyClient;
  jobId: string;
  slotId: string;
  pipelineCandidateId: string;
}): Promise<BookSlotAtomicResult> {
  const { supabase, rpcClient, jobId, slotId, pipelineCandidateId } = params;
  const rpcTarget = rpcClient ?? supabase;

  if (typeof rpcTarget.rpc === "function") {
    const { data: rpcData, error: rpcError } = await rpcTarget.rpc("th_book_interview_slot", {
      p_job_id: jobId,
      p_slot_id: slotId,
      p_pipeline_candidate_id: pipelineCandidateId,
    });
    if (rpcError && !isMissingBookRpcFunction(rpcError)) {
      logger.error("Atomic book RPC failed", { error: String(rpcError) });
      return { ok: false, errorCode: "unknown", usedAtomicRpc: true };
    }
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      const result = rpcData[0] as {
        success?: boolean;
        start_at?: string | null;
        end_at?: string | null;
        error_code?: BookSlotAtomicErrorCode | null;
      };
      if (result.success && result.start_at) {
        return {
          ok: true,
          startAt: result.start_at,
          endAt: result.end_at ?? null,
          usedAtomicRpc: true,
        };
      }
      return {
        ok: false,
        errorCode: result.error_code ?? "unknown",
        usedAtomicRpc: true,
      };
    }
  }

  const { data: slot, error: slotErr } = await supabase
    .from("interview_availability_slots")
    .select("id, start_at, end_at, status")
    .eq("id", slotId)
    .eq("job_id", jobId)
    .single();
  if (slotErr) {
    logger.error("Atomic-book fallback: failed to read slot", { error: String(slotErr) });
    return { ok: false, errorCode: "slot_not_found", usedAtomicRpc: false };
  }
  if (!slot) {
    return { ok: false, errorCode: "slot_not_found", usedAtomicRpc: false };
  }
  if (slot.status !== "available") {
    return { ok: false, errorCode: "slot_unavailable", usedAtomicRpc: false };
  }

  const { error: updateSlotErr } = await supabase
    .from("interview_availability_slots")
    .update({
      status: "booked",
      pipeline_candidate_id: pipelineCandidateId,
    })
    .eq("id", slotId)
    .eq("job_id", jobId);
  if (updateSlotErr) {
    logger.error("Atomic-book fallback: failed to update slot", { error: String(updateSlotErr) });
    return { ok: false, errorCode: "unknown", usedAtomicRpc: false };
  }

  const { error: updatePcErr } = await supabase
    .from("pipeline_candidates")
    .update({
      interview_scheduled_at: slot.start_at,
      reminder_sent_at: null,
      status: "in_progress",
    })
    .eq("id", pipelineCandidateId);
  if (updatePcErr) {
    await supabase
      .from("interview_availability_slots")
      .update({ status: "available", pipeline_candidate_id: null })
      .eq("id", slotId)
      .eq("job_id", jobId)
      .eq("pipeline_candidate_id", pipelineCandidateId);
    logger.error("Atomic-book fallback: failed to update pipeline candidate", {
      error: String(updatePcErr),
    });
    return { ok: false, errorCode: "unknown", usedAtomicRpc: false };
  }

  return {
    ok: true,
    startAt: slot.start_at as string,
    endAt: (slot.end_at as string | null | undefined) ?? null,
    usedAtomicRpc: false,
  };
}
