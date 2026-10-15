import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateMessage, sendWhatsAppMessage } from "@/lib/services/whatsapp";
import {
  getOrCreateSession,
  withSessionCAS,
  type WhatsAppSessionState,
} from "@/lib/whatsapp/sessions";
import { recalculateTrustScore } from "./trust-score";
import { VouchScoreSchema } from "@/lib/agents/schemas";
import { isEnabled } from "@/lib/feature-flags";
import { logAgentRun } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import { createHash } from "crypto";
import { MODELS } from "@/lib/config/models";

/**
 * Session states that mean the voucher is *also* mid-flow as a candidate.
 * When a vouch starts, we stash these so we can restore them after Q5 instead of
 * dropping the voucher into a generic `complete` state.
 */
const CANDIDATE_ACTIVE_STATES: ReadonlySet<WhatsAppSessionState> = new Set([
  "new",
  "awaiting_consent",
  "consent_given",
  "cv_requested",
  "cv_received",
  "scored",
  "slot_selection",
  "collecting_preferences",
  "role_family_selection",
  "role_job_selection",
  "preferences_complete",
  "active_alerts",
]);

/**
 * Tokens the voucher can send at any point to opt out of the flow without garbage answers.
 * Intentionally narrow so it does NOT collide with Q5 option 3 ("Not sure"): we only catch
 * explicit decline / defer phrases, not "no" or "not sure".
 */
const VOUCH_DECLINE_REGEX =
  /^(stop|skip|decline|cancel|exit|quit|unsubscribe|not\s*now|maybe\s*later|later|busy|i\s*can'?t|can'?t\s*now)$/i;

type PriorVoucherSession = {
  state: WhatsAppSessionState;
  context: Record<string, unknown>;
};

const VOUCH_QUESTIONS = {
  q1: {
    state: "vouch_q1" as const,
    message: (name: string) =>
      `How did you work with ${name}?\n1. I managed them\n2. We were peers\n3. They managed me\n4. Client or vendor\n5. We studied together`,
    field: "relationship_type",
    options: {
      "1": "managed",
      "2": "peer",
      "3": "managed_me",
      "4": "client",
      "5": "studied_together",
    },
  },
  q2: {
    state: "vouch_q2" as const,
    message: () =>
      `How long did you work together?\n1. Under 6 months\n2. 6-12 months\n3. 1-2 years\n4. 2+ years`,
    field: "duration",
    options: { "1": "under_6m", "2": "6_12m", "3": "1_2y", "4": "2y_plus" },
  },
  q3: {
    state: "vouch_q3" as const,
    message: () =>
      `What are you vouching for? Reply with numbers separated by commas (e.g. 1,3):\n1. Technical skills\n2. Leadership\n3. Execution\n4. Communication\n5. Strategic thinking\n6. Team building`,
    field: "skills_vouched",
    multiSelect: true,
  },
  q4: {
    state: "vouch_q4" as const,
    message: (name: string) => `In one sentence, what makes ${name} stand out? (free text)`,
    field: "standout_sentence",
    freeText: true,
  },
  q5: {
    state: "vouch_q5" as const,
    message: (name: string) =>
      `Would you hire or work with ${name} again?\n1. Yes, without hesitation\n2. Yes, in the right role\n3. Not sure`,
    field: "rehire_intent",
    options: { "1": "yes_definitely", "2": "yes_right_role", "3": "not_sure" },
  },
};

const Q_ORDER = ["q1", "q2", "q3", "q4", "q5"] as const;
const SKILL_MAP: Record<string, string> = {
  "1": "Technical skills",
  "2": "Leadership",
  "3": "Execution",
  "4": "Communication",
  "5": "Strategic thinking",
  "6": "Team building",
};
const CIRCULAR_DEPTH_3_FLAG = "circular_vouch_depth_3";

type CircularVouchReason = "pairwise_cycle" | "depth_3_cycle";

function hashPhoneForMetric(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return createHash("sha256").update(phone, "utf8").digest("hex").slice(0, 16);
}

function logCircularVouchBlockedMetric(input: {
  candidateId: string;
  reason: CircularVouchReason;
  depth: 2 | 3;
  voucherPhone: string;
  candidatePhone: string;
}) {
  logger.info("metric.circular_vouch_blocked", {
    candidate_id: input.candidateId,
    reason: input.reason,
    depth: input.depth,
    voucher_phone_hash: hashPhoneForMetric(input.voucherPhone),
    candidate_phone_hash: hashPhoneForMetric(input.candidatePhone),
  });
}

async function resolveCandidateOrganisationId(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  candidateId: string,
): Promise<string | null> {
  const { data: latestApplication } = await supabase
    .from("applications")
    .select("job_id")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const jobId = (latestApplication?.job_id as string | null) ?? null;
  if (!jobId) return null;

  const { data: job } = await supabase
    .from("jobs")
    .select("organisation_id")
    .eq("id", jobId)
    .maybeSingle();
  return (job?.organisation_id as string | null) ?? null;
}

/**
 * Best-effort delivery of the vouch kickoff message (intro + Q1).
 * Tries the dedicated 24h+ template first, then free-text Q1, then a single combined
 * free-text fallback so the voucher never lands in a session without a question on screen.
 */
async function deliverVouchKickoff(
  voucherPhone: string,
  candidateName: string,
): Promise<{ delivered: boolean; via: "template_then_text" | "text_combined" | "none" }> {
  const q1Body = VOUCH_QUESTIONS.q1.message(candidateName);

  const tmpl = await sendTemplateMessage({
    phoneNumber: voucherPhone,
    templateName: "th_referrer_vouch_request",
    languageCode: "en",
    bodyParams: [candidateName],
  });
  if (tmpl.success) {
    const q1Result = await sendWhatsAppMessage(voucherPhone, q1Body);
    if (q1Result.success) return { delivered: true, via: "template_then_text" };
    logger.warn("Vouch: Q1 follow-up after template failed; trying combined text fallback", {
      error: q1Result.error,
    });
  } else {
    logger.warn("Vouch: th_referrer_vouch_request template send failed; trying free-text", {
      error: tmpl.error,
    });
  }

  const intro =
    `Hi! ${candidateName} just applied via TigerHire and added you as a reference. ` +
    `Could you answer 5 quick questions to vouch for them? It only takes ~2 minutes. ` +
    `Reply 'skip' anytime to decline.`;
  const combined = `${intro}\n\n${q1Body}`;
  const combinedResult = await sendWhatsAppMessage(voucherPhone, combined);
  if (combinedResult.success) return { delivered: true, via: "text_combined" };

  logger.error("Vouch: all kickoff delivery paths failed", {
    template_error: tmpl.error ?? null,
    combined_text_error: combinedResult.error ?? null,
  });
  return { delivered: false, via: "none" };
}

export async function startVouchFlow(
  voucherPhone: string,
  candidateId: string,
  candidateName: string,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const runtimeOrganisationId = await resolveCandidateOrganisationId(supabase, candidateId);
  if (!(await isEnabled("vouch_agent", runtimeOrganisationId))) {
    logger.warn("Vouch agent disabled via feature flag");
    return;
  }

  let priorSession: PriorVoucherSession | null = null;
  try {
    const existing = await getOrCreateSession(voucherPhone);
    if (
      existing &&
      existing.session_state !== "complete" &&
      CANDIDATE_ACTIVE_STATES.has(existing.session_state) &&
      !existing.session_state.startsWith("vouch_")
    ) {
      priorSession = {
        state: existing.session_state,
        context: { ...(existing.context ?? {}) },
      };
    }
  } catch (err) {
    logger.warn("Vouch: failed to read existing session before kickoff", {
      error: String(err),
    });
  }

  const delivery = await deliverVouchKickoff(voucherPhone, candidateName);
  if (!delivery.delivered) {
    return;
  }

  await withSessionCAS(voucherPhone, () => ({
    state: VOUCH_QUESTIONS.q1.state,
    context: {
      candidate_id: candidateId,
      candidate_name: candidateName,
      vouch_data: {},
      ...(priorSession ? { prior_session: priorSession } : {}),
      kickoff_via: delivery.via,
    },
  }));
}

async function exitVouchFlow(
  phone: string,
  context: Record<string, unknown>,
  message: string,
): Promise<void> {
  await sendWhatsAppMessage(phone, message);
  const priorRaw = context.prior_session as PriorVoucherSession | undefined;
  if (priorRaw && typeof priorRaw.state === "string") {
    await withSessionCAS(phone, () => ({
      state: priorRaw.state as WhatsAppSessionState,
      context: (priorRaw.context as Record<string, unknown> | undefined) ?? {},
    }));
    return;
  }
  await withSessionCAS(phone, () => ({ state: "complete", context: {} }));
}

export async function handleVouchResponse(
  phone: string,
  messageText: string,
  sessionState: string,
  context: Record<string, unknown>,
): Promise<void> {
  const text = (messageText ?? "").trim();
  const vouchData = (context.vouch_data as Record<string, unknown>) ?? {};
  const candidateName = (context.candidate_name as string) ?? "them";
  const candidateId = context.candidate_id as string;

  const qKey = sessionState.replace("vouch_", "") as (typeof Q_ORDER)[number];
  const q = VOUCH_QUESTIONS[qKey];
  if (!q) return;

  // Decline / skip exit applies at any question. We deliberately do NOT match "no" or
  // "not sure" so Q5 option 3 still works as a valid answer.
  if (VOUCH_DECLINE_REGEX.test(text)) {
    logger.info("metric.vouch_flow_declined", {
      candidate_id: candidateId,
      at_question: qKey,
    });
    await exitVouchFlow(
      phone,
      context,
      `No problem - thanks for considering it. We won't ask again.`,
    );
    return;
  }

  let value: unknown;
  let echoBack: string | null = null;

  if ("freeText" in q && (q as { freeText?: boolean }).freeText) {
    if (!text) {
      await sendWhatsAppMessage(phone, "Please reply with a short sentence (or 'skip' to stop).");
      return;
    }
    value = text;
  } else if ("multiSelect" in q && (q as { multiSelect?: boolean }).multiSelect) {
    const nums = text
      .split(/[,\s]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    const skills = Array.from(new Set(nums.map((n) => SKILL_MAP[n]).filter(Boolean)));
    if (skills.length === 0) {
      await sendWhatsAppMessage(
        phone,
        "Sorry, I didn't catch that. Reply with the option numbers separated by commas - e.g. '1,3' for Technical skills + Execution. Or reply 'skip' to stop.",
      );
      return;
    }
    value = skills;
    echoBack = `Got it: ${skills.join(", ")}.`;
  } else {
    value = (q as { options?: Record<string, string> }).options?.[text];
    if (value === undefined) {
      await sendWhatsAppMessage(
        phone,
        "Please reply with one of the numbered options (or 'skip' to stop).",
      );
      return;
    }
  }

  const updatedVouchData = { ...vouchData, [q.field]: value };
  const currentIndex = Q_ORDER.indexOf(qKey);
  const nextKey = Q_ORDER[currentIndex + 1];

  if (nextKey) {
    const nextQ = VOUCH_QUESTIONS[nextKey];
    const nextPrompt = echoBack
      ? `${echoBack}\n\n${nextQ.message(candidateName)}`
      : nextQ.message(candidateName);
    await sendWhatsAppMessage(phone, nextPrompt);
    await withSessionCAS(phone, () => ({
      state: nextQ.state,
      context: {
        ...context,
        vouch_data: updatedVouchData,
      },
    }));
  } else {
    await saveVouch(phone, candidateId, { ...updatedVouchData } as Record<string, unknown>);
    await sendWhatsAppMessage(phone, `Done! Your vouch for ${candidateName} is live. Thank you.`);
    const priorRaw = context.prior_session as PriorVoucherSession | undefined;
    if (priorRaw && typeof priorRaw.state === "string") {
      await withSessionCAS(phone, () => ({
        state: priorRaw.state as WhatsAppSessionState,
        context: (priorRaw.context as Record<string, unknown> | undefined) ?? {},
      }));
    } else {
      await withSessionCAS(phone, () => ({ state: "complete", context: {} }));
    }
  }
}

async function scoreVouchSpecificity(
  standoutSentence: string,
  attribution: { organisationId?: string; candidateId: string },
): Promise<{
  score: number;
  credibilityMultiplier: number;
  tokens: { input: number; output: number };
}> {
  if (!standoutSentence?.trim()) {
    return { score: 50, credibilityMultiplier: 1.0, tokens: { input: 0, output: 0 } };
  }

  const response = await callClaude({
    max_tokens: 200,
    system:
      'You are a vouch evaluator. Respond ONLY with valid JSON: { "specificity_score": <0-100>, "credibility_multiplier": <0.5-2.0>, "summary": "<brief>" }',
    messages: [
      {
        role: "user",
        content:
          `Rate this vouch sentence with an artifact-first rubric.\n` +
          `Scoring guidance:\n` +
          `- High specificity (80-100): concrete artifacts like named projects/systems, measurable outcomes, numbers, timelines, ownership scope.\n` +
          `- Medium specificity (50-79): partially concrete but missing hard evidence.\n` +
          `- Low specificity (0-49): adjective-heavy praise without artifacts ("great", "amazing", "smart", etc.).\n` +
          `Return credibility_multiplier lower for generic praise and higher for concrete evidence.\n` +
          `\nSentence:\n"${standoutSentence.slice(0, 500)}"`,
      },
    ],
    label: "vouch-specificity",
    organisationId: attribution.organisationId,
    candidateId: attribution.candidateId,
  });

  try {
    const raw = extractJsonObject(response.text, "Vouch specificity");
    const validated = VouchScoreSchema.parse(raw);
    return {
      score: validated.specificity_score,
      credibilityMultiplier: validated.credibility_multiplier,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  } catch {
    logger.warn("Vouch: Zod validation failed for Claude output, using fallback");
    const num = parseInt(response.text.replace(/\D/g, ""), 10);
    return {
      score: Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 50,
      credibilityMultiplier: 1.0,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }
}

export function calculateVouchWeight(
  relationshipType: string,
  duration: string,
  specificityScore: number,
  rehireIntent: string,
  credibilityMultiplier: number = 1.0,
): number {
  let w = 50;
  const relWeights: Record<string, number> = {
    managed: 25,
    peer: 15,
    managed_me: 10,
    client: 10,
    studied_together: 5,
  };
  const durWeights: Record<string, number> = {
    under_6m: 5,
    "6_12m": 10,
    "1_2y": 15,
    "2y_plus": 25,
  };
  const rehireWeights: Record<string, number> = {
    yes_definitely: 15,
    yes_right_role: 5,
    not_sure: 0,
  };
  w += relWeights[relationshipType] ?? 0;
  w += durWeights[duration] ?? 0;
  w += rehireWeights[rehireIntent] ?? 0;
  w += Math.round((specificityScore - 50) / 2);
  const clampedMultiplier = Math.min(2.0, Math.max(0.5, credibilityMultiplier));
  w = Math.round(w * clampedMultiplier);
  return Math.min(100, Math.max(0, w));
}

function calculateVouchWeightLegacyBaseline(
  relationshipType: string,
  duration: string,
  specificityScore: number,
  credibilityMultiplier: number = 1.0,
): number {
  let w = 50;
  const relWeights: Record<string, number> = {
    managed: 25,
    peer: 15,
    managed_me: 10,
    client: 10,
    studied_together: 5,
  };
  const durWeights: Record<string, number> = {
    under_6m: 5,
    "6_12m": 10,
    "1_2y": 15,
    "2y_plus": 25,
  };
  w += relWeights[relationshipType] ?? 0;
  w += durWeights[duration] ?? 0;
  w += Math.round((specificityScore - 50) / 2);
  const clampedMultiplier = Math.min(2.0, Math.max(0.5, credibilityMultiplier));
  w = Math.round(w * clampedMultiplier);
  return Math.min(100, Math.max(0, w));
}

async function saveVouch(
  voucherPhone: string,
  candidateId: string,
  vouchData: Record<string, unknown>,
): Promise<void> {
  const start = Date.now();
  const supabase = createSupabaseAdmin();
  const runtimeOrganisationId = await resolveCandidateOrganisationId(supabase, candidateId);
  const normalizedPhone = normalizeReferrerWhatsapp(voucherPhone);

  // --- Anti-gaming: duplicate check (DB constraint is the backstop) ---
  const { data: existing } = await supabase
    .from("vouches")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("voucher_phone", normalizedPhone)
    .limit(1)
    .maybeSingle();

  if (existing) {
    logger.warn("Vouch: duplicate vouch blocked", {
      candidateId,
      phoneLen: normalizedPhone.length,
    });
    await sendWhatsAppMessage(
      voucherPhone,
      "You've already vouched for this candidate. Thank you!",
    );
    return;
  }

  // --- Anti-gaming: self-vouch (voucher phone = candidate phone) ---
  const { data: candidateRow } = await supabase
    .from("candidates")
    .select("phone")
    .eq("id", candidateId)
    .maybeSingle();

  const candidatePhone = normalizeReferrerWhatsapp(
    (candidateRow?.phone as string | undefined) ?? "",
  );
  if (candidatePhone && candidatePhone === normalizedPhone) {
    logger.warn("Vouch: self-vouch blocked", { candidateId });
    await sendWhatsAppMessage(voucherPhone, "You cannot vouch for yourself.");
    return;
  }

  // --- Anti-gaming: circular vouch (A vouches B, B vouches A) ---
  if (candidatePhone) {
    const { data: reverseVouch } = await supabase
      .from("vouches")
      .select("id")
      .eq("voucher_phone", candidatePhone)
      .limit(1)
      .maybeSingle();

    if (reverseVouch) {
      const reverseCandidatePhoneVariants = [
        ...new Set([voucherPhone, normalizedPhone, `+${normalizedPhone}`]),
      ];
      const { data: reverseCandidate } = await supabase
        .from("candidates")
        .select("id")
        .in("phone", reverseCandidatePhoneVariants)
        .limit(1)
        .maybeSingle();

      if (reverseCandidate) {
        const { data: circularMatch } = await supabase
          .from("vouches")
          .select("id")
          .eq("candidate_id", reverseCandidate.id)
          .eq("voucher_phone", candidatePhone)
          .limit(1)
          .maybeSingle();

        if (circularMatch) {
          logCircularVouchBlockedMetric({
            candidateId,
            reason: "pairwise_cycle",
            depth: 2,
            voucherPhone: normalizedPhone,
            candidatePhone,
          });
          logger.warn("Vouch: circular vouch blocked (A↔B)", { candidateId });
          await logAgentRun(
            supabase,
            "vouch",
            "anti_gaming_flag",
            candidateId,
            "error",
            Date.now() - start,
            "Circular vouch: candidate already vouched for this voucher",
          );
          await sendWhatsAppMessage(
            voucherPhone,
            "This vouch can't be accepted — mutual vouching isn't allowed.",
          );
          return;
        }
      }
    }
  }

  if (candidatePhone && (await isEnabled(CIRCULAR_DEPTH_3_FLAG, runtimeOrganisationId))) {
    const { data: hasDepth3Cycle, error: depth3Error } = await supabase.rpc(
      "check_circular_vouch_depth_3",
      {
        p_new_voucher_phone: normalizedPhone,
        p_new_candidate_phone: candidatePhone,
      },
    );
    if (depth3Error) {
      logger.warn("Vouch: depth-3 circular check failed, continuing", {
        candidateId,
        error: depth3Error.message,
      });
    } else if (Boolean(hasDepth3Cycle)) {
      logCircularVouchBlockedMetric({
        candidateId,
        reason: "depth_3_cycle",
        depth: 3,
        voucherPhone: normalizedPhone,
        candidatePhone,
      });
      logger.warn("Vouch: depth-3 circular vouch blocked (A→B→C→A)", { candidateId });
      await logAgentRun(
        supabase,
        "vouch",
        "anti_gaming_flag",
        candidateId,
        "error",
        Date.now() - start,
        "Circular vouch: depth-3 cycle detected",
      );
      await sendWhatsAppMessage(
        voucherPhone,
        "This vouch can't be accepted — circular vouching isn't allowed.",
      );
      return;
    }
  }

  // --- Anti-gaming: rapid vouch pattern (>5 vouches in 24h from same phone) ---
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentVouchCount } = await supabase
    .from("vouches")
    .select("id", { count: "exact", head: true })
    .eq("voucher_phone", normalizedPhone)
    .gte("created_at", oneDayAgo);

  if ((recentVouchCount ?? 0) >= 5) {
    logger.warn("Vouch: rapid vouch pattern blocked", {
      phoneLen: normalizedPhone.length,
      count: recentVouchCount,
    });
    await logAgentRun(
      supabase,
      "vouch",
      "anti_gaming_flag",
      candidateId,
      "error",
      Date.now() - start,
      "Rapid vouch pattern: >5 vouches in 24h",
    );
    await sendWhatsAppMessage(
      voucherPhone,
      "You've vouched for several candidates recently. Please try again tomorrow.",
    );
    return;
  }

  const standout = (vouchData.standout_sentence as string) ?? "";
  const {
    score: specificityScore,
    credibilityMultiplier,
    tokens,
  } = await scoreVouchSpecificity(standout, {
    organisationId: runtimeOrganisationId ?? undefined,
    candidateId,
  });
  const relationshipType = (vouchData.relationship_type as string) ?? "";
  const duration = (vouchData.duration as string) ?? "";
  const rehireIntent = (vouchData.rehire_intent as string) ?? "";
  const baselineWeight = calculateVouchWeightLegacyBaseline(
    relationshipType,
    duration,
    specificityScore,
    credibilityMultiplier,
  );
  const weight = calculateVouchWeight(
    relationshipType,
    duration,
    specificityScore,
    rehireIntent,
    credibilityMultiplier,
  );

  const { data: insertedVouch, error: insertErr } = await supabase
    .from("vouches")
    .insert({
      candidate_id: candidateId,
      voucher_phone: normalizedPhone,
      relationship_type: vouchData.relationship_type ?? null,
      duration: vouchData.duration ?? null,
      skills_vouched: Array.isArray(vouchData.skills_vouched) ? vouchData.skills_vouched : [],
      standout_sentence: standout || null,
      rehire_intent: vouchData.rehire_intent ?? null,
      specificity_score: specificityScore,
      weight,
    })
    .select("id")
    .single();

  if (insertErr) {
    logger.warn("Vouch: insert failed (likely duplicate)", {
      candidateId,
      code: insertErr.code,
      message: insertErr.message,
    });
    return;
  }

  const weightDelta = weight - baselineWeight;
  if (weightDelta !== 0) {
    logger.info("metric.vouch_weight_calculated_delta", {
      vouch_id: insertedVouch?.id ?? null,
      candidate_id: candidateId,
      rehire_intent: rehireIntent || null,
      baseline_weight: baselineWeight,
      final_weight: weight,
      delta: weightDelta,
    });
  }

  const newTrustScore = await recalculateTrustScore(candidateId);

  // Best-effort social proof: tell the candidate someone vouched for them.
  // Failure here must never block vouch finalisation.
  if (candidatePhone) {
    try {
      const proof = await sendWhatsAppMessage(
        candidatePhone,
        `Good news - someone just vouched for you on TigerHire. ` +
          `This boosts your profile with hiring teams. ` +
          `Trust score: ${newTrustScore}/100.`,
      );
      if (!proof.success) {
        logger.warn("Vouch: social proof message to candidate failed", {
          candidateId,
          error: proof.error,
        });
      } else {
        logger.info("metric.vouch_social_proof_sent", {
          candidate_id: candidateId,
          trust_score: newTrustScore,
        });
      }
    } catch (err) {
      logger.warn("Vouch: social proof message threw, ignoring", {
        candidateId,
        error: String(err),
      });
    }
  }

  await logAgentRun(
    supabase,
    "vouch",
    "whatsapp_flow",
    candidateId,
    "success",
    Date.now() - start,
    undefined,
    tokens,
    MODELS.SONNET,
  );
}
