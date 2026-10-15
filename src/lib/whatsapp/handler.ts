import {
  getOrCreateSession,
  withSessionCAS,
  type WhatsAppSession,
  type WhatsAppSessionState,
} from "./sessions";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { runWhatsAppCvIngest } from "@/lib/agents/scout";
import { triggerVerifyAgent } from "@/lib/agents/verify";
import { detectAndHandleReferral, handleReferralCandidatePhone } from "./referral-handler";
import {
  looksLikeApplyIntent,
  parseApplyPrefillHints,
  switchToCandidateApplyFlow,
} from "./referral-flow";
import { handleRegisteredReferrerInbound } from "./referral-flow";
import { normalizeIndianPhone } from "./normalize-phone";
import { handleVouchResponse } from "@/lib/agents/vouch";
import { handleSlotSelection } from "@/lib/agents/scheduler";
import { createApplicationFromWhatsApp } from "./application-bridge";
import { TOP_MATCHES_LIMIT } from "./constants";
import { captureConsentViaWhatsApp, recordConsentResponse } from "@/lib/agents/consent";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolvePhoneIdentity } from "@/lib/whatsapp/resolve-phone-identity";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { logger } from "@/lib/observability/logger";
import { submitAssessmentByToken } from "@/lib/services/assessment-share";
import {
  BUSINESS_INQUIRY_FOLLOWUP_REPLY,
  isCandidateIntentText,
  isMarketingHandoffText,
  MARKETING_HANDOFF_REPLY,
} from "./inbound-intent";
import type { ExtractedInboundContext } from "./parse-webhook-payload";
import { handleLaneASingleJobScore } from "./lane-a";
import { handleCollectingPreferencesReply } from "./qa-flow";
import {
  asJobOptions,
  asRoleOptions,
  handleRoleFamilySelectionReply,
  handleRoleJobSelectionReply,
  routeRolePickReply,
  scoreAndPresentSelectedRole,
  startRoleGuidedFlow,
} from "./role-guided-flow";
import { handleScreeningQuestionsReply } from "./screening-qa-flow";
import { resolveRolePickPhase } from "./role-pick-routing";
import { shouldSilenceWhatsAppForPhone } from "./candidate-scope";
import { syncSessionWithConsent } from "./sync-session-consent";
import {
  logWhatsAppInbound,
  previewFromInboundMessage,
  recordInboundToApplicationThread,
} from "./message-log";
import { ConsentService } from "@/lib/services/ConsentService";
import { CandidateService } from "@/lib/services/CandidateService";
import { createNotificationBatch } from "@/lib/services/notifications";
import { sendOpsAlert } from "@/lib/observability/alerts";
import { handleScreeningWhatsappReply } from "@/lib/screening/whatsapp-flow";
import { isOptOutKeyword } from "@/lib/screening/compliance";
import { normalizeReplyText } from "@/lib/whatsapp/normalize-reply";
import {
  handlePrescreenWhatsappReply,
  repromptOpenPrescreenQuestion,
} from "@/lib/prescreen/whatsapp-inbound";

/**
 * Inbound WhatsApp webhook payload (Meta Cloud API style).
 * message.from = sender phone (e.g. 919876543210), message.type = text | document | image, etc.
 */
export interface InboundMessagePayload {
  messages?: Array<{
    id?: string;
    from: string;
    type: string;
    text?: { body?: string };
    document?: { id?: string; filename?: string; mime_type?: string; link?: string; url?: string };
    image?: { id: string };
    button?: { text?: string; payload?: string };
    interactive?: {
      type?: string;
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    };
    context?: { id?: string; from?: string };
  }>;
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  /** Set by `normalizeWhatsAppWebhookBody` (route) for Lane A routing */
  extracted?: ExtractedInboundContext;
}

type InboundMessage = NonNullable<InboundMessagePayload["messages"]>[0];

const WHATSAPP_REPLY_DEDUPE_WINDOW_MS = 3 * 60 * 1000;
const WHATSAPP_HANDOVER_UNCLEAR_THRESHOLD = 3;

function normalizeInboundText(value: string): string {
  return value.trim().toLowerCase();
}

function isGreetingText(value: string): boolean {
  return /^(hi|hello|hey|yo|hii+|good (morning|afternoon|evening))\b/i.test(value.trim());
}

function isCvAlreadySentText(value: string): boolean {
  return /(sent|shared|uploaded|given|gave).*(cv|resume)|\b(cv|resume)\b.*(sent|shared|uploaded|given|gave)/i.test(
    value.trim(),
  );
}

function isClosureText(value: string): boolean {
  return /^(thanks?|thank you|ok|okay|got it|cool|noted|done|all set|that'?s all|stop here|no thanks|bye|goodbye|ttyl)[.! ]*$/i.test(
    value.trim(),
  );
}

function isActionableTextForAlerts(normalized: string): boolean {
  return (
    normalized === "status" ||
    normalized === "matches" ||
    normalized === "preferences" ||
    /^\d+$/.test(normalized) ||
    normalized.includes("cv") ||
    normalized.includes("resume")
  );
}

function isHumanHandoverText(value: string): boolean {
  return /(human|agent|person|support|team|call me|talk to (someone|human)|representative)/i.test(
    value.trim(),
  );
}

function isFrustrationText(value: string): boolean {
  return /(not working|doesn't work|doesnt work|useless|stupid|frustrat|annoy|worst|wtf|nonsense)/i.test(
    value.trim(),
  );
}

function isOpenRolesIntentText(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  return (
    /(open|available|current|live)\s+(roles?|jobs?)/i.test(text) ||
    /(roles?|jobs?)\s+(open|available|current|live)/i.test(text) ||
    /(show|list|share|what are|which are).*(roles?|jobs?)/i.test(text) ||
    /no\s+cv.*(roles?|jobs?)/i.test(text)
  );
}

function isOptOutText(value: string): boolean {
  return isOptOutKeyword(value);
}

function isUnsolicitedAckReplyText(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  return (
    /who\s+is\s+this/.test(text) ||
    /how\s+(did|got)\s+.*(number|contact)/.test(text) ||
    /why\s+.*(message|text|whatsapp)/.test(text) ||
    /didn'?t\s+apply/.test(text) ||
    /did\s+not\s+apply/.test(text) ||
    isOptOutText(text)
  );
}

function isHumanTakeoverActive(context: Record<string, unknown>): boolean {
  const active = context.human_takeover_active === true;
  if (!active) return false;
  const untilRaw =
    typeof context.human_takeover_until === "string" ? context.human_takeover_until : null;
  if (!untilRaw) return true;
  const untilMs = Date.parse(untilRaw);
  if (Number.isNaN(untilMs)) return true;
  return Date.now() < untilMs;
}

async function sendHandoverReply(
  phone: string,
  sessionState: WhatsAppSessionState,
  context: Record<string, unknown>,
  reason: "requested" | "frustration" | "unclear_loop",
): Promise<Record<string, unknown>> {
  await sendWhatsAppMessage(
    phone,
    "Got it — I am handing this to our hiring support team now.\n\nA human will review this thread and reply here shortly. You can also continue by sending STATUS, MATCHES, or your CV PDF.",
  );
  const nextContext: Record<string, unknown> = {
    ...context,
    handover_requested_at: new Date().toISOString(),
    handover_reason: reason,
    conversation_outcome: "handover",
    unclear_turn_count: 0,
  };
  await withSessionCAS(phone, () => ({ state: sessionState, context: nextContext }));
  await notifyHumanHandover(phone, sessionState, reason, nextContext);
  return nextContext;
}

async function notifyHumanHandover(
  phone: string,
  sessionState: WhatsAppSessionState,
  reason: "requested" | "frustration" | "unclear_loop",
  context: Record<string, unknown>,
): Promise<void> {
  try {
    const configuredUserIds =
      process.env.WHATSAPP_HANDOVER_NOTIFY_USER_IDS?.split(",")
        .map((v) => v.trim())
        .filter(Boolean) ?? [];
    let notifyUserIds = configuredUserIds;
    if (notifyUserIds.length === 0) {
      const supabase = createSupabaseAdmin();
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .in("role", ["super_admin"])
        .limit(50);
      if (error) {
        logger.warn("WhatsApp handover: failed to fetch notify users", { error: String(error) });
      } else {
        notifyUserIds = ((data as Array<{ id?: string }> | null) ?? [])
          .map((row) => String(row.id ?? ""))
          .filter(Boolean);
      }
    }

    if (notifyUserIds.length > 0) {
      const phoneTail = phone.slice(-4);
      await createNotificationBatch(notifyUserIds, {
        type: "general",
        title: "WhatsApp handover requested",
        body: `Candidate ending with ${phoneTail} needs human follow-up. Reason: ${reason}. State: ${sessionState}.`,
        link: `/admin/whatsapp-sessions/${phone}`,
        metadata: {
          source: "whatsapp_handover",
          reason,
          state: sessionState,
          phone,
          handover_requested_at: String(context.handover_requested_at ?? ""),
        },
      });
    }

    await sendOpsAlert(
      `[WhatsApp Handover] phone=${phone} state=${sessionState} reason=${reason} notify_users=${notifyUserIds.length}`,
    );
  } catch (err) {
    logger.warn("WhatsApp handover: notifyHumanHandover failed", { error: String(err) });
  }
}

function shouldUseAlternateReply(
  context: Record<string, unknown>,
  key: string,
  nowMs: number,
): boolean {
  const lastKey =
    typeof context.last_assistant_reply_key === "string" ? context.last_assistant_reply_key : null;
  const lastAtRaw =
    typeof context.last_assistant_reply_at === "string" ? context.last_assistant_reply_at : null;
  const lastAtMs = lastAtRaw ? Date.parse(lastAtRaw) : Number.NaN;
  if (!lastKey || lastKey !== key || Number.isNaN(lastAtMs)) return false;
  return nowMs - lastAtMs < WHATSAPP_REPLY_DEDUPE_WINDOW_MS;
}

async function sendStateAwareReply(
  phone: string,
  sessionState: WhatsAppSessionState,
  context: Record<string, unknown>,
  key: string,
  primaryText: string,
  alternateText?: string,
): Promise<Record<string, unknown>> {
  const nowMs = Date.now();
  const useAlternate = Boolean(alternateText) && shouldUseAlternateReply(context, key, nowMs);
  await sendWhatsAppMessage(phone, useAlternate ? (alternateText as string) : primaryText);
  const nextContext: Record<string, unknown> = {
    ...context,
    last_assistant_reply_key: key,
    last_assistant_reply_at: new Date(nowMs).toISOString(),
  };
  await withSessionCAS(phone, () => ({ state: sessionState, context: nextContext }));
  return nextContext;
}

/**
 * Handle all inbound WhatsApp messages. Route by session state.
 * The webhook route responds 200 immediately and continues this work via `after()` so Vercel
 * does not freeze before DB writes (session + message log) complete.
 *
 * Latency budget: aim for ≤1 user-visible delay before the first outbound reply.
 * To get there we kick off audit/log work (`logWhatsAppInbound`,
 * `recordInboundToApplicationThread`, `updateLastCandidateMessage`) in parallel with
 * the dispatch path, and only await them at the very end so the function does not
 * return before the background promises settle (Vercel `after()` would otherwise
 * freeze the isolate).
 */
export async function handleInboundMessage(payload: InboundMessagePayload): Promise<void> {
  const message = payload?.messages?.[0];
  if (!message) return;

  const messageType = message.type;
  /** Meta `from` must match `whatsapp_sessions.phone` (`91` + 10-digit when Indian). */
  const phone = normalizeIndianPhone(message.from);
  if (!phone) {
    logger.warn("WhatsApp inbound: empty phone after normalize", { from: message.from });
    return;
  }

  const bodyPreview = previewFromInboundMessage(message);
  const adminSupa = createSupabaseAdmin();
  const rawTextBody = message.type === "text" ? (message.text?.body ?? "").trim() : "";

  // Audit / metadata writes — fired in parallel with the user-visible reply path.
  // Awaited at the end so unawaited promises don't get killed when the function returns.
  const backgroundWork: Array<Promise<unknown>> = [
    logWhatsAppInbound({
      phone,
      waMessageId: message.id,
      messageType: message.type,
      bodyPreview,
      metadata: {
        profile_name: payload.contacts?.[0]?.profile?.name,
      },
    }).catch((e) => logger.warn("logWhatsAppInbound failed", { error: String(e) })),
    recordInboundToApplicationThread({
      phone,
      waMessageId: message.id,
      bodyPreview,
    }).catch((e) => logger.warn("recordInboundToApplicationThread failed", { error: String(e) })),
  ];

  try {
    if (message.type === "text" && isOptOutKeyword(rawTextBody)) {
      const normalizedPhone = phone.replace(/\D/g, "");
      const nowIso = new Date().toISOString();
      const { data: optedOutCandidates, error: optOutByPhoneErr } = await adminSupa
        .from("candidates")
        .update({ do_not_call: true, updated_at: nowIso })
        .eq("phone", normalizedPhone)
        .select("id");
      if (optOutByPhoneErr) {
        // DPDP-critical: if we can't record the opt-out, the candidate will keep
        // receiving automated messages. Surface loudly (the webhook still 200s to
        // Meta, but this must not fail silently).
        logger.error("whatsapp opt-out: failed to set do_not_call by phone", {
          phone: normalizedPhone,
          error: optOutByPhoneErr.message,
        });
      }
      const candidateIds = new Set(
        (optedOutCandidates ?? [])
          .map((row) => String((row as { id?: string }).id ?? ""))
          .filter(Boolean),
      );

      const { data: activeJobsByPhone } = await adminSupa
        .from("screening_jobs")
        .select("candidate_id")
        .eq("whatsapp_thread_id", normalizedPhone)
        .in("status", ["queued", "awaiting_consent", "in_progress"]);
      for (const row of activeJobsByPhone ?? []) {
        const candidateId = String((row as { candidate_id?: string }).candidate_id ?? "");
        if (candidateId) candidateIds.add(candidateId);
      }

      const candidateIdsList = Array.from(candidateIds);
      if (candidateIdsList.length > 0) {
        const { error: optOutByIdErr } = await adminSupa
          .from("candidates")
          .update({ do_not_call: true, updated_at: nowIso })
          .in("id", candidateIdsList);
        if (optOutByIdErr) {
          logger.error("whatsapp opt-out: failed to set do_not_call by candidate ids", {
            candidateIds: candidateIdsList,
            error: optOutByIdErr.message,
          });
        }
      }

      if (candidateIdsList.length > 0) {
        const { error } = await adminSupa
          .from("screening_jobs")
          .update({
            status: "cancelled",
            ended_at: nowIso,
            updated_at: nowIso,
          })
          .in("candidate_id", candidateIdsList)
          .in("status", ["queued", "awaiting_consent", "in_progress"]);
        if (error) {
          logger.warn("whatsapp opt-out: failed to cancel screening_jobs by candidate id", {
            error: error.message,
          });
        }
      }

      const { error: cancelByThreadErr } = await adminSupa
        .from("screening_jobs")
        .update({
          status: "cancelled",
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq("whatsapp_thread_id", normalizedPhone)
        .in("status", ["queued", "awaiting_consent", "in_progress"]);
      if (cancelByThreadErr) {
        logger.warn("whatsapp opt-out: failed to cancel screening_jobs by thread", {
          error: cancelByThreadErr.message,
        });
      }

      // Also close any open prescreen gate sessions so lifecycle reminders,
      // re-nudges and inbound routing stop treating this candidate as an
      // active questionnaire (STOP previously only cancelled screening_jobs).
      if (candidateIdsList.length > 0) {
        const { error } = await adminSupa
          .from("prescreen_sessions")
          .update({
            state: "complete",
            completed_at: nowIso,
            updated_at: nowIso,
          })
          .in("candidate_id", candidateIdsList)
          .neq("state", "complete");
        if (error) {
          logger.warn("whatsapp opt-out: failed to close prescreen_sessions", {
            error: error.message,
          });
        }
      }

      // The STOP confirmation is the one send allowed past the do-not-contact
      // gate (do_not_call is already true at this point).
      await sendWhatsAppMessage(
        phone,
        "Understood. You have been removed from automated screening messages. We will not contact you again on this number. Reply START anytime to opt back in.",
        { bypassOptOutGate: true },
      );
      await withSessionCAS(phone, (session) => ({
        state: "opted_out",
        context: {
          ...(session.context ?? {}),
          opt_out_source: "inbound_keyword",
          opt_out_at: nowIso,
        },
      }));
      return;
    }

    if (message.type === "text" && rawTextBody) {
      const screeningHandled = await handleScreeningWhatsappReply({
        phone,
        body: rawTextBody,
      }).catch((err) => {
        logger.warn("Screening WhatsApp reply handling failed", {
          error: String(err),
          phone,
        });
        return false;
      });
      if (screeningHandled) return;
    }

    // Global command: SUBMIT <assessmentToken> <submission URL or text>
    // This works regardless of conversation state and enables WhatsApp-first submissions.
    if (message.type === "text") {
      const text = message.text?.body?.trim() ?? "";
      const match = text.match(/^submit\s+([a-f0-9]{20,})\s+(.+)$/i);
      if (match) {
        const token = match[1];
        const submissionPayload = match[2].trim();
        const isUrl = /^https?:\/\//i.test(submissionPayload);
        const submitted = await submitAssessmentByToken({
          token,
          submissionText: isUrl ? undefined : submissionPayload,
          submissionUrl: isUrl ? submissionPayload : undefined,
          submittedVia: "whatsapp",
          requesterPhone: phone,
        });
        if (!submitted.ok) {
          await sendWhatsAppMessage(
            phone,
            `Could not submit assessment: ${submitted.error}. Please check your token and try again.`,
          );
        } else {
          await sendWhatsAppMessage(
            phone,
            "Assessment submitted successfully. Thanks - your reviewer will evaluate it shortly.",
          );
        }
        return;
      }
    }

    // Per-channel pre-screen gate: a candidate answering YES/NO to gating questions is
    // routed to the gate before the normal state machine. Only an unambiguous YES/NO is
    // consumed; STATUS, role numbers, handover, and free text fall through untouched.
    {
      const prescreenReplyBody = normalizeReplyText(message);
      if (prescreenReplyBody) {
        const gateHandled = await handlePrescreenWhatsappReply({
          phone,
          body: prescreenReplyBody,
        }).catch((err) => {
          logger.warn("[prescreen-inbound] reply handling failed", {
            error: String(err),
            phone,
          });
          return false;
        });
        if (gateHandled) return;
      }
      // Documents skip the YES/NO gate above. If a shortlist/apply questionnaire is
      // still open, re-prompt it instead of ingesting the PDF into the general CV bot.
      if (messageType === "document") {
        if (await repromptOpenPrescreenQuestion(phone)) return;
      }
    }

    let session = await getOrCreateSession(phone);

    const consentSync = await syncSessionWithConsent(adminSupa, phone, session);
    if (consentSync.advanced) {
      session = await getOrCreateSession(phone);
    }

    // Track candidate message timestamp in parallel — `requireMarketingOptIn`
    // and `isWithin24HrWindow` read this column. Safe to do in the background
    // because the first reply on a fresh inbound is always free-form text,
    // not a marketing template.
    backgroundWork.push(
      SessionRepository.updateLastCandidateMessage(adminSupa, phone).catch((e) =>
        logger.warn("updateLastCandidateMessage failed", { error: String(e) }),
      ),
    );

    let context = { ...(session.context ?? {}) } as Record<string, unknown>;
    const ext = payload.extracted;
    if (ext?.job_id || ext?.campaign_id) {
      if (ext.job_id) context = { ...context, job_id: ext.job_id, source: "campaign" };
      if (ext.campaign_id) context = { ...context, campaign_id: ext.campaign_id };
      await withSessionCAS(phone, () => ({
        state: session.session_state as WhatsAppSessionState,
        context,
      }));
    }

    if (await shouldSilenceWhatsAppForPhone(phone, session.session_state as WhatsAppSessionState)) {
      return;
    }

    if (isHumanTakeoverActive(context)) {
      // Human responder currently owns the thread; keep bot silent to avoid double messaging.
      return;
    }

    const registeredReferral = await handleRegisteredReferrerInbound({
      referrerPhone: phone,
      message,
      messageType,
      session,
    });
    if (registeredReferral.handled) return;

    // Registered-referrer routing may switch session state (e.g. referral → apply).
    session = await getOrCreateSession(phone);
    context = { ...(session.context ?? {}) } as Record<string, unknown>;
    let state = session.session_state as WhatsAppSessionState;

    // Route explicit site/contact business intent to sales handoff even for returning
    // candidate sessions. Without this, known numbers can get candidate helper prompts.
    if (message.type === "text" && isMarketingHandoffText(message.text?.body ?? "")) {
      if (state === "business_inquiry") {
        await sendWhatsAppMessage(phone, BUSINESS_INQUIRY_FOLLOWUP_REPLY);
      } else {
        await sendWhatsAppMessage(phone, MARKETING_HANDOFF_REPLY);
      }
      await withSessionCAS(phone, () => ({
        state: "business_inquiry",
        context: {
          ...context,
          inbound_route: "marketing_handoff_any_state",
        },
      }));
      return;
    }

    switch (state) {
      case "new": {
        const text = message.type === "text" ? (message.text?.body ?? "") : "";
        if (message.type === "text" && isUnsolicitedAckReplyText(text)) {
          if (isOptOutText(text)) {
            await ConsentService.recordConsentResponse(adminSupa, phone, "no");
            await sendWhatsAppMessage(
              phone,
              "You have been opted out. We will not send further updates on this number unless you opt back in.",
            );
            await withSessionCAS(phone, () => ({
              state: "opted_out",
              context: {
                ...context,
                inbound_route: "unsolicited_ack_opt_out",
              },
            }));
            break;
          }
          await sendWhatsAppMessage(
            phone,
            "This is TigerHire. Your profile was shared for a hiring workflow. Reply APPLY to continue with job matching or STOP to opt out.",
          );
          await withSessionCAS(phone, () => ({
            state: "business_inquiry",
            context: {
              ...context,
              inbound_route: "unsolicited_ack_reply",
            },
          }));
          break;
        }
        const { handled } = await detectAndHandleReferral(phone, text, messageType);
        if (handled) break;

        if (message.type === "text" && isMarketingHandoffText(text)) {
          await sendWhatsAppMessage(phone, MARKETING_HANDOFF_REPLY);
          await withSessionCAS(phone, () => ({
            state: "business_inquiry",
            context: {
              ...context,
              inbound_route: "marketing_handoff",
            },
          }));
          break;
        }

        // New users go through consent flow first. Use "referred_candidate" copy
        // when they were referred by an employee (app referral link) so we already
        // have session context with referred_by.
        const triggerType = context?.referred_by ? "referred_candidate" : "self_cv_drop";
        const consent = await captureConsentViaWhatsApp(adminSupa, phone, triggerType);

        // Returning candidate: consent already on file. Don't leave them hanging —
        // advance straight to the CV-request prompt so the first inbound always
        // gets a reply.
        if (consent.alreadyConsented) {
          await handleNewUser(phone, message, session, context);
          break;
        }

        // Belt-and-braces: if both free-text and template sends fail, send a
        // last-resort plain reply so the user is never left without acknowledgement.
        if (!consent.sent) {
          await sendWhatsAppMessage(
            phone,
            "Hi! I'm TigerHire. Reply YES to let me process your CV and recommend live roles, or NO to opt out. Privacy: https://tigerhire.io/privacy",
          );
        }
        break;
      }
      case "business_inquiry": {
        if (message.type === "text") {
          const body = message.text?.body?.trim() ?? "";
          if (isCandidateIntentText(body)) {
            const triggerType = context?.referred_by ? "referred_candidate" : "self_cv_drop";
            const consent = await captureConsentViaWhatsApp(adminSupa, phone, triggerType);
            if (consent.alreadyConsented) {
              await handleNewUser(phone, message, session, context);
            } else if (!consent.sent) {
              await sendWhatsAppMessage(
                phone,
                "Switching you to job applications. Reply YES to let me process your CV, or NO to opt out. Privacy: https://tigerhire.io/privacy",
              );
            }
            break;
          }
          await sendWhatsAppMessage(phone, BUSINESS_INQUIRY_FOLLOWUP_REPLY);
          break;
        }
        if (messageType === "document") {
          const triggerType = context?.referred_by ? "referred_candidate" : "self_cv_drop";
          const consent = await captureConsentViaWhatsApp(adminSupa, phone, triggerType);
          if (consent.alreadyConsented) {
            // We already have consent — no need to ask again. Tell them to resend
            // the document so we can process it (we don't keep the doc id from
            // a business_inquiry state).
            await sendWhatsAppMessage(
              phone,
              "Got it — please send your CV PDF again and I'll score you against live roles in ~2 minutes.",
            );
            await withSessionCAS(phone, () => ({ state: "cv_requested", context }));
          } else if (!consent.sent) {
            await sendWhatsAppMessage(
              phone,
              "To score your CV we need your consent first. Reply YES to let me process your CV, or NO to opt out. Then send your PDF again. Privacy: https://tigerhire.io/privacy",
            );
          } else {
            // Consent prompt sent — let the user know to resend the PDF after YES.
            await sendWhatsAppMessage(
              phone,
              "After you reply YES above, please send your PDF again so I can process it.",
            );
          }
          break;
        }
        await sendWhatsAppMessage(
          phone,
          "For job applications, reply APPLY. For business questions, our team will reply on this thread.",
        );
        break;
      }
      case "awaiting_consent": {
        if (await ConsentService.hasRequiredConsent(adminSupa, phone)) {
          await handleNewUser(phone, message, session, context);
          break;
        }

        const text = normalizeReplyText(message);
        const normalized = text
          .toLowerCase()
          .replace(/[*!.?,]+$/g, "")
          .trim();
        const referredBy = context?.referred_by as string | undefined;

        const sendConsentNudgeOnce = async (body: string) => {
          const nudgeKey = referredBy ? "last_referral_consent_nudge_at" : "last_consent_nudge_at";
          const lastRaw = context[nudgeKey];
          const last = typeof lastRaw === "string" && lastRaw.length > 0 ? Date.parse(lastRaw) : 0;
          if (last && Date.now() - last < 5 * 60 * 1000) {
            return;
          }
          await sendWhatsAppMessage(phone, body);
          context = { ...context, [nudgeKey]: new Date().toISOString() };
          await withSessionCAS(phone, () => ({ state: "awaiting_consent", context }));
        };
        if (
          referredBy &&
          text &&
          !/^(yes|y|no|n)$/i.test(normalized) &&
          /\b(refer|referr|friend|colleague)\b/i.test(text)
        ) {
          const referrerName =
            typeof context?.referrer_name === "string" ? context.referrer_name : "your referrer";
          await sendWhatsAppMessage(
            phone,
            `You're the candidate ${referrerName} referred. Reply YES to accept and get your FitScore (or NO to opt out). Your referrer starts referrals from their own WhatsApp — you don't need to refer anyone here.`,
          );
          break;
        }
        const { consented } = await recordConsentResponse(adminSupa, phone, normalized);
        if (consented) {
          await handleNewUser(phone, message, session, context);
        } else if (normalized === "no" || normalized === "n") {
          await sendWhatsAppMessage(
            phone,
            "Understood. Your data will not be processed. You can reach out anytime if you change your mind.",
          );
        } else if (referredBy) {
          await sendConsentNudgeOnce(
            "Reply YES to accept your referral and get your FitScore, or NO to opt out. Privacy: https://tigerhire.io/privacy",
          );
        } else {
          await sendConsentNudgeOnce(
            "Just reply YES to let me process your CV and match you with jobs, or NO to stop. Privacy: https://tigerhire.io/privacy",
          );
        }
        break;
      }
      case "consent_given": {
        // Consent was recorded; continue to CV request (e.g. if next message arrived before state was read)
        await handleNewUser(phone, message, session, context);
        break;
      }
      case "opted_out": {
        const text =
          message.type === "text" ? (message.text?.body?.trim().toLowerCase() ?? "") : "";
        // Re-opt-in: the opt-out copy promises "unless you opt back in", but there
        // was no way back — opted_out was an exitless state. An explicit re-opt-in
        // keyword clears do-not-call and restarts the flow (the candidate's own
        // action is the consent). (#341)
        const reOptInKeywords = ["start", "restart", "resume", "opt in", "opt-in", "continue"];
        if (reOptInKeywords.includes(text)) {
          const normalizedPhone = phone.replace(/\D/g, "");
          const { error: reOptInErr } = await adminSupa
            .from("candidates")
            .update({ do_not_call: false, updated_at: new Date().toISOString() })
            .eq("phone", normalizedPhone);
          if (reOptInErr) {
            logger.error("whatsapp re-opt-in: failed to clear do_not_call", {
              phone: normalizedPhone,
              error: reOptInErr.message,
            });
          }
          await withSessionCAS(phone, (s) => ({
            state: "new",
            context: { ...(s.context ?? {}) },
          }));
          await sendWhatsAppMessage(
            phone,
            "Welcome back — you're opted back in. Send your CV as a PDF and I'll match you with open roles.",
            { bypassOptOutGate: true },
          );
          break;
        }
        if (text === "delete my data") {
          try {
            // Canonical resolution — was .maybeSingle() which threw when a phone
            // had multiple candidate rows (erasure would then hit the wrong/no row).
            const erasureIdentity = await resolvePhoneIdentity(adminSupa, phone);
            const candidateId = erasureIdentity.candidateId ?? undefined;

            const req = await ConsentService.requestErasure(
              adminSupa,
              candidateId,
              phone,
              "whatsapp",
            );
            if (candidateId) {
              await CandidateService.eraseData(adminSupa, candidateId);
              await adminSupa
                .from("erasure_requests")
                .update({ status: "completed", completed_at: new Date().toISOString() })
                .eq("id", req.id);
            }

            logger.info("Erasure request received and processed via WhatsApp", {
              message: phone,
              candidate_id: candidateId ?? undefined,
              request_id: req.id,
            });
            await sendWhatsAppMessage(
              phone,
              candidateId
                ? "Your data erasure request has been processed. Your TigerHire profile data has been deleted."
                : "Your data erasure request has been submitted. We will process it shortly.",
            );
          } catch (erasureErr) {
            logger.error("Failed to process WhatsApp erasure request", {
              message: phone,
              error: String(erasureErr),
            });
            await sendWhatsAppMessage(
              phone,
              "We received your erasure request, but could not process it right now. Please try again later.",
            );
          }
        } else {
          await sendWhatsAppMessage(
            phone,
            "You have opted out of TigerHire. Reply 'START' to opt back in, or 'DELETE MY DATA' to request data erasure.",
          );
        }
        break;
      }
      case "referral_phone_requested": {
        const candidatePhone = message.type === "text" ? (message.text?.body?.trim() ?? "") : "";
        await handleReferralCandidatePhone(phone, candidatePhone, context);
        break;
      }
      case "referral_complete": {
        const text = message.type === "text" ? (message.text?.body ?? "") : "";
        if (message.type === "text" && looksLikeApplyIntent(text)) {
          const hints = parseApplyPrefillHints(text);
          await switchToCandidateApplyFlow(phone, context, {
            ...hints,
            reason: "referral_complete_apply",
          });
          break;
        }
        if (messageType === "document") {
          await handleCVReceived(phone, message, session as WhatsAppSession, context);
          break;
        }
        const { handled } = await detectAndHandleReferral(phone, text, messageType);
        if (!handled) {
          await sendWhatsAppMessage(
            phone,
            "Referral sent. Reply APPLY to apply for jobs yourself (send your CV as a PDF), or send a name + number to refer someone else.",
          );
        }
        break;
      }
      case "cv_requested":
        if (messageType === "document") {
          await handleCVReceived(phone, message, session as WhatsAppSession, context);
        } else if (
          messageType === "text" &&
          isOpenRolesIntentText(message.text?.body?.trim() ?? "")
        ) {
          await sendOpenRolesPreview(phone);
        } else if (
          messageType === "text" &&
          (isHumanHandoverText(message.text?.body?.trim() ?? "") ||
            isFrustrationText(message.text?.body?.trim() ?? ""))
        ) {
          await sendHandoverReply(
            phone,
            "cv_requested",
            context,
            isHumanHandoverText(message.text?.body?.trim() ?? "") ? "requested" : "frustration",
          );
        } else if (
          messageType === "text" &&
          isCvAlreadySentText(message.text?.body?.trim() ?? "")
        ) {
          const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
          const hasCvOnSession =
            typeof context.document_id === "string" && context.document_id.length > 0;
          const nextContext = await sendStateAwareReply(
            phone,
            "cv_requested",
            context,
            "cv_requested_already_shared",
            hasCvOnSession
              ? `I can see your recent CV. You can check current matches at ${base}, reply STATUS for progress, or send a newer PDF to refresh your score.`
              : "I don't see a CV file in this thread yet. Please send your CV as a PDF and I'll score it.",
            hasCvOnSession
              ? "If you've updated your CV, send the new PDF and I'll rescore immediately."
              : "Once you send the PDF, I'll start scoring right away.",
          );
          await withSessionCAS(phone, () => ({
            state: "cv_requested",
            context: { ...nextContext, unclear_turn_count: 0 },
          }));
        } else if (messageType === "text" && isGreetingText(message.text?.body?.trim() ?? "")) {
          const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
          const nextContext = await sendStateAwareReply(
            phone,
            "cv_requested",
            context,
            "cv_requested_greeting",
            `Hi! Send a CV PDF for scoring, reply STATUS for application updates, or open ${base} for your matches.`,
            `You're in the right chat — CV PDF, STATUS, or ${base} all work here.`,
          );
          await withSessionCAS(phone, () => ({
            state: "cv_requested",
            context: { ...nextContext, unclear_turn_count: 0 },
          }));
        } else if (
          messageType === "text" &&
          normalizeInboundText(message.text?.body ?? "") === "status"
        ) {
          await sendApplicationStatusReply(phone);
          await withSessionCAS(phone, () => ({
            state: "cv_requested",
            context: { ...context, unclear_turn_count: 0 },
          }));
        } else if (
          messageType === "text" &&
          normalizeInboundText(message.text?.body ?? "") === "matches"
        ) {
          const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
          const nextContext = await sendStateAwareReply(
            phone,
            "cv_requested",
            context,
            "cv_requested_matches",
            `Your latest matches are on TigerHire: ${base}\n\nSign in with your email, or send a fresh CV PDF for a new score.`,
            `Still trying to open matches? Use ${base}\n\nYou can also send a new CV PDF and I'll refresh your score.`,
          );
          await withSessionCAS(phone, () => ({
            state: "cv_requested",
            context: { ...nextContext, unclear_turn_count: 0 },
          }));
        } else if (messageType === "text" && resolveRolePickPhase(session as WhatsAppSession)) {
          const body = message.text?.body?.trim() ?? "";
          await routeRolePickReply(phone, body, session as WhatsAppSession);
        } else {
          const unclearCount = Number(context.unclear_turn_count ?? 0) + 1;
          const nextContext = { ...context, unclear_turn_count: unclearCount };
          if (unclearCount >= WHATSAPP_HANDOVER_UNCLEAR_THRESHOLD) {
            await sendHandoverReply(phone, "cv_requested", nextContext, "unclear_loop");
            break;
          }
          if (await repromptOpenPrescreenQuestion(phone)) {
            break;
          }
          const hasCvOnSession =
            typeof context.document_id === "string" && context.document_id.length > 0;
          const responseContext = await sendStateAwareReply(
            phone,
            "cv_requested",
            nextContext,
            "cv_requested_fallback",
            hasCvOnSession
              ? "I already have your recent CV. Reply STATUS, MATCHES, or send an updated PDF if you want a fresh score."
              : "Please send your CV as a PDF file.",
            hasCvOnSession
              ? "Still here — STATUS for updates, MATCHES for roles, or send a newer PDF for a refresh."
              : "Still waiting on your CV PDF. Once received, I'll score it in about 2 minutes.",
          );
          await withSessionCAS(phone, () => ({
            state: "cv_requested",
            context: {
              ...responseContext,
              unclear_turn_count: unclearCount,
            },
          }));
        }
        break;
      case "collecting_preferences": {
        if (message.type === "text") {
          await handleCollectingPreferencesReply(
            phone,
            message.text?.body?.trim() ?? "",
            session as WhatsAppSession,
          );
        } else {
          await sendWhatsAppMessage(phone, "Please reply with text to continue.");
        }
        break;
      }
      case "role_family_selection": {
        if (message.type === "text") {
          await handleRoleFamilySelectionReply(
            phone,
            message.text?.body?.trim() ?? "",
            session as WhatsAppSession,
          );
        } else {
          await sendWhatsAppMessage(phone, "Please reply with the role number to continue.");
        }
        break;
      }
      case "role_job_selection": {
        if (message.type === "text") {
          await handleRoleJobSelectionReply(
            phone,
            message.text?.body?.trim() ?? "",
            session as WhatsAppSession,
          );
        } else {
          await sendWhatsAppMessage(phone, "Please reply with the role number to continue.");
        }
        break;
      }
      case "screening_questions": {
        if (message.type !== "text") {
          await sendWhatsAppMessage(phone, "Please reply YES or NO to the screening question.");
          break;
        }
        const outcome = await handleScreeningQuestionsReply(
          phone,
          message.text?.body?.trim() ?? "",
          session as WhatsAppSession,
        );
        if (outcome.status === "complete") {
          const supabase = createSupabaseAdmin();
          const { data: selectedJob } = await supabase
            .from("jobs")
            .select("*, organisation_id")
            .eq("id", outcome.jobId)
            .eq("status", "open")
            .maybeSingle();
          if (!selectedJob) {
            await sendWhatsAppMessage(
              phone,
              "That role is no longer open. Please pick another role from the list.",
            );
            await withSessionCAS(phone, () => ({
              state: "active_alerts",
              context,
              extras: { qa_step: session.qa_step ?? 2 },
            }));
            break;
          }
          const jobTitle = String(
            (context.screening_job_title as string | undefined) ??
              (selectedJob as { title?: string }).title ??
              "this role",
          );
          await scoreAndPresentSelectedRole({
            phone,
            candidateId: outcome.candidateId,
            selected: {
              id: outcome.jobId,
              title: String((selectedJob as { title?: string }).title ?? jobTitle),
              location: String((selectedJob as { location?: string }).location ?? "—") || "—",
              roleFunction:
                ((selectedJob as { role_function?: string | null }).role_function as
                  | string
                  | null) ?? null,
            },
            selectedJob: selectedJob as Record<string, unknown>,
            processingContext: context,
            sessionContext: context,
            qaStep: session.qa_step ?? 2,
            applyTitle: jobTitle,
            introMessage: `Thanks — that's all the quick questions for *${jobTitle}*. Scoring your fit now.`,
          });
        }
        // status "asking" | "ambiguous" | "knockout": message already sent; stay/exit handled
        // by the reply handler (knockout leaves the session in screening_questions but the
        // candidate is not scored; they may pick another role from the menu).
        break;
      }
      case "preferences_complete": {
        if (messageType === "document") {
          await handleCVReceived(phone, message, session as WhatsAppSession, context);
          break;
        }
        if (message.type === "text") {
          const body = message.text?.body?.trim() ?? "";
          const text = normalizeInboundText(body);
          const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
          if (isHumanHandoverText(body) || isFrustrationText(body)) {
            await sendHandoverReply(
              phone,
              "preferences_complete",
              context,
              isHumanHandoverText(body) ? "requested" : "frustration",
            );
            break;
          }
          if (isClosureText(body)) {
            const nextContext = {
              ...context,
              conversation_paused_at: new Date().toISOString(),
              conversation_outcome: "paused",
              unclear_turn_count: 0,
            };
            await sendWhatsAppMessage(
              phone,
              "All set — I will pause here. If scoring is still running, I will post the result in this chat automatically. Later you can send STATUS, MATCHES, or a new CV PDF.",
            );
            await withSessionCAS(phone, () => ({
              state: "preferences_complete",
              context: nextContext,
              extras: { qa_step: session.qa_step ?? 2 },
            }));
            break;
          }
          if (text === "status") {
            await sendApplicationStatusReply(phone);
            break;
          }
          const inProgress = context.fit_score_eval_in_progress === true;
          if (inProgress) {
            await sendStateAwareReply(
              phone,
              "preferences_complete",
              context,
              "fit_score_eval_wait",
              "I am still evaluating your profile. This usually takes around 2 minutes. No action needed from your side - I will post your score here as soon as it is ready.",
              "Still working on it - usually up to 2 minutes from your role selection. I will send your result automatically in this chat.",
            );
            break;
          }
          if (text === "matches") {
            await sendWhatsAppMessage(
              phone,
              `Your latest matches are on TigerHire: ${base}\n\nSend a new CV PDF anytime to refresh your FitScore.`,
            );
            break;
          }
          if (text === "preferences") {
            await sendWhatsAppMessage(
              phone,
              `Set job preferences here:\n${base}/candidate/profile\n\nAfter updating, send a CV PDF to refresh your score.`,
            );
            break;
          }
          await sendWhatsAppMessage(
            phone,
            "I am wrapping up your match results and will message you shortly. You can reply STATUS for applications, MATCHES for your roles, or DONE to pause.",
          );
        }
        break;
      }
      case "active_alerts":
      case "expired": {
        if (messageType === "document") {
          await handleCVReceived(phone, message, session as WhatsAppSession, context);
          break;
        }
        if (message.type === "text") {
          const body = message.text?.body?.trim() ?? "";
          const text = normalizeInboundText(body);
          const nowMs = Date.now();
          const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
          const pausedAtRaw =
            typeof context.conversation_paused_at === "string"
              ? context.conversation_paused_at
              : null;
          const pausedAtMs = pausedAtRaw ? Date.parse(pausedAtRaw) : Number.NaN;
          if (isHumanHandoverText(body) || isFrustrationText(body)) {
            await sendHandoverReply(
              phone,
              state,
              context,
              isHumanHandoverText(body) ? "requested" : "frustration",
            );
            break;
          }
          if (
            !isActionableTextForAlerts(text) &&
            !isGreetingText(body) &&
            !Number.isNaN(pausedAtMs) &&
            nowMs - pausedAtMs < 10 * 60 * 1000
          ) {
            // User already acknowledged closure recently; avoid repeated prompts.
            break;
          }
          if (isClosureText(body)) {
            context = await sendStateAwareReply(
              phone,
              state,
              context,
              "closure",
              "Perfect — I will pause here.\n\nWhenever you want, send a CV PDF for a fresh score or reply STATUS for updates.",
              "All set. I will stay quiet now — message me anytime with CV PDF, STATUS, or MATCHES.",
            );
            context = {
              ...context,
              conversation_paused_at: new Date(nowMs).toISOString(),
            };
            await withSessionCAS(phone, () => ({ state, context }));
            break;
          }
          if (text === "status") {
            await sendApplicationStatusReply(phone);
            break;
          }
          if (text === "matches") {
            context = await sendStateAwareReply(
              phone,
              state,
              context,
              "matches_link",
              `Your latest matches are on TigerHire: ${base}\n\nOpen the link and sign in with your email.`,
              `Still trying to open matches? Go to: ${base}\n\nIf the list looks old, send a fresh CV PDF here and I'll rescore you.`,
            );
            break;
          }
          if (text === "preferences") {
            context = await sendStateAwareReply(
              phone,
              state,
              context,
              "preferences_link",
              `Set your preferences (location, remote, salary) here:\n${base}/candidate/profile`,
              `Quick reminder: preferences are here → ${base}/candidate/profile\n\nAfter updating, send your CV PDF again for a fresh score.`,
            );
            break;
          }
          if (isCvAlreadySentText(body)) {
            const hasCvOnSession =
              typeof context.document_id === "string" && context.document_id.length > 0;
            context = await sendStateAwareReply(
              phone,
              state,
              context,
              "cv_ack",
              hasCvOnSession
                ? `I can see your recent CV. I'm using it for matches.\n\nCheck results on ${base}, or send a newer PDF anytime to refresh your FitScore.`
                : `I don't see a CV file in this chat yet.\n\nPlease send your CV as a PDF and I'll score it against open roles in about 2 minutes.`,
              hasCvOnSession
                ? `If you shared an updated CV, please send the PDF once more so I can refresh your FitScore immediately.`
                : `Once you send the PDF, I will score it and share next steps right here.`,
            );
            break;
          }
          if (isGreetingText(body)) {
            context = await sendStateAwareReply(
              phone,
              state,
              context,
              "greeting",
              `Hi! I can help with three things right now:\n1) Send CV PDF for fresh FitScore\n2) Reply STATUS for application updates\n3) Open ${base} for matches and applications`,
              `You're in the right place — send CV PDF for a new score, or reply STATUS for updates.`,
            );
            break;
          }
          if (await repromptOpenPrescreenQuestion(phone)) {
            break;
          }
          context = await sendStateAwareReply(
            phone,
            state,
            context,
            "portal_fallback",
            `For matches and applications, open TigerHire: ${base}\n\nYou can also send a new CV as a PDF to refresh your FitScore.`,
            `Still here with you — open ${base} for matches, or send a new CV PDF and I'll refresh your score.`,
          );
          const unclearCount = Number(context.unclear_turn_count ?? 0) + 1;
          context = { ...context, unclear_turn_count: unclearCount };
          if (unclearCount >= WHATSAPP_HANDOVER_UNCLEAR_THRESHOLD) {
            await sendHandoverReply(phone, state, context, "unclear_loop");
            break;
          }
          await withSessionCAS(phone, () => ({ state, context }));
        }
        break;
      }
      case "vouch_q1":
      case "vouch_q2":
      case "vouch_q3":
      case "vouch_q4":
      case "vouch_q5": {
        const text = message.type === "text" ? (message.text?.body ?? "") : "";
        await handleVouchResponse(phone, text, state, context);
        break;
      }
      case "scored": {
        if (messageType === "document") {
          await handleCVReceived(phone, message, session as WhatsAppSession, context);
          break;
        }
        const reply = message.type === "text" ? (message.text?.body?.trim() ?? "") : "";
        if (isHumanHandoverText(reply) || isFrustrationText(reply)) {
          await sendHandoverReply(
            phone,
            "scored",
            context,
            isHumanHandoverText(reply) ? "requested" : "frustration",
          );
          break;
        }
        const normalizedReply = normalizeInboundText(reply);
        const nowMs = Date.now();
        const pausedAtRaw =
          typeof context.conversation_paused_at === "string"
            ? context.conversation_paused_at
            : null;
        const pausedAtMs = pausedAtRaw ? Date.parse(pausedAtRaw) : Number.NaN;
        if (
          !isActionableTextForAlerts(normalizedReply) &&
          !isGreetingText(reply) &&
          !Number.isNaN(pausedAtMs) &&
          nowMs - pausedAtMs < 10 * 60 * 1000
        ) {
          // User acknowledged closure recently; avoid repeating prompts.
          break;
        }
        if (isClosureText(reply)) {
          context = await sendStateAwareReply(
            phone,
            "scored",
            context,
            "closure",
            "Perfect — I will pause here.\n\nReply with a role number, send CV PDF, or type STATUS whenever you want to continue.",
            "All set. I will stay quiet now — message me anytime with a role number, CV PDF, STATUS, or MATCHES.",
          );
          context = {
            ...context,
            conversation_paused_at: new Date(nowMs).toISOString(),
          };
          await withSessionCAS(phone, () => ({ state: "scored", context }));
          break;
        }
        const choice = parseInt(reply, 10);
        const isValidChoice =
          Number.isInteger(choice) && choice >= 1 && choice <= TOP_MATCHES_LIMIT;
        if (isValidChoice) {
          // Digits are legitimate prescreen replies too (interactive.ts maps 1→YES,
          // 2→NO and single-select prompts say "Reply with the number"), and the gate
          // deliberately lets pure digits fall through mid-questionnaire. If an open
          // prescreen session exists, it owns this digit: re-prompt the pending
          // question instead of silently filing a job application.
          if (await repromptOpenPrescreenQuestion(phone)) {
            break;
          }
          await createApplicationFromWhatsApp(phone, choice, context);
        } else if (reply?.toLowerCase() === "status") {
          await sendApplicationStatusReply(phone);
        } else if (reply?.toLowerCase() === "preferences") {
          const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
          await sendWhatsAppMessage(
            phone,
            `Set job preferences (location, remote, salary) for relevant roles:\n${base}/candidate/profile`,
          );
        } else if (reply?.toLowerCase() === "matches") {
          await sendWhatsAppMessage(
            phone,
            "Check your matches at " +
              (process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io") +
              " — log in with your email.",
          );
        } else {
          await sendWhatsAppMessage(
            phone,
            `Reply with the number of the role you want (1 to ${TOP_MATCHES_LIMIT}), PREFERENCES to set preferences, STATUS to check your applications, or send a new CV to get scored again.`,
          );
          const unclearCount = Number(context.unclear_turn_count ?? 0) + 1;
          context = { ...context, unclear_turn_count: unclearCount };
          if (unclearCount >= WHATSAPP_HANDOVER_UNCLEAR_THRESHOLD) {
            await sendHandoverReply(phone, "scored", context, "unclear_loop");
            break;
          }
          await withSessionCAS(phone, () => ({ state: "scored", context }));
        }
        break;
      }
      case "complete": {
        if (messageType === "document") {
          await handleCVReceived(phone, message, session as WhatsAppSession, context);
        } else {
          await handleGeneral(phone, message, session, context);
        }
        break;
      }
      case "slot_selection": {
        const choice = message.type === "text" ? (message.text?.body?.trim() ?? "") : "";
        await handleSlotSelection(phone, choice, context);
        break;
      }
      case "cv_received": {
        if (messageType === "document") {
          await handleCVReceived(phone, message, session as WhatsAppSession, context);
        } else {
          await sendWhatsAppMessage(
            phone,
            "We're still processing your CV — I'll message you when your FitScore is ready. You can send another PDF if you meant to replace it.",
          );
        }
        break;
      }
      case "referral_ready": {
        await sendWhatsAppMessage(
          phone,
          "To refer someone, send their name, WhatsApp number, or CV PDF. Reply REFER anytime to start fresh.",
        );
        break;
      }
      case "referral_collecting": {
        await sendWhatsAppMessage(
          phone,
          "Send the candidate's phone number to continue your referral (10-digit Indian mobile is fine).",
        );
        break;
      }
      default:
        await handleGeneral(phone, message, session, context);
    }
  } finally {
    // Ensure the audit log + last_candidate_message_at writes complete before
    // the function returns. Otherwise Vercel's `after()` may freeze the isolate
    // and leave them un-flushed.
    await Promise.allSettled(backgroundWork);
  }
}

async function handleNewUser(
  phone: string,
  _message: InboundMessage,
  _session: { context?: Record<string, unknown> },
  context: Record<string, unknown>,
): Promise<void> {
  const isReferral = Boolean(context?.referred_by);
  const referrerName = (context?.referrer_name as string) || "someone";

  const welcomeMsg = isReferral
    ? `Thanks! ${referrerName} thinks you'd be a great fit — send me your CV as a PDF and I'll score it against live roles in about 2 minutes.`
    : "Thanks! Send me your CV as a PDF and I'll score it against live roles in about 2 minutes.";

  await sendWhatsAppMessage(phone, welcomeMsg);
  await withSessionCAS(phone, () => ({ state: "cv_requested", context }));
}

async function handleCVReceived(
  phone: string,
  message: InboundMessage,
  session: WhatsAppSession,
  context: Record<string, unknown>,
): Promise<void> {
  const documentId = message.document?.id?.trim() ?? "";
  if (!documentId) {
    await sendWhatsAppMessage(phone, "Please send your CV as a PDF file.");
    return;
  }

  const jobId = typeof context.job_id === "string" ? context.job_id : undefined;
  const docKey = documentId;
  const replacingPriorCv =
    session.session_state === "cv_received" ||
    session.session_state === "scored" ||
    typeof context.document_id === "string";

  await withSessionCAS(phone, () => ({
    state: "cv_received",
    context: {
      ...context,
      document_id: docKey,
      referral_draft: null,
      pending_self_cv: false,
    },
  }));

  const scoutInput = {
    phone,
    document_id: documentId,
    session_context: { ...context, document_id: docKey },
    whatsapp_message_id: message.id,
  };

  try {
    if (jobId) {
      await sendWhatsAppMessage(
        phone,
        replacingPriorCv
          ? "Got your updated CV. Rescoring you for this role now — this may take a couple of minutes."
          : "Got your CV. Scoring you for this role now — this may take a couple of minutes.",
      );
      await handleLaneASingleJobScore(scoutInput, jobId);
      return;
    }

    await sendWhatsAppMessage(
      phone,
      replacingPriorCv
        ? "Got your updated CV. I'll rank you against current open roles again."
        : "Got your CV. First, choose from currently open roles so I can rank you against the right JD.",
    );
    const ingested = await runWhatsAppCvIngest(scoutInput);
    if (!ingested) {
      const mergedContext: Record<string, unknown> = {
        ...context,
        document_id: docKey,
        candidate_id:
          (context.candidate_id as string | undefined) ??
          (session.context?.candidate_id as string | undefined),
      };
      const candidateId = mergedContext.candidate_id as string | undefined;
      if (asJobOptions(mergedContext.guided_job_options).length > 0) {
        await withSessionCAS(phone, () => ({
          state: "role_job_selection",
          context: mergedContext,
        }));
        return;
      }
      if (asRoleOptions(mergedContext.guided_role_options).length > 0) {
        await withSessionCAS(phone, () => ({
          state: "role_family_selection",
          context: mergedContext,
        }));
        return;
      }
      if (candidateId) {
        await startRoleGuidedFlow(phone, mergedContext, candidateId);
        return;
      }
      await withSessionCAS(phone, () => ({ state: "cv_requested", context: mergedContext }));
      return;
    }
    triggerVerifyAgent(ingested.candidateId).catch(async (err) => {
      logger.warn("WhatsApp Lane B: verify agent error", { error: String(err) });
    });
    await startRoleGuidedFlow(
      phone,
      { ...context, document_id: docKey, candidate_id: ingested.candidateId },
      ingested.candidateId,
    );
  } catch (err) {
    logger.error("WhatsApp handler: CV pipeline error", { error: String(err) });
    await sendWhatsAppMessage(
      phone,
      "Sorry, we had trouble reading your CV. Please try sending it again as a PDF.",
    );
    await withSessionCAS(phone, () => ({ state: "cv_requested", context }));
  }
}

async function handleGeneral(
  phone: string,
  message: InboundMessage,
  session: { session_state: string; context?: Record<string, unknown> },
  context: Record<string, unknown>,
): Promise<void> {
  const text = message.type === "text" ? message.text?.body?.trim() : "";
  if (session.session_state === "complete") {
    if (isHumanHandoverText(text ?? "") || isFrustrationText(text ?? "")) {
      await sendHandoverReply(
        phone,
        "complete",
        context,
        isHumanHandoverText(text ?? "") ? "requested" : "frustration",
      );
      return;
    }
    if (isClosureText(text ?? "")) {
      await sendWhatsAppMessage(
        phone,
        "You're welcome. I will pause here — send CV PDF, MATCHES, or STATUS whenever you need.",
      );
      await withSessionCAS(phone, () => ({
        state: "complete",
        context: {
          ...context,
          conversation_paused_at: new Date().toISOString(),
          conversation_outcome: "paused",
        },
      }));
      return;
    }
    if (isCvAlreadySentText(text ?? "")) {
      const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
      const hasCvOnSession =
        typeof context.document_id === "string" && context.document_id.length > 0;
      await sendWhatsAppMessage(
        phone,
        hasCvOnSession
          ? `Thanks — I still have your recent CV context. For fresh ranking, please send the latest PDF again.\n\nYou can also view current matches at ${base}.`
          : "Thanks — please send your CV as a PDF and I'll score it against current open roles.",
      );
      return;
    }
    if (text?.toLowerCase() === "status") {
      await sendApplicationStatusReply(phone);
      return;
    }
    if (text?.toLowerCase() === "matches") {
      await sendWhatsAppMessage(
        phone,
        "Check your FitScore matches at " +
          (process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io") +
          " — log in or sign up with your email.",
      );
      return;
    }
    if (text?.toLowerCase() === "preferences") {
      const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
      await sendWhatsAppMessage(
        phone,
        `Set your job preferences (location, remote, salary range) so we show you the most relevant roles:\n${base}/candidate/profile\n\nLog in with your email — you can set preferences there.`,
      );
      return;
    }
    const unclearCount = Number(context.unclear_turn_count ?? 0) + 1;
    if (unclearCount >= WHATSAPP_HANDOVER_UNCLEAR_THRESHOLD) {
      await sendHandoverReply(
        phone,
        "complete",
        { ...context, unclear_turn_count: unclearCount },
        "unclear_loop",
      );
      return;
    }
    await sendWhatsAppMessage(
      phone,
      "Reply MATCHES to see your top roles, PREFERENCES to set job preferences, STATUS to check applications, or send a new CV to get scored again.",
    );
    await withSessionCAS(phone, () => ({
      state: "complete",
      context: { ...context, unclear_turn_count: unclearCount },
    }));
    return;
  }
  await sendWhatsAppMessage(phone, "Send your CV as a PDF to get your FitScore.");
  await withSessionCAS(phone, () => ({ state: "cv_requested", context }));
}

/**
 * Look up active applications for this phone number and reply with their status.
 */
async function sendApplicationStatusReply(phone: string): Promise<void> {
  const supabase = createSupabaseAdmin();

  // Canonical resolution — was .maybeSingle() which threw when a phone mapped to
  // multiple candidate rows, silently failing the status reply.
  const identity = await resolvePhoneIdentity(supabase, phone);
  const candidateId = identity.candidateId;

  if (!candidateId) {
    await sendWhatsAppMessage(
      phone,
      "We don't have any applications on file for this number. Send your CV to get started!",
    );
    return;
  }

  const { data: apps } = await supabase
    .from("applications")
    .select(
      "id, status, job_id, referral_link_id, direct_referrer_id, created_at, jobs(title, status)",
    )
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!apps || apps.length === 0) {
    await sendWhatsAppMessage(
      phone,
      "You have no active applications yet. Reply with the number of a role from your matches to apply!",
    );
    return;
  }

  type ApplicationStatusRow = {
    id?: string | null;
    status?: string | null;
    job_id?: string | null;
    referral_link_id?: string | null;
    direct_referrer_id?: string | null;
    created_at?: string | null;
    jobs?:
      | { title?: string | null; status?: string | null }
      | { title?: string | null; status?: string | null }[]
      | null;
  };

  const STATUS_PREFIX: Record<string, string> = {
    applied: "Applied",
    viewed: "Viewed by recruiter",
    shortlisted: "Shortlisted",
    in_progress: "In progress",
    interview_scheduled: "Interview scheduled",
    hired: "Hired",
    rejected: "Not moving forward",
    withdrawn: "Withdrawn",
  };

  function nextStepForStatus(status: string, jobClosed: boolean, scoreText: string): string {
    if (jobClosed) return "This position is closed; no further candidate action is needed.";
    if (status === "rejected") return "This role is closed for your application.";
    if (status === "withdrawn") return "You withdrew this application.";
    if (status === "hired") return "The hiring team will coordinate joining steps.";
    if (status === "interview_scheduled")
      return "Your interview is scheduled; watch this chat/email for reminders.";
    if (status === "shortlisted" || status === "in_progress") {
      return "Recruiter review is next; we will message when there is an interview or decision.";
    }
    if (scoreText.includes("queued")) {
      return "No action needed; we will message here when the score is ready.";
    }
    return "Recruiter review is next; you can reply MATCHES to see other roles.";
  }

  const enriched = await Promise.all(
    (apps as ApplicationStatusRow[]).map(async (a) => {
      const jobId = a.job_id ?? "";
      const [pendingScore, fitScore] = await Promise.all([
        jobId
          ? supabase
              .from("pending_jd_approval")
              .select("job_id")
              .eq("candidate_id", candidateId)
              .eq("job_id", jobId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        jobId
          ? supabase
              .from("fit_scores")
              .select("overall_score")
              .eq("candidate_id", candidateId)
              .eq("job_id", jobId)
              .or("is_test_run.eq.false,is_test_run.is.null")
              .is("superseded_at", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const jobRow = Array.isArray(a.jobs) ? a.jobs[0] : a.jobs;
      const title = jobRow?.title || "Unknown role";
      const status = a.status || "applied";
      const jobClosed = jobRow?.status === "closed";
      const score = (fitScore.data as { overall_score?: number | null } | null)?.overall_score;
      const scoreText =
        typeof score === "number"
          ? `FitScore ${Math.round(score)}`
          : pendingScore.data
            ? "FitScore queued"
            : "FitScore not ready yet";
      const referralText =
        a.referral_link_id || a.direct_referrer_id ? " Referred application." : "";
      const label = STATUS_PREFIX[status] ?? status.replace(/_/g, " ");
      return `${title}: ${jobClosed ? "Role closed" : label}. ${scoreText}.${referralText} Next: ${nextStepForStatus(status, jobClosed, scoreText)}`;
    }),
  );

  await sendWhatsAppMessage(
    phone,
    `Your application status:\n\n${enriched.map((line, index) => `${index + 1}. ${line}`).join("\n\n")}\n\nReply MATCHES for other roles or send a new CV PDF anytime to refresh.`,
  );
}

async function sendOpenRolesPreview(phone: string): Promise<void> {
  const supabase = createSupabaseAdmin();
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://tigerhire.io";
  const { fetchCandidateMenuOpenJobs } = await import("./candidate-menu-jobs");
  const rows = await fetchCandidateMenuOpenJobs(supabase);

  if (rows.length === 0) {
    await sendWhatsAppMessage(
      phone,
      `There are no public roles listed right now. Keep an eye on ${base}/jobs.\n\nWhen you have your CV ready, send it here and I will match you automatically.`,
    );
    return;
  }

  const lines = rows.slice(0, 5).map((row, idx) => {
    const title = row.title.trim() || "Role";
    return `${idx + 1}) ${title}`;
  });
  await sendWhatsAppMessage(
    phone,
    `Here are some open roles right now:\n${lines.join("\n")}\n\nSee all roles: ${base}/jobs\n\nWhen you're ready, send your CV PDF and I will rank your fit.`,
  );
}
