import { env } from "@/lib/config/env";
import { buildTemplateBodyParams } from "@/lib/whatsapp/wa-template-registry";
import { canSendWhatsApp, inferPurposeFromTemplate } from "@/lib/whatsapp/outbound-policy";
import { sendTemplateWithFallback } from "@/lib/whatsapp/template-send-fallback";
import { logWhatsAppOutbound, previewFromOutboundPayload } from "@/lib/whatsapp/message-log";
import { awaitOutboundSlot, OutboundThrottleError } from "@/lib/whatsapp/outbound-rate-limit";
import { logger } from "@/lib/observability/logger";
import { getCircuitBreaker } from "@/lib/utils/circuit-breaker";
import { withRetry } from "@/lib/utils/retry";
import { appendToDlq } from "@/lib/utils/dlq";

const whatsappBreaker = getCircuitBreaker("whatsapp", {
  failureThreshold: 5,
  openMs: 30_000,
});
const META_GRAPH_VERSION = "v22.0";

interface WhatsAppTemplateMessage {
  phoneNumber: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  headerParams?: string[];
  buttonParams?: string[];
  /**
   * Button sub-type for the buttonParams component. Defaults to `"url"` for
   * backwards compatibility (traditional URL buttons with dynamic params).
   * For Authentication templates created with `otp_type: "COPY_CODE"`, Meta
   * accepts `"url"` payloads at the API level (returns 200 + wamid) but the
   * delivery layer can silently drop them — `"copy_code"` with a
   * `coupon_code` parameter type is the format Meta's delivery pipeline
   * actually validates against for COPY_CODE OTP buttons.
   */
  buttonSubType?: "url" | "copy_code";
  /** When sending in an application context, also logs to `wa_messages`. */
  applicationId?: string;
}

type WhatsAppSendResult = { success: boolean; error?: string; messageId?: string };

function requireMetaConfig():
  | { ok: true; phoneNumberId: string; accessToken: string }
  | { ok: false; error: string } {
  const phoneNumberId = env.whatsappPhoneNumberId.trim();
  const accessToken = env.whatsappAccessToken.trim();
  if (!phoneNumberId) {
    return { ok: false, error: "Missing WHATSAPP_PHONE_NUMBER_ID for Meta Graph API sends." };
  }
  if (!accessToken) {
    return { ok: false, error: "Missing WHATSAPP_ACCESS_TOKEN for Meta Graph API sends." };
  }
  return { ok: true, phoneNumberId, accessToken };
}

/** E.164 digits only (no +), for Meta `to`. */
function normalizeWhatsAppTo(phone: string): string {
  return phone.replace(/\D/g, "");
}

function buildMetaTemplateComponents(msg: WhatsAppTemplateMessage): Array<Record<string, unknown>> {
  const components: Array<Record<string, unknown>> = [];
  const bodyParams = msg.bodyParams ?? [];
  const headerParams = msg.headerParams ?? [];
  const buttonParams = msg.buttonParams ?? [];

  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams.map((p) => ({ type: "text", text: p })),
    });
  }
  if (headerParams.length > 0) {
    components.push({
      type: "header",
      parameters: headerParams.map((p) => ({ type: "text", text: p })),
    });
  }
  if (buttonParams.length > 0) {
    const subType = msg.buttonSubType ?? "url";
    if (subType === "copy_code") {
      // Authentication-OTP COPY_CODE buttons: Meta validates `coupon_code` parameter type
      // in its delivery pipeline. `text` parameter type is accepted at API level but
      // silently dropped at delivery for templates declared with `otp_type: COPY_CODE`.
      components.push({
        type: "button",
        sub_type: "copy_code",
        index: "0",
        parameters: buttonParams.map((p) => ({ type: "coupon_code", coupon_code: p })),
      });
    } else {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: buttonParams.map((p) => ({ type: "text", text: p })),
      });
    }
  }
  return components;
}

/**
 * Record a terminal WhatsApp send failure to the DLQ so it leaves a queryable
 * trace (previously a failed send produced no DB evidence at all). Stores only
 * routing/identifying fields + the error class — not message body/params — so we
 * do not park PII in the DLQ. Never throws (appendToDlq swallows).
 */
export async function recordWhatsAppSendFailure(
  payload: Record<string, unknown>,
  error: string,
  logContext?: { applicationId?: string },
  failureClass?: string,
): Promise<void> {
  const to = typeof payload.to === "string" ? payload.to : null;
  const template = (payload as { template?: { name?: string } }).template;
  const templateName = typeof template?.name === "string" ? template.name : null;
  await appendToDlq(
    "whatsapp_send",
    {
      to,
      to_digits_len: to ? to.replace(/\D/g, "").length : 0,
      type: typeof payload.type === "string" ? payload.type : null,
      template: templateName,
      application_id: logContext?.applicationId ?? null,
      failure_class: failureClass ?? "send_failed",
    },
    error,
  );
}

async function postMetaMessage(
  payload: Record<string, unknown>,
  logContext?: { applicationId?: string },
  options?: { allowDuringOutboundHold?: boolean },
): Promise<WhatsAppSendResult> {
  if (env.whatsappSandbox) {
    logger.info("[WHATSAPP_SANDBOX] would send Meta WhatsApp API", {
      type: payload.type,
      toLen: typeof payload.to === "string" ? (payload.to as string).length : undefined,
    });
    return { success: true };
  }

  if (env.isProductionOutboundHold && !options?.allowDuringOutboundHold) {
    logger.info(
      "[OUTBOUND_HOLD] would send WhatsApp (Meta) — set OUTBOUND_NOTIFICATIONS_ENABLED=true on production",
      {
        type: payload.type,
        toLen: typeof payload.to === "string" ? (payload.to as string).length : undefined,
      },
    );
    return { success: false, error: "outbound_hold" };
  }

  const meta = requireMetaConfig();
  if (!meta.ok) {
    logger.warn(meta.error);
    return { success: false, error: meta.error };
  }

  const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${meta.phoneNumberId}/messages`;
  try {
    return await whatsappBreaker.run(() =>
      withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10_000);
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${meta.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const responseText = await response.text();
          let data: {
            messages?: Array<{ id?: string }>;
            error?: { message?: string };
            message?: string;
          } = {};
          try {
            data = JSON.parse(responseText) as typeof data;
          } catch {
            /* plain text error */
          }

          if (!response.ok) {
            const errMsg = data.error?.message ?? data.message ?? responseText;
            logger.error("Meta WhatsApp send failed", {
              status: response.status,
              error: errMsg,
            });
            if (response.status >= 500) {
              throw new Error(`HTTP ${response.status}: ${errMsg}`);
            }
            await recordWhatsAppSendFailure(
              payload,
              `HTTP ${response.status}: ${errMsg}`,
              logContext,
              "http_4xx",
            );
            return {
              success: false,
              error: `HTTP ${response.status}: ${errMsg}`,
            };
          }

          const messageId = data.messages?.[0]?.id;
          const toDigits = String(payload.to ?? "").replace(/\D/g, "");
          const preview = previewFromOutboundPayload(payload as Record<string, unknown>);
          const templateName =
            typeof (payload as { template?: { name?: string } }).template?.name === "string"
              ? (payload as { template: { name: string } }).template.name
              : null;
          await logWhatsAppOutbound({
            phoneDigits: toDigits,
            waMessageId: messageId,
            messageType: preview.messageType,
            bodyPreview: preview.bodyPreview,
            applicationId: logContext?.applicationId,
            templateName,
          });

          return { success: true, messageId };
        },
        { maxRetries: 2 },
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Meta WhatsApp send error", { error: message });
    // 5xx-after-retries, circuit-open, and timeout/abort all land here — the
    // terminal failures that previously left no durable trace.
    await recordWhatsAppSendFailure(payload, message, logContext, "send_error");
    return { success: false, error: message };
  }
}

export async function sendTemplateMessage(
  msg: WhatsAppTemplateMessage,
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const purpose = inferPurposeFromTemplate(msg.templateName);
  const policy = await canSendWhatsApp({
    phone: msg.phoneNumber,
    purpose,
    templateName: msg.templateName,
  });
  if (!policy.allowed) {
    return { success: false, error: policy.error };
  }

  const to = normalizeWhatsAppTo(msg.phoneNumber);
  const languageCode = msg.languageCode ?? "en";
  const logContext = msg.applicationId ? { applicationId: msg.applicationId } : undefined;
  const allowDuringOutboundHold = purpose === "authentication";

  try {
    await awaitOutboundSlot();
  } catch (err) {
    if (err instanceof OutboundThrottleError) {
      logger.warn("whatsapp_outbound_throttled", {
        event_name: "whatsapp_outbound_throttled",
        send_type: "template",
        template: msg.templateName,
      });
      return { success: false, error: "outbound_throttled" };
    }
    throw err;
  }

  return postMetaMessage(
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: msg.templateName,
        language: { code: languageCode },
        components: buildMetaTemplateComponents(msg),
      },
    },
    logContext,
    { allowDuringOutboundHold },
  );
}

export type SendWhatsAppMessageOptions = {
  /**
   * When the 24h session window is closed, fall back to `tigerhire_consent_v2`.
   * Default true for general bot traffic. Prescreen must pass false so a closed
   * window does not divert shortlisted candidates into the consent/CV flow —
   * callers then use a UTILITY screening template instead.
   */
  allowConsentFallback?: boolean;
  /**
   * Bypass the do-not-contact (STOP) gate in `canSendWhatsApp`. ONLY the STOP
   * confirmation itself may set this; everything else stays blocked after STOP.
   */
  bypassOptOutGate?: boolean;
};

/**
 * Send a free-form text message (session message; customer must have an open 24h window).
 * Falls back to consent template flow when the 24h window is closed (unless disabled).
 */
export async function sendWhatsAppMessage(
  phone: string,
  text: string,
  options?: SendWhatsAppMessageOptions,
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const allowConsentFallback = options?.allowConsentFallback !== false;
  const sessionPolicy = await canSendWhatsApp({
    phone,
    purpose: "session_text",
    allowOptedOut: options?.bypassOptOutGate === true,
  });
  if (!sessionPolicy.allowed) {
    logger.info("Session text blocked by outbound policy", {
      phone_len: phone.replace(/\D/g, "").length,
      reason: sessionPolicy.reason,
      allowConsentFallback,
    });
    // Opted-out recipient: no fallback template either — the do-not-contact
    // gate applies to every channel, not just session text.
    if (sessionPolicy.reason === "recipient_opted_out") {
      return { success: false, error: "recipient_opted_out" };
    }
    if (!allowConsentFallback) {
      return { success: false, error: sessionPolicy.reason ?? "session_window_closed" };
    }
    const contextLine = text.slice(0, 200) || "Reply YES to continue on WhatsApp.";
    // Only tigerhire_consent_v2 exists in the production WABA (v1 returns 132001).
    const fallback = await sendTemplateWithFallback({
      phone,
      templateNames: ["tigerhire_consent_v2"],
      bodyParams: [contextLine],
    });
    return {
      success: fallback.success,
      error: fallback.error,
      messageId: fallback.messageId,
    };
  }

  const to = normalizeWhatsAppTo(phone);

  try {
    await awaitOutboundSlot();
  } catch (err) {
    if (err instanceof OutboundThrottleError) {
      logger.warn("whatsapp_outbound_throttled", {
        event_name: "whatsapp_outbound_throttled",
        send_type: "session_text",
      });
      return { success: false, error: "outbound_throttled" };
    }
    throw err;
  }

  const result = await postMetaMessage(
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    undefined,
  );

  // Meta signals a closed 24h session window with error code 131047 and a
  // message like "more than 24 hours have passed since the customer last
  // replied". The old check only matched "outside the allowed window", a string
  // Meta does not send, so this recovery never fired and late repliers silently
  // vanished. Match the real phrasings + code. (#338)
  const errLower = (result.error ?? "").toLowerCase();
  const isSessionWindowClosed =
    !result.success &&
    (errLower.includes("outside the allowed window") ||
      errLower.includes("24 hours") ||
      errLower.includes("re-engagement") ||
      errLower.includes("131047"));
  if (isSessionWindowClosed) {
    logger.info("24h window closed, falling back to consent template", {
      phoneLen: to.length,
      allowConsentFallback,
    });
    if (!allowConsentFallback) {
      return { success: false, error: "session_window_closed" };
    }
    const contextLine = text.slice(0, 200) || "Reply YES to continue on WhatsApp.";
    const fallback = await sendTemplateWithFallback({
      phone,
      templateNames: ["tigerhire_consent_v2"],
      bodyParams: [contextLine],
    });
    return {
      success: fallback.success,
      error: fallback.error,
      messageId: fallback.messageId,
    };
  }

  return result;
}

/**
 * Mark an inbound user message as read and show the typing indicator (Meta Cloud API).
 * Failures are logged only; callers must not rely on success for business logic.
 *
 * Uses the same Graph `META_GRAPH_VERSION` as outbound sends. Meta documents read receipts on
 * `POST /{version}/{phone-number-id}/messages` with a version placeholder; if production ever
 * returns HTTP 400 only for this payload, check Meta changelog and consider pinning a newer
 * version for this call (or temporarily matching the version shown in Meta’s examples).
 */
export async function sendTypingIndicator(wamid: string): Promise<void> {
  const id = wamid.trim();
  if (!id) return;

  if (env.whatsappSandbox) {
    logger.info("[WHATSAPP_SANDBOX] would send typing/read indicator", { wamidLen: id.length });
    return;
  }

  if (env.isProductionOutboundHold) {
    logger.info("[OUTBOUND_HOLD] would send WhatsApp typing/read indicator", {
      wamidLen: id.length,
    });
    return;
  }

  const meta = requireMetaConfig();
  if (!meta.ok) {
    logger.warn("whatsapp_typing_indicator_warn", {
      event_name: "whatsapp_typing_indicator_warn",
      reason: "meta_config_missing",
      detail: meta.error,
    });
    return;
  }

  const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${meta.phoneNumberId}/messages`;
  const body = JSON.stringify({
    messaging_product: "whatsapp",
    status: "read",
    message_id: id,
    typing_indicator: { type: "text" },
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${meta.accessToken}`,
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseText = await response.text();
    if (!response.ok) {
      let errMsg = responseText;
      try {
        const parsed = JSON.parse(responseText) as { error?: { message?: string } };
        errMsg = parsed.error?.message ?? responseText;
      } catch {
        /* keep raw */
      }
      logger.warn("whatsapp_typing_indicator_warn", {
        event_name: "whatsapp_typing_indicator_warn",
        reason: "http_error",
        http_status: response.status,
        error: errMsg,
      });
    }
  } catch (err) {
    logger.warn("whatsapp_typing_indicator_warn", {
      event_name: "whatsapp_typing_indicator_warn",
      reason: "fetch_error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Notify a candidate that companies matched their profile.
 *
 * LAUNCH DECISION: Disabled for v1. Candidate-initiated WhatsApp only.
 * Proactive match alerts go via email (Resend) and in-app notifications.
 * Re-evaluate post-launch if candidate engagement data shows email open rates < 20%.
 */
export async function notifyCandidateMatch(params: {
  phone: string;
  candidateName: string;
  matchCount: number;
  topRole: string;
  city: string;
}) {
  logger.info("[WHATSAPP_DISABLED] candidate_match_alert — use email/in-app", {
    phoneDigits: params.phone.replace(/\D/g, "").length,
  });
  return { success: false, error: "Template disabled (candidate-only WhatsApp policy)" };
}

/** Lane A: single-job FitScore result (Meta template). */
export async function sendThJobMatchResult(params: {
  phone: string;
  name: string;
  title: string;
  location: string;
  score: number;
  verdict: string;
}) {
  const bodyParams = [
    params.name,
    params.title,
    params.location,
    String(params.score),
    params.verdict,
  ];
  for (const templateName of ["th_job_match_result_v6", "th_job_match_result"]) {
    const templateResult = await sendTemplateMessage({
      phoneNumber: params.phone,
      templateName,
      bodyParams,
    });
    if (templateResult.success) return templateResult;
  }

  return sendWhatsAppMessage(
    params.phone,
    `Hi ${params.name}, your fit result for ${params.title} in ${params.location} is ${params.score}/100 (${params.verdict}). Reply here to continue.`,
  );
}

/** Lane A: score below threshold for targeted job. */
export async function sendThJobNoMatch(params: { phone: string; name: string; title: string }) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_job_no_match",
    bodyParams: [params.name, params.title],
  });
}

/** Lane B: top preference-based matches (Meta category: MARKETING). */
export async function sendThPreferenceMatches(params: {
  phone: string;
  name: string;
  count: string;
  roleList: string;
}) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_preference_matches",
    bodyParams: [params.name, params.count, params.roleList],
  });
}

/** Lane B: no match but subscribed for alerts (Meta category: MARKETING). */
export async function sendThNoMatchSubscribed(params: {
  phone: string;
  name: string;
  role: string;
  location: string;
}) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_no_match_subscribed",
    bodyParams: [params.name, params.role, params.location],
  });
}

/** Job alert to subscribed candidates (Meta category: MARKETING). */
export async function sendThNewRoleAlert(params: {
  phone: string;
  name: string;
  title: string;
  location: string;
  score: string;
}) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_new_role_alert",
    bodyParams: [params.name, params.title, params.location, params.score],
  });
}

/**
 * Notify a recruiter that a FitScore shortlist is ready.
 * Disabled: recruiter WhatsApp — use email/in-app only.
 */
export async function notifyRecruiterShortlist(params: {
  phone: string;
  recruiterName: string;
  roleName: string;
  topScore: number;
  candidateCount: number;
}) {
  logger.info("[WHATSAPP_DISABLED] recruiter_shortlist_ready", {
    roleName: params.roleName,
  });
  return { success: false, error: "Recruiter WhatsApp disabled" };
}

/**
 * Send candidate profile claimed confirmation.
 */
export async function notifyProfileClaimed(params: { phone: string; candidateName: string }) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "candidate_profile_claimed",
    bodyParams: [params.candidateName],
  });
}

/**
 * Notify candidate that a recruiter unlocked their contact.
 * Disabled: use email/in-app per candidate-only WhatsApp policy.
 */
export async function notifyCandidateUnlocked(params: {
  phone: string;
  candidateName: string;
  companyName: string;
}) {
  logger.info("[WHATSAPP_DISABLED] candidate_contact_unlocked", {
    companyName: params.companyName,
  });
  return { success: false, error: "Template disabled (candidate-only WhatsApp policy)" };
}

/** Send waitlist confirmation (Meta category: MARKETING). */
export async function sendWaitlistConfirmation(params: { phone: string; name?: string }) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "waitlist_confirmation",
    bodyParams: [params.name ?? "there"],
  });
}

// ---------------------------------------------------------------------------
// Marketing opt-in guard
// WhatsApp policy: marketing templates only deliver to numbers that have
// previously messaged the business. Skip sending to save credits.
// ---------------------------------------------------------------------------

async function requireMarketingOptIn(
  phone: string,
): Promise<{ allowed: true } | { allowed: false; result: { success: false; error: string } }> {
  try {
    const policy = await canSendWhatsApp({ phone, purpose: "marketing" });
    if (!policy.allowed) {
      logger.warn("Marketing template blocked — outbound policy", {
        phone,
        reason: policy.reason,
      });
      return {
        allowed: false,
        result: {
          success: false,
          error:
            policy.error ??
            "Recipient has not opted in (never messaged this business number). Marketing template will not be delivered.",
        },
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

// ---------------------------------------------------------------------------
// HR Lifecycle Templates (Meta WhatsApp Cloud API)
// Variables are sequential {{1}}..{{n}} in template manager.
// ---------------------------------------------------------------------------

/**
 * Notify candidate they've been shortlisted for a role.
 * Template: th_shortlisted (UTILITY)
 */
export async function notifyCandidateShortlisted(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  applicationId?: string;
}) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_shortlisted",
    bodyParams: [params.candidateName, params.jobTitle, params.companyName],
    applicationId: params.applicationId,
  });
}

/**
 * Notify candidate they've been rejected.
 * Template: th_not_selected (UTILITY)
 */
export async function notifyCandidateRejected(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  applicationId?: string;
}) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_not_selected",
    bodyParams: [params.candidateName, params.jobTitle, params.companyName],
    applicationId: params.applicationId,
  });
}

/**
 * Notify candidate they've received an offer / been hired.
 * Template: th_offer (UTILITY) — {{1}} name, {{2}} company, {{3}} role
 */
export async function notifyCandidateOffer(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  applicationId?: string;
}) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_offer",
    bodyParams: [params.candidateName, params.companyName, params.jobTitle],
    applicationId: params.applicationId,
  });
}

/**
 * Send interview slots to candidate via template (outside 24h window).
 * Template: th_interview_slots (UTILITY)
 */
export async function sendInterviewSlotsTemplate(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  slot1: string;
  slot2: string;
  slot3: string;
  applicationId?: string;
}) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_interview_slots",
    bodyParams: [params.candidateName, params.jobTitle, params.slot1, params.slot2, params.slot3],
    applicationId: params.applicationId,
  });
}

/**
 * Brief 8 Phase C — candidate slot picker (UTILITY).
 * Template: th_interview_slot_picker — {{1}} name, {{2}} role, {{3-5}} slots (Meta approval pending).
 * Callers should log and skip gracefully when Meta returns template errors.
 */
export async function sendInterviewSlotPickerTemplate(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  slot1: string;
  slot2: string;
  slot3: string;
  slot4?: string;
  slot5?: string;
  applicationId?: string;
}) {
  // Meta templates have fixed arity — th_interview_slot_picker declares 7
  // {{n}} params, so unused slots are padded with "-" (the template copy tells
  // candidates to ignore dash entries).
  const bodyParams = [
    params.candidateName,
    params.jobTitle,
    params.slot1,
    params.slot2,
    params.slot3,
    params.slot4 ?? "-",
    params.slot5 ?? "-",
  ];

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_interview_slot_picker",
    bodyParams,
    applicationId: params.applicationId,
  });
}

/**
 * Send interview reminder before the interview (via template).
 * Template: th_interview_reminder (UTILITY)
 */
export async function sendInterviewReminderTemplate(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  interviewTime: string;
}) {
  const templateResult = await sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_interview_reminder",
    bodyParams: [params.candidateName, params.jobTitle, params.interviewTime],
  });
  if (templateResult.success) return templateResult;

  return sendWhatsAppMessage(
    params.phone,
    `Hi ${params.candidateName}, reminder: your interview for ${params.jobTitle} is at ${params.interviewTime}.`,
  );
}

/**
 * Sourcing campaign: outbound message to passive candidate about a role.
 * Template: th_sourcing (MARKETING) — {{1}} name, {{2}} company, {{3}} role, {{4}} city, {{5}} ctc
 */
export async function sendSourcingCampaign(params: {
  phone: string;
  candidateName: string;
  companyName: string;
  jobTitle: string;
  city: string;
  ctcRange: string;
}) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_sourcing",
    bodyParams: [
      params.candidateName,
      params.companyName,
      params.jobTitle,
      params.city,
      params.ctcRange,
    ],
  });
}

/**
 * Employee referral drive broadcast.
 * Template: th_referral_drive (MARKETING) — {{1}} emp, {{2}} company, {{3}} role, {{4}} link
 */
export async function sendReferralDrive(params: {
  phone: string;
  employeeName: string;
  companyName: string;
  jobTitle: string;
  referralLink: string;
}) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_referral_drive",
    bodyParams: [params.employeeName, params.companyName, params.jobTitle, params.referralLink],
  });
}

/** Multi-role referral campaign drive — th_referral_drive_multi (MARKETING). */
export async function sendReferralDriveMulti(params: {
  phone: string;
  employeeName: string;
  companyName: string;
  rolesSummary: string;
  hubLink: string;
}) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_referral_drive_multi",
    bodyParams: [params.employeeName, params.companyName, params.rolesSummary, params.hubLink],
  });
}

/** Urgent multi-role referral campaign drive — th_referral_drive_urgent (MARKETING). */
export async function sendReferralDriveUrgent(params: {
  phone: string;
  employeeName: string;
  companyName: string;
  rolesSummary: string;
  hubLink: string;
}) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  const urgent = await sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_referral_drive_urgent",
    bodyParams: [params.employeeName, params.companyName, params.rolesSummary, params.hubLink],
  });
  if (urgent.success) return urgent;

  return sendReferralDriveMulti({
    phone: params.phone,
    employeeName: params.employeeName,
    companyName: params.companyName,
    rolesSummary: params.rolesSummary,
    hubLink: params.hubLink,
  });
}

/**
 * Notify candidate their interview has been rescheduled.
 * Template: th_interview_rescheduled (UTILITY) — {{1}} name, {{2}} role, {{3}} newTime
 */
export async function sendInterviewRescheduledTemplate(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  newTime: string;
}) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_interview_rescheduled",
    bodyParams: [params.candidateName, params.jobTitle, params.newTime],
  });
}

/**
 * Notify candidate their interview has been cancelled.
 * Template: th_interview_cancelled (UTILITY) — {{1}} name, {{2}} role, {{3}} original time
 */
export async function sendInterviewCancelledTemplate(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  originalTime: string;
}) {
  const templateResult = await sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_interview_cancelled",
    bodyParams: [params.candidateName, params.jobTitle, params.originalTime],
  });
  if (templateResult.success) return templateResult;

  return sendWhatsAppMessage(
    params.phone,
    `Hi ${params.candidateName}, your interview for ${params.jobTitle} has been cancelled. We will share updated steps shortly.`,
  );
}

/**
 * Acknowledge that a candidate's application has been received.
 * Template: th_application_received (UTILITY) — {{1}} name, {{2}} role, {{3}} company
 */
export async function sendApplicationReceivedTemplate(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  applicationId?: string;
}) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_application_received",
    bodyParams: [params.candidateName, params.jobTitle, params.companyName],
    applicationId: params.applicationId,
  });
}

/** Pre-screening link (Meta template name: `env.whatsappScreeningTemplateName`, default `screening_questions`; params from registry). */
function screeningUrlButtonSuffix(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return u.pathname.replace(/^\//, "") + u.search;
  } catch {
    return fullUrl.replace(/^https?:\/\/[^/]+\/?/i, "");
  }
}

export async function sendScreeningQuestionsTemplate(params: {
  phone: string;
  candidateFirstName: string;
  jobTitle: string;
  screeningUrl: string;
  applicationId?: string;
}) {
  const bodyParams = [params.candidateFirstName, params.jobTitle];
  const urlSuffix = screeningUrlButtonSuffix(params.screeningUrl);
  const v6Names = ["screening_questions_v6"];
  const legacyName = env.whatsappScreeningTemplateName?.trim() || "screening_questions";
  const templateNames = [...new Set([...v6Names, legacyName])];

  for (const templateName of templateNames) {
    const isV6 = templateName.endsWith("_v6");
    const templateResult = await sendTemplateMessage({
      phoneNumber: params.phone,
      templateName,
      languageCode: "en",
      bodyParams: isV6
        ? bodyParams
        : buildTemplateBodyParams("screening_questions", {
            candidate_first_name: params.candidateFirstName,
            job_title: params.jobTitle,
            screening_url: params.screeningUrl,
          }),
      buttonParams: isV6 ? [urlSuffix] : undefined,
      applicationId: params.applicationId,
    });
    if (templateResult.success) return templateResult;
  }

  return sendWhatsAppMessage(
    params.phone,
    `Hi ${params.candidateFirstName}, please complete your screening questions for ${params.jobTitle}: ${params.screeningUrl}`,
  );
}

/**
 * Nudge candidate to complete their profile.
 * Template: th_profile_incomplete (UTILITY) — {{1}} name, {{2}} missingField
 */
export async function sendProfileIncompleteTemplate(params: {
  phone: string;
  candidateName: string;
  missingField: string;
}) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_profile_incomplete",
    bodyParams: [params.candidateName, params.missingField],
  });
}

/**
 * Notify recruiter about new matched candidates.
 * Disabled: recruiter WhatsApp — use email/in-app only.
 */
export async function sendRecruiterNewCandidates(params: {
  phone: string;
  recruiterName: string;
  candidateCount: number;
  roleName: string;
  topScore: number;
}) {
  logger.info("[WHATSAPP_DISABLED] th_recruiter_new_candidates", {
    roleName: params.roleName,
  });
  return { success: false, error: "Recruiter WhatsApp disabled" };
}

/**
 * Re-engage inactive candidate with new roles.
 * Template: th_reengagement (MARKETING) — {{1}} name, {{2}} roleCount
 */
export async function sendReengagementTemplate(params: {
  phone: string;
  candidateName: string;
  newRoleCount: number;
}) {
  const check = await requireMarketingOptIn(params.phone);
  if (!check.allowed) return check.result;

  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_reengagement",
    bodyParams: [params.candidateName, String(params.newRoleCount)],
  });
}

/**
 * Post-Hire Pulse: send 30/60/90-day check-in to hiring manager.
 * Template: th_post_hire_pulse (UTILITY) — {{1}} manager, {{2}} candidate, {{3}} role, {{4}} day
 * Quick-reply buttons: "Going great" / "Some concerns" / "Not working out"
 */
export async function sendPostHirePulseCheckIn(params: {
  phone: string;
  hiringManagerName: string;
  candidateName: string;
  jobTitle: string;
  checkInDay: 30 | 60 | 90;
}) {
  return sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_post_hire_pulse",
    bodyParams: [
      params.hiringManagerName,
      params.candidateName,
      params.jobTitle,
      `${params.checkInDay} days`,
    ],
  });
}
