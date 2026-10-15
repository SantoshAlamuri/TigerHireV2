import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { TOP_MATCHES_LIMIT, FITSCORE_MIN_THRESHOLD } from "./constants";

export interface SendFitScoreResultsInput {
  phone: string;
  candidateId: string;
  candidateName: string;
}

/**
 * Send top FitScore matches to candidate via WhatsApp (PRD: "Send FitScore Results via WhatsApp").
 */
export async function sendFitScoreResultsViaWhatsApp(
  input: SendFitScoreResultsInput,
): Promise<void> {
  const { phone, candidateId, candidateName } = input;
  const supabase = createSupabaseAdmin();

  const { data: topMatches } = await supabase
    .from("fit_scores")
    .select(
      `
      id,
      overall_score,
      jobs (
        id,
        title,
        organisations ( name )
      )
    `,
    )
    .eq("candidate_id", candidateId)
    .or("is_test_run.eq.false,is_test_run.is.null")
    .gte("overall_score", FITSCORE_MIN_THRESHOLD)
    .order("overall_score", { ascending: false })
    .limit(TOP_MATCHES_LIMIT);

  const name = candidateName?.split(" ")[0] || "there";

  if (!topMatches?.length) {
    await sendWhatsAppMessage(
      phone,
      `Hi ${name}! Your profile is live on TigerHire. We'll alert you as matching roles come in. Reply MATCHES anytime to check.`,
    );
    return;
  }

  let msg = `Hi ${name}! Your FitScore is ready.\n\n`;
  msg += `We found ${topMatches.length} role(s) you match strongly:\n\n`;

  topMatches.forEach((m, i) => {
    const jobRow = Array.isArray(m.jobs) ? m.jobs[0] : m.jobs;
    const job = jobRow as {
      title?: string;
      organisations?: { name?: string } | { name?: string }[];
    } | null;
    const orgs = job?.organisations;
    const orgRow = Array.isArray(orgs) ? orgs[0] : orgs;
    const company = orgRow?.name ?? "a company";
    const title = job?.title ?? "Role";
    msg += `${i + 1}. *${m.overall_score}/100* — ${title} at ${company}\n`;
  });

  const n = topMatches.length;
  const replyHint = n <= 3 ? `Reply *1*, *2*, or *3*` : `Reply *1* to *${n}*`;
  msg += `\n${replyHint} to express interest — we'll send your profile to the recruiter.\n`;
  msg += `\nKnow someone job hunting? Forward this number — they get a free FitScore too.`;

  await sendWhatsAppMessage(phone, msg);
}
