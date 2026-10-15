import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { ApplicationApplyError } from "@/lib/applications/application-apply-error";
import { ApplicationService } from "@/lib/services/ApplicationService";

export async function createApplicationForRolePick(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  phone: string,
  candidateId: string,
  jobId: string,
  context: Record<string, unknown>,
): Promise<{ ok: true; title: string } | { ok: false; message: string }> {
  try {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", jobId)
      .maybeSingle();
    const title = String(jobRow?.title ?? "this role");

    const directReferrerId =
      (context.direct_referrer_id as string | undefined) ??
      (context.referrer_referrers_id as string | undefined);
    const parentReferrerId = context.parent_referrer_id as string | undefined;

    await ApplicationService.create(supabase, candidateId, {
      jobId,
      interest: "interested",
      source: "whatsapp",
      directReferrerId,
      parentReferrerId,
    });
    return { ok: true, title };
  } catch (e) {
    if (e instanceof ApplicationApplyError) {
      if (e.code === "already_applied") {
        const { data: jobRow } = await supabase
          .from("jobs")
          .select("title")
          .eq("id", jobId)
          .maybeSingle();
        return { ok: true, title: String(jobRow?.title ?? "this role") };
      }
      return { ok: false, message: e.message };
    }
    logger.error("Role guided flow: application create failed", {
      error: String(e),
      jobId,
      candidateId,
    });
    return {
      ok: false,
      message: "Something went wrong submitting your application. Please try again.",
    };
  }
}
