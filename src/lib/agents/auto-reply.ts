import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";

export interface AutoReplyInput {
  candidateId: string;
  channel?: "whatsapp";
}

function buildReplyMessage(firstName: string, topRole?: string | null): string {
  if (topRole) {
    return `Hi ${firstName}! We reviewed your profile and found a strong match: ${topRole}. Reply YES to get fast-tracked for next steps.`;
  }
  return `Hi ${firstName}! We reviewed your profile. You're now in our active talent pool and we'll send matching roles as they open.`;
}

export async function triggerAutoReplyAgent(
  input: AutoReplyInput,
): Promise<{ sent: boolean; reason?: string }> {
  const supabase = createSupabaseAdmin();
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, phone, full_name, name")
    .eq("id", input.candidateId)
    .single();

  if (!candidate?.phone) {
    return { sent: false, reason: "no_candidate_phone" };
  }

  const { data: topMatch } = await supabase
    .from("fit_scores")
    .select("jobs(title)")
    .eq("candidate_id", input.candidateId)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();

  const jobsData = topMatch?.jobs as { title?: string } | Array<{ title?: string }> | null;
  const topRole = Array.isArray(jobsData) ? jobsData[0]?.title : jobsData?.title;
  const displayName = (candidate.full_name ?? candidate.name ?? "there").split(" ")[0] ?? "there";
  const message = buildReplyMessage(displayName, topRole ?? null);

  const sendResult = await sendWhatsAppMessage(candidate.phone, message);
  if (!sendResult.success) {
    logger.warn("Auto-reply agent failed to send WhatsApp message", {
      candidateId: input.candidateId,
      error: sendResult.error,
    });
    return { sent: false, reason: sendResult.error ?? "send_failed" };
  }

  return { sent: true };
}
