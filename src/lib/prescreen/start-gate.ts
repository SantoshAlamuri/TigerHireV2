import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { isPrescreenGateEnabled } from "@/lib/prescreen/flag";
import { resolvePrescreenChannel } from "@/lib/prescreen/resolve-channel";

/**
 * Start the per-channel prescreen gate after an application is created.
 * Awaited so gate_status='pending' is set before callers enqueue scoring.
 * No-op when the org's screening default mode is not WhatsApp.
 */
export async function startPrescreenGateBestEffort(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    candidateId: string;
    applicationId: string;
    organisationId: string;
    source?: string;
    phone?: string | null;
  },
): Promise<void> {
  try {
    if (!(await isPrescreenGateEnabled(args.organisationId))) return;

    let phone = args.phone ?? null;
    const { data: candidateRow } = await supabase
      .from("candidates")
      .select("phone")
      .eq("id", args.candidateId)
      .maybeSingle();
    if (!phone) {
      phone = (candidateRow as { phone?: string | null } | null)?.phone ?? null;
    }

    const channel = resolvePrescreenChannel(args.source, phone);

    const { routePrescreenAfterApplication } = await import("@/lib/prescreen/channel-router");
    await routePrescreenAfterApplication({
      admin: supabase,
      jobId: args.jobId,
      candidateId: args.candidateId,
      applicationId: args.applicationId,
      organisationId: args.organisationId,
      channel,
      phone,
    });
  } catch (err) {
    logger.warn("[prescreen] gate start failed (non-fatal)", {
      jobId: args.jobId,
      candidateId: args.candidateId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
