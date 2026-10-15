import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";
import { withSessionCAS } from "../sessions";
import { normalizeIndianPhone } from "../normalize-phone";
import { resolveOrCreateReferrerIdentityForFlow } from "../referral-handler";
import { formatJobList } from "./draft";
import type { ReferralCollectField, ReferralDraft, ReferrerProfile } from "./types";

const REFERRAL_DAILY_WINDOW_SECS = 24 * 60 * 60;

/**
 * End referral-mode context and move the thread into the job-seeker (apply) funnel.
 */
export async function switchToCandidateApplyFlow(
  referrerPhone: string,
  context: Record<string, unknown>,
  options?: {
    roleHint?: string;
    companyHint?: string;
    reason?: string;
  },
): Promise<void> {
  const nextContext: Record<string, unknown> = {
    ...context,
    referral_draft: null,
    next_field: null,
    awaiting_mode_choice: false,
    inbound_route: options?.reason ?? "switched_to_apply",
    apply_flow_started_at: new Date().toISOString(),
    pending_self_cv: true,
  };
  if (options?.roleHint) nextContext.apply_role_hint = options.roleHint;
  if (options?.companyHint) nextContext.apply_company_hint = options.companyHint;

  await withSessionCAS(referrerPhone, () => ({
    state: "cv_requested",
    context: nextContext,
  }));

  const roleLine = options?.roleHint
    ? ` I'll prioritise roles like ${options.roleHint}${options.companyHint ? ` at ${options.companyHint}` : ""}.`
    : "";
  await sendWhatsAppMessage(
    referrerPhone,
    `Got it — switching to job applications.${roleLine}\n\nSend your CV as a PDF in this chat. Reply REFER anytime if you want to refer a friend instead.`,
  );
}

export async function sendModeDisambiguation(referrerPhone: string): Promise<void> {
  await sendWhatsAppMessage(
    referrerPhone,
    "You're registered on TigerHire. What would you like to do?\n\n" +
      "• Reply REFER (or 2) to refer a friend — send their name or number\n" +
      "• Reply APPLY (or 1) to apply for jobs yourself — we'll ask for your CV\n\n" +
      "You can switch anytime.",
  );
}

export async function hasProfileWithPhone(
  normalizedPhone: string,
): Promise<ReferrerProfile | null> {
  const supabase = createSupabaseAdmin();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, organisation_id")
    .eq("phone", normalizedPhone)
    .maybeSingle();
  if (!profile?.id) return null;
  return {
    id: profile.id as string,
    full_name: (profile.full_name as string | null) ?? null,
    role: (profile.role as string | null) ?? null,
    organisation_id: (profile.organisation_id as string | null) ?? null,
  };
}

export async function greetReferrer(referrerPhone: string, name: string | null): Promise<void> {
  const who = name?.trim() ? name.trim().split(/\s+/)[0] : "there";
  await sendWhatsAppMessage(
    referrerPhone,
    `Hi ${who}! You can do two things here:\n\n` +
      `• REFER — send a friend's name, number, or CV to refer them\n` +
      `• APPLY — apply for jobs yourself (reply APPLY and send your CV)\n\n` +
      `To refer, send whatever you have about your friend. To apply for yourself, reply APPLY.`,
  );
}

export async function askForField(
  referrerPhone: string,
  field: ReferralCollectField,
  draft: ReferralDraft,
  jobs: Array<{ id: string; title: string; location: string | null }>,
): Promise<void> {
  switch (field) {
    case "candidate_name":
      await sendWhatsAppMessage(referrerPhone, "What's your friend's name?");
      break;
    case "candidate_phone": {
      const name = draft.candidate_name ?? "them";
      await sendWhatsAppMessage(
        referrerPhone,
        `What's ${name}'s WhatsApp number? (10-digit Indian mobile is fine)`,
      );
      break;
    }
    case "job_id": {
      const name = draft.candidate_name ?? "your friend";
      if (jobs.length === 0) {
        await sendWhatsAppMessage(
          referrerPhone,
          `No open roles are listed right now — we'll still reach out to ${name} on WhatsApp.`,
        );
        return;
      }
      await sendWhatsAppMessage(
        referrerPhone,
        `Which role are you referring ${name} for?\n${formatJobList(jobs)}\n\nReply with a number.`,
      );
      break;
    }
    default:
      break;
  }
}

export async function checkReferralDailyCap(
  referrerPhone: string,
  profile: ReferrerProfile,
): Promise<boolean> {
  const dailyCap = env.referralDailyCap;
  if (dailyCap <= 0) return true;

  const resolved = await resolveOrCreateReferrerIdentityForFlow(referrerPhone, profile);
  const capIdentityKey = resolved.directReferrerId ?? normalizeIndianPhone(referrerPhone);
  const cap = await checkRateLimit({
    key: `whatsapp-referral-daily:${capIdentityKey}`,
    limit: dailyCap,
    windowSecs: REFERRAL_DAILY_WINDOW_SECS,
  });
  if (cap.allowed) return true;

  await sendWhatsAppMessage(
    referrerPhone,
    "You've reached today's referral limit. Please try again tomorrow.",
  );
  return false;
}
