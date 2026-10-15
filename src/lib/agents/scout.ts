import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCandidatePreferences } from "@/lib/preferences/get-preferences";
import { applyPreferencesToJobsQuery } from "@/lib/preferences/job-query";
import { hasPreferences } from "@/lib/preferences/types";
import { SCOUT_JOBS_LIMIT } from "@/lib/whatsapp/constants";
import { downloadWhatsAppMedia } from "@/lib/whatsapp/media";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { parseResumeWithClaude } from "@/lib/agents/cv-parser";
import { calculateGhostRiskScore } from "@/lib/agents/ghostbuster";
import { triggerVerifyAgent } from "@/lib/agents/verify";
import { isEnabled } from "@/lib/feature-flags";
import { logAgentRun } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";
import { linkReferralCandidateIfNeeded } from "@/lib/agents/scout-referral-link";
import { startRoleGuidedFlow } from "@/lib/whatsapp/role-guided-flow";

export interface ScoutAgentInput {
  phone: string;
  /** Meta media id from inbound webhook payload. */
  document_id: string;
  session_context: Record<string, unknown>;
  whatsapp_message_id?: string;
}

export type WhatsAppCvIngestOk = {
  candidateId: string;
  candidate: Record<string, unknown>;
  tokens: { input: number; output: number };
  model: string;
  normalizedPhone: string;
};

/**
 * Download PDF, parse CV, upsert candidate — no job scoring.
 * Used by Lane A / Lane B and by bulk `triggerScoutAgent`.
 * Returns null when skipped (disabled, duplicate, concurrent, empty PDF, missing row).
 * Throws on hard failures (media download, insert).
 */
export async function runWhatsAppCvIngest(
  input: ScoutAgentInput,
): Promise<WhatsAppCvIngestOk | null> {
  const start = Date.now();
  const supabase = createSupabaseAdmin();
  const normalizedPhone = input.phone.replace(/[^0-9]/g, "");

  if (!(await isEnabled("scout_agent"))) {
    logger.warn("Scout agent disabled via feature flag");
    return null;
  }

  if (input.whatsapp_message_id) {
    const { data: existing } = await supabase
      .from("agent_logs")
      .select("id")
      .eq("agent_name", "scout")
      .eq("input_ref", input.whatsapp_message_id)
      .eq("status", "success")
      .limit(1)
      .maybeSingle();

    if (existing) {
      logger.info("Scout: skipping duplicate messageId", {
        message: input.whatsapp_message_id,
      });
      return null;
    }
  }

  const { data: existingCandidate } = await supabase
    .from("candidates")
    .select("id, processing_status")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (existingCandidate?.processing_status === "processing") {
    logger.info("Scout: candidate already processing", {
      message: normalizedPhone,
    });
    return null;
  }

  if (existingCandidate) {
    await supabase
      .from("candidates")
      .update({ processing_status: "processing" })
      .eq("id", existingCandidate.id);
  }

  let cvBuffer: Buffer;
  try {
    cvBuffer = await downloadWhatsAppMedia(input.document_id);
  } catch (err) {
    logger.error("Scout: media download failed", { error: String(err) });
    await sendWhatsAppMessage(
      input.phone,
      "Sorry, we couldn't download your CV. Please try sending it again as a PDF.",
    );
    if (existingCandidate) {
      await supabase
        .from("candidates")
        .update({ processing_status: "failed" })
        .eq("id", existingCandidate.id);
    }
    await logAgentRun(
      supabase,
      "scout",
      "whatsapp_cv",
      input.whatsapp_message_id ?? null,
      "error",
      Date.now() - start,
      String(err),
    );
    throw err;
  }

  const parseResult = await parseResumeWithClaude({ type: "pdf", buffer: cvBuffer });
  const rawText = parseResult.rawTextForStorage?.trim() ?? "";
  if (!rawText?.trim()) {
    await sendWhatsAppMessage(
      input.phone,
      "We couldn't extract text from your CV. Please send a clear PDF.",
    );
    if (existingCandidate) {
      await supabase
        .from("candidates")
        .update({ processing_status: "failed" })
        .eq("id", existingCandidate.id);
    }
    await logAgentRun(
      supabase,
      "scout",
      "whatsapp_cv",
      input.whatsapp_message_id ?? null,
      "error",
      Date.now() - start,
      "PDF text extraction returned empty content",
    );
    return null;
  }

  const { parsed, tokens, model } = parseResult;

  const fileName = `cvs/${normalizedPhone}_${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("candidate-cvs")
    .upload(fileName, cvBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    logger.warn("Scout: storage upload error (continuing)", {
      error: String(uploadError),
    });
  }

  // Signed URL for private bucket (1h). Readers re-derive the storage path from
  // the URL and download via the admin client; expiry only affects direct links.
  const { data: signed } = await supabase.storage
    .from("candidate-cvs")
    .createSignedUrl(fileName, 3600);
  const cvUrl = signed?.signedUrl ?? null;

  const skillsArray = parsed.canonical_skills;

  const ghostRisk = calculateGhostRiskScore({
    vouchCount: 0,
    availability: parsed.availability || null,
  });

  const candidateRow = {
    phone: normalizedPhone,
    name: parsed.full_name || null,
    full_name: parsed.full_name || null,
    email: parsed.email || null,
    current_role: parsed.current_title || null,
    current_company: parsed.current_company || null,
    skills: skillsArray,
    experience_years: parsed.years_experience ?? null,
    location: parsed.location_city || null,
    resume_url: cvUrl,
    cv_url: cvUrl,
    cv_raw_text: rawText.slice(0, 100000),
    cv_parsed_at: new Date().toISOString(),
    entry_path: input.session_context?.referred_by ? "referral" : "whatsapp_drop",
    referred_by: (input.session_context?.referred_by as string) || null,
    trust_score: input.session_context?.referred_by ? 40 : 20,
    ghost_risk_score: ghostRisk,
    visibility: true,
    updated_at: new Date().toISOString(),
    availability: parsed.availability || null,
    seniority_level: parsed.seniority_level || null,
    salary_expectation_min: parsed.salary_expectation_min ?? null,
    salary_expectation_max: parsed.salary_expectation_max ?? null,
    processing_status: "complete",
  };

  let candidateId: string;
  if (existingCandidate) {
    await supabase.from("candidates").update(candidateRow).eq("id", existingCandidate.id);
    candidateId = existingCandidate.id;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("candidates")
      .insert(candidateRow)
      .select("id")
      .single();
    if (insertErr) {
      logger.error("Scout: candidate insert failed", {
        error: String(insertErr),
      });
      throw new Error("Failed to create candidate");
    }
    candidateId = inserted.id;
  }

  const referralId = (input.session_context?.referral_id as string | undefined) ?? null;
  await linkReferralCandidateIfNeeded(supabase, referralId, candidateId);

  const employeeReferralId =
    (input.session_context?.employee_referral_id as string | undefined) ?? null;
  const { linkEmployeeReferralIfNeeded } = await import("@/lib/agents/employee-referral-link");
  await linkEmployeeReferralIfNeeded(supabase, employeeReferralId, candidateId);

  const { data: candidate } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    await sendWhatsAppMessage(
      input.phone,
      "Your profile was saved. We'll score you against open roles and message you shortly.",
    );
    await logAgentRun(
      supabase,
      "scout",
      "whatsapp_cv",
      input.whatsapp_message_id ?? null,
      "success",
      Date.now() - start,
      undefined,
      tokens,
      model,
    );
    return null;
  }

  await logAgentRun(
    supabase,
    "scout",
    "whatsapp_cv",
    input.whatsapp_message_id ?? null,
    "success",
    Date.now() - start,
    undefined,
    tokens,
    model,
  );

  return {
    candidateId,
    candidate: candidate as Record<string, unknown>,
    tokens,
    model,
    normalizedPhone,
  };
}

export async function triggerScoutAgent(input: ScoutAgentInput): Promise<void> {
  const supabase = createSupabaseAdmin();

  const ingested = await runWhatsAppCvIngest(input);
  if (!ingested) return;

  const { candidateId, candidate, normalizedPhone } = ingested;

  triggerVerifyAgent(candidateId).catch(async (err) => {
    logger.warn("Scout: Verify agent error", { error: String(err) });
    const { appendToDlq } = await import("@/lib/utils/dlq");
    await appendToDlq("trigger_verify_agent", { candidate_id: candidateId }, String(err));
  });

  const preferences = await getCandidatePreferences(supabase, candidateId);
  const jobsQuery = applyPreferencesToJobsQuery(supabase, preferences)
    .order("updated_at", { ascending: false })
    .limit(SCOUT_JOBS_LIMIT);
  const { data: jobs } = await jobsQuery;
  const jobList = (jobs ?? []) as Array<Record<string, unknown> & { id: string }>;

  if (jobList.length === 0) {
    const name = (candidate.name ?? candidate.full_name ?? "there") as string;
    const firstName = name?.split(" ")[0] || "there";
    const message = hasPreferences(preferences)
      ? `Hi ${firstName}! Your profile is saved. No open roles match your preferences right now. We'll alert you when something matches — or update your preferences in the app to see more roles.`
      : `Hi ${firstName}! Your profile is saved. There are no open roles in the system right now. We'll alert you when new roles come in.`;
    await sendWhatsAppMessage(input.phone, message);
    await supabase
      .from("whatsapp_sessions")
      .update({
        session_state: "complete",
        context: { ...input.session_context, candidate_id: candidateId },
        last_message_at: new Date().toISOString(),
      })
      .eq("phone", normalizedPhone);
    return;
  }

  // Decided UX: show matching open roles to apply to — NO blanket scoring.
  // Hand off to the guided apply flow, which presents the open-role menu and (on a
  // numbered reply) creates an application via ApplicationService.create, scoring
  // ONLY the chosen role through the prescribed apply route.
  // startRoleGuidedFlow sets the session_state (role_family_selection / active_alerts)
  // and persists guided_role_options into context itself.
  await startRoleGuidedFlow(
    input.phone,
    { ...input.session_context, candidate_id: candidateId },
    candidateId,
  );
}
