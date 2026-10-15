import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { prescreenPendingSweepBufferHours, prescreenTimeoutHours } from "@/lib/prescreen/config";
import { finalizeTimeout } from "@/lib/prescreen/channel-router";
import { dispatchPrescreenMessage } from "@/lib/prescreen/dispatch";
import { postShortlistTimeoutAck } from "@/lib/prescreen/messages";
import { getApprovedJdBase, updateSession } from "@/lib/prescreen/repository";
import type { PrescreenChannel, PrescreenSession } from "@/lib/prescreen/types";

const MAX_SWEEP_PER_RUN = 200;

/**
 * Safety net: force-resolve prescreen sessions still open past
 * (timeout + buffer) hours — covers dropped/never-scheduled Inngest events.
 */
export async function sweepPendingPrescreens(
  admin: SupabaseClient,
): Promise<{ scanned: number; resolved: number }> {
  const cutoffMs =
    Date.now() - (prescreenTimeoutHours() + prescreenPendingSweepBufferHours()) * 3_600_000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const { data, error } = await admin
    .from("prescreen_sessions")
    .select(
      "id, application_id, job_id, candidate_id, channel, stage, state, current_question_index, questions_sent_at, reminder_sent_at, completed_at, created_at, updated_at",
    )
    .neq("state", "complete")
    .lt("questions_sent_at", cutoffIso)
    .limit(MAX_SWEEP_PER_RUN);

  if (error) throw error;
  const sessions = (data ?? []) as PrescreenSession[];
  if (sessions.length === 0) return { scanned: 0, resolved: 0 };

  let resolved = 0;
  for (const session of sessions) {
    const jdBase = await resolveJdBaseId(admin, session.job_id);
    if (!jdBase) {
      logger.warn("[prescreen-sweep] no approved JD base; skipping", { sessionId: session.id });
      continue;
    }
    try {
      if (session.stage === "post_shortlist") {
        const jd = await getApprovedJdBase(admin, session.job_id);
        const roleTitle = jd?.roleTitle ?? "this role";
        const { data: candidate } = await admin
          .from("candidates")
          .select("phone")
          .eq("id", session.candidate_id)
          .maybeSingle();
        await updateSession(admin, session.id, {
          state: "complete",
          completed_at: new Date().toISOString(),
        });
        await dispatchPrescreenMessage(
          {
            channel: session.channel as PrescreenChannel,
            phone: (candidate?.phone as string | null) ?? null,
          },
          postShortlistTimeoutAck(roleTitle),
        );
      } else {
        await finalizeTimeout({
          admin,
          jobId: session.job_id,
          candidateId: session.candidate_id,
          jdBaseDocumentId: jdBase,
          sessionId: session.id,
          channel: session.channel as PrescreenChannel,
          phone: null,
        });
      }
      resolved += 1;
    } catch (err) {
      logger.error("[prescreen-sweep] finalize failed", {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[prescreen-sweep] complete", { scanned: sessions.length, resolved });
  return { scanned: sessions.length, resolved };
}

async function resolveJdBaseId(admin: SupabaseClient, jobId: string): Promise<string | null> {
  const { data } = await admin
    .from("jd_base_documents")
    .select("id, version, approved_at")
    .eq("job_id", jobId)
    .not("approved_at", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
