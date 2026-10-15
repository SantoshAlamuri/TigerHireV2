import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { captureConsentViaWhatsApp } from "@/lib/agents/consent";
import { sendReferralInvite, type ReferralJobContext } from "@/lib/whatsapp/templates";
import {
  referralUtilityTemplateIncludesConsent,
  sendWhatsAppOutbound,
} from "@/lib/whatsapp/send-outbound";
import { getPreferredJobShareUrl } from "@/lib/jobs/job-share-urls";
import { hasRecentInboundFromPhone } from "@/lib/whatsapp/message-log";
import { withSessionCAS } from "@/lib/whatsapp/sessions";
import { prepareSessionAfterEmployeeReferral } from "@/lib/whatsapp/sync-session-consent";
import type { ReferredCandidateReachResult } from "./types";

/**
 * Resolve the referred job's company name, title, and public apply link so the
 * referral invite names the real hiring company (not "TigerHire") and can carry
 * an apply link (Bug Report: Job Referral #1/#3). Returns undefined when the
 * referral isn't tied to a specific job (e.g. free-text WhatsApp referrals).
 */
async function resolveReferralJobContext(
  supabase: SupabaseClient,
  jobId: unknown,
): Promise<ReferralJobContext | undefined> {
  if (typeof jobId !== "string" || !jobId) return undefined;
  try {
    const { data } = await supabase
      .from("jobs")
      .select("title, organisations!jobs_organisation_id_fkey(name, slug)")
      .eq("id", jobId)
      .maybeSingle();
    if (!data) return undefined;
    const org = (data.organisations ?? null) as { name?: string; slug?: string } | null;
    return {
      jobTitle: (data.title as string | null) ?? undefined,
      companyName: org?.name ?? undefined,
      applyUrl: getPreferredJobShareUrl(jobId, org?.slug ?? null),
    };
  } catch {
    return undefined;
  }
}

/** First contact to a referred number must use an approved template (or open 24h window). */
export async function reachReferredCandidateOnWhatsApp(input: {
  supabase: SupabaseClient;
  candidatePhone: string;
  candidateName: string;
  referrerName: string;
  useReferralConsentFlow: boolean;
  candidateContext: Record<string, unknown>;
}): Promise<ReferredCandidateReachResult> {
  const {
    supabase,
    candidatePhone,
    candidateName,
    referrerName,
    useReferralConsentFlow,
    candidateContext,
  } = input;

  const referralJobContext = await resolveReferralJobContext(supabase, candidateContext.job_id);

  const tryUtilityFirstContact = async (): Promise<ReferredCandidateReachResult> => {
    const util = await sendWhatsAppOutbound({
      intent: "employee_referral_invite",
      phone: candidatePhone,
      candidateName,
      referrerName,
      supabase,
      referralJobContext,
    });
    if (util.success) {
      return {
        reached: true,
        via: `utility_${util.templateName ?? "th_application_received"}`,
        templateName: util.templateName,
      };
    }
    return { reached: false, error: util.error ?? "utility_first_contact_failed" };
  };

  const tryReferralInviteTemplate = async (): Promise<ReferredCandidateReachResult> => {
    const inv = await sendReferralInvite(candidatePhone, candidateName, referrerName);
    if (inv.success) {
      return { reached: true, via: `marketing_${inv.templateName ?? "referral"}` };
    }
    return { reached: false, error: inv.error ?? "referral_invite_failed" };
  };

  const tryConsentTemplate = async (): Promise<ReferredCandidateReachResult> => {
    const consent = await captureConsentViaWhatsApp(supabase, candidatePhone, "referred_candidate");
    if (consent.alreadyConsented) {
      const text = await sendWhatsAppMessage(
        candidatePhone,
        `Thanks! ${referrerName} thinks you'd be a great fit - send me your CV as a PDF and I'll score it against live roles in about 2 minutes.`,
      );
      if (text.success) {
        await withSessionCAS(candidatePhone, () => ({
          state: "cv_requested",
          context: candidateContext,
        }));
        return { reached: true, via: "text" };
      }
      return tryReferralInviteTemplate();
    }
    if (consent.sent) {
      return { reached: true, via: `marketing_${consent.via}` };
    }
    return { reached: false, error: consent.error ?? "consent_failed" };
  };

  const hasOpenSession = await hasRecentInboundFromPhone(supabase, candidatePhone, 24);

  if (useReferralConsentFlow) {
    // UTILITY first; MARKETING templates are blocked centrally until consent (marketing-send-guard).
    const utility = await tryUtilityFirstContact();
    if (utility.reached) {
      if (referralUtilityTemplateIncludesConsent(utility.templateName)) {
        await prepareSessionAfterEmployeeReferral(supabase, candidatePhone, candidateContext);
        return utility;
      }
      if (hasOpenSession) {
        const consent = await captureConsentViaWhatsApp(
          supabase,
          candidatePhone,
          "referred_candidate",
        );
        if (consent.sent || consent.alreadyConsented) {
          return {
            reached: true,
            via: `${utility.via}+consent`,
            templateName: utility.templateName,
          };
        }
      }
      await prepareSessionAfterEmployeeReferral(supabase, candidatePhone, candidateContext);
      return utility;
    }
    if (hasOpenSession) {
      const invite = await tryReferralInviteTemplate();
      if (invite.reached) return invite;
      return tryConsentTemplate();
    }
    return { reached: false, error: utility.error ?? "utility_first_contact_failed" };
  }

  const utility = await tryUtilityFirstContact();
  if (utility.reached) {
    await prepareSessionAfterEmployeeReferral(supabase, candidatePhone, candidateContext);
    return utility;
  }

  if (hasOpenSession) {
    const legacy = await sendWhatsAppMessage(
      candidatePhone,
      `Hi ${candidateName}! You were referred to TigerHire by ${referrerName}. Drop your CV (PDF) and get a FitScore against live roles in 2 minutes.`,
    );
    if (legacy.success) {
      await withSessionCAS(candidatePhone, () => ({
        state: "cv_requested",
        context: candidateContext,
      }));
      return { reached: true, via: "text" };
    }
    const fallback = await tryReferralInviteTemplate();
    if (fallback.reached) {
      await withSessionCAS(candidatePhone, () => ({
        state: "cv_requested",
        context: candidateContext,
      }));
    }
    return { reached: fallback.reached, via: fallback.via, error: legacy.error ?? fallback.error };
  }

  return { reached: false, error: utility.error ?? "utility_first_contact_failed" };
}
