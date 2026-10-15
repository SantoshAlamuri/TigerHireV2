import { sendTemplateMessage } from "@/lib/services/whatsapp";
import { sendTemplateWithFallback } from "@/lib/whatsapp/template-send-fallback";

interface TemplateComponent {
  type: "body" | "header" | "button";
  parameters: Array<{ type: "text"; text: string }>;
}

async function sendTemplate(
  to: string,
  templateName: string,
  language: string,
  components: TemplateComponent[],
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const body = components.find((c) => c.type === "body");
  const header = components.find((c) => c.type === "header");
  if (!body) {
    return { success: false, error: "Template send requires a body component" };
  }

  return sendTemplateMessage({
    phoneNumber: to,
    templateName,
    languageCode: language,
    bodyParams: body.parameters.map((p) => p.text),
    headerParams: header?.parameters.map((p) => p.text),
  });
}

export async function sendReferralInvite(
  phone: string,
  candidateName: string,
  referrerName: string,
) {
  return sendTemplateWithFallback({
    phone,
    templateNames: ["tigerhire_referral_v1", "tigerhire_referral_v2"],
    bodyParams: [candidateName, referrerName],
  });
}

function referrerFirstName(referrerName: string): string {
  const first = referrerName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : referrerName.trim() || "Someone";
}

/** Job/company context for a referral invite, resolved from the referred job. */
export interface ReferralJobContext {
  jobTitle?: string;
  companyName?: string;
  /** Public apply link the referred candidate can open to actually apply. */
  applyUrl?: string;
}

/**
 * Optional Meta-approved template that carries the job apply LINK + company name
 * (params: candidateName, referrerFirstName, jobTitle, companyName, applyUrl).
 * Set WHATSAPP_REFERRAL_INVITE_TEMPLATE once the template is approved in Meta to
 * deliver a clickable apply link; until then we fall back to th_application_received
 * with the real company name + job title.
 */
const REFERRAL_INVITE_TEMPLATE = process.env.WHATSAPP_REFERRAL_INVITE_TEMPLATE?.trim();

/**
 * UTILITY first contact for cold referred numbers.
 * Meta often returns a wamid for `tigerhire_referred_candidate_v1` but never delivers to the device;
 * `th_application_received` is the reliable UTILITY template for first contact (see referral-handler).
 *
 * jobContext (when the referral is tied to a specific job) supplies the real
 * company name + job title — and, when WHATSAPP_REFERRAL_INVITE_TEMPLATE is
 * configured, an apply link (Bug Report: Job Referral #1/#3).
 */
export async function sendReferralUtilityFirstContact(
  phone: string,
  candidateName: string,
  referrerName: string,
  jobContext?: ReferralJobContext,
) {
  const who = referrerFirstName(referrerName);
  const company = jobContext?.companyName?.trim() || "TigerHire";
  const jobTitle = jobContext?.jobTitle?.trim();
  const roleText = jobTitle
    ? `the ${jobTitle} role (referred by ${who})`
    : `an open role (referred by ${who})`;

  // Preferred: link-bearing referral-invite template, once approved + configured.
  if (REFERRAL_INVITE_TEMPLATE && jobContext?.applyUrl) {
    const invite = await sendTemplateWithFallback({
      phone,
      templateNames: [REFERRAL_INVITE_TEMPLATE],
      bodyParams: [candidateName, who, jobTitle || "an open role", company, jobContext.applyUrl],
    });
    if (invite.success) {
      return invite;
    }
  }

  const primary = await sendTemplateWithFallback({
    phone,
    templateNames: ["th_application_received"],
    bodyParams: [candidateName, roleText, company],
  });
  if (primary.success) {
    return primary;
  }

  return sendTemplateWithFallback({
    phone,
    templateNames: ["tigerhire_referred_candidate_v1"],
    bodyParams: [candidateName, referrerName],
  });
}

/** True when the UTILITY message already asks for YES/NO consent (no second consent template needed). */
export function referralUtilityTemplateIncludesConsent(templateName?: string): boolean {
  return templateName === "tigerhire_referred_candidate_v1";
}

export async function sendConsentRequest(
  phone: string,
  triggerType: "self_cv_drop" | "referred_candidate",
) {
  // Slots into the "{{1}}" middle of tigerhire_consent_v2 — keep it a single sentence
  // so the rendered body reads naturally around it.
  const contextLine =
    triggerType === "referred_candidate"
      ? "You were referred by someone who trusts your work."
      : "Send your CV as a PDF to see your matches in under 2 minutes.";

  // Only tigerhire_consent_v2 is approved in the production WABA (v1 was never
  // registered there — Meta returns 132001 for it). v2 is MARKETING, so cold
  // numbers are blocked until consent (see marketing-send-guard).
  return sendTemplateWithFallback({
    phone,
    templateNames: ["tigerhire_consent_v2"],
    bodyParams: [contextLine],
  });
}

export async function sendFitScoreResult(
  phone: string,
  name: string,
  matchCount: number,
  totalJobs: number,
  topJobTitle: string,
  topCompany: string,
  topScore: number,
) {
  return sendTemplate(phone, "tigerhire_fitscore_v2", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: name },
        { type: "text", text: String(matchCount) },
        { type: "text", text: String(totalJobs) },
        { type: "text", text: topJobTitle },
        { type: "text", text: topCompany },
        { type: "text", text: String(topScore) },
      ],
    },
  ]);
}

export async function sendInterviewSlots(
  phone: string,
  candidateName: string,
  recruiterName: string,
  jobTitle: string,
  slot1: string,
  slot2: string,
  slot3: string,
) {
  return sendTemplate(phone, "tigerhire_interview_v1", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: candidateName },
        { type: "text", text: recruiterName },
        { type: "text", text: jobTitle },
        { type: "text", text: slot1 },
        { type: "text", text: slot2 },
        { type: "text", text: slot3 },
      ],
    },
  ]);
}

export async function sendInterviewReminder(
  phone: string,
  jobTitle: string,
  company: string,
  joinLink: string,
) {
  return sendTemplate(phone, "tigerhire_reminder_v1", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: jobTitle },
        { type: "text", text: company },
        { type: "text", text: joinLink },
      ],
    },
  ]);
}

export async function sendEmployeeInvite(
  phone: string,
  name: string,
  inviterName: string,
  company: string,
) {
  return sendTemplate(phone, "tigerhire_employee_invite_v1", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: name },
        { type: "text", text: inviterName },
        { type: "text", text: company },
      ],
    },
  ]);
}

// --- WhatsApp CV Flow V2 (via `services/whatsapp.ts` sendTemplateMessage). ---

export async function sendThJobMatchResultMeta(
  phone: string,
  name: string,
  title: string,
  location: string,
  score: number,
  verdict: string,
) {
  return sendTemplate(phone, "th_job_match_result", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: name },
        { type: "text", text: title },
        { type: "text", text: location },
        { type: "text", text: String(score) },
        { type: "text", text: verdict },
      ],
    },
  ]);
}

export async function sendThJobNoMatchMeta(phone: string, name: string, title: string) {
  return sendTemplate(phone, "th_job_no_match", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: name },
        { type: "text", text: title },
      ],
    },
  ]);
}

export async function sendThPreferenceMatchesMeta(
  phone: string,
  name: string,
  count: string,
  roleList: string,
) {
  return sendTemplate(phone, "th_preference_matches", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: name },
        { type: "text", text: count },
        { type: "text", text: roleList },
      ],
    },
  ]);
}

export async function sendThNoMatchSubscribedMeta(
  phone: string,
  name: string,
  role: string,
  location: string,
) {
  return sendTemplate(phone, "th_no_match_subscribed", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: name },
        { type: "text", text: role },
        { type: "text", text: location },
      ],
    },
  ]);
}

export async function sendThNewRoleAlertMeta(
  phone: string,
  name: string,
  title: string,
  location: string,
  score: string,
) {
  return sendTemplate(phone, "th_new_role_alert", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: name },
        { type: "text", text: title },
        { type: "text", text: location },
        { type: "text", text: score },
      ],
    },
  ]);
}
