import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { isEnabled } from "@/lib/feature-flags";
import { resolveScreeningMode } from "./mode-resolver";
import { FEATURE_FLAG_VOICE_SCREENING_BOLNA } from "./voice/constants";
import { createScreeningJob, findActiveScreeningJobForCandidate } from "./repository";
import { getWhatsAppScreeningScript } from "./scripts/whatsapp";
import { applyDoNotCallModeGuard } from "./mode-guard";
import { scheduleScreeningInactivityCheck } from "./inactivity";
import type {
  ScreeningDefaultMode,
  ScreeningJob,
  ScreeningMode,
  ScreeningScriptRoleCategory,
  ScreeningTenantSettings,
  ScreeningTriggeredBy,
} from "./types";

type SupabaseErrorLike = {
  code?: string;
};

type OrganisationScreeningSettingsRow = {
  id: string;
  screening_default_mode: ScreeningDefaultMode | null;
  screening_fitscore_threshold: number | null;
  voice_screening_enabled: boolean | null;
  voice_screening_monthly_cap_inr: number | string | null;
};

type JobLiteRow = {
  id: string;
  organisation_id: string | null;
  title: string | null;
  role_category: string | null;
  description: string | null;
};

type CandidateLiteRow = {
  id: string;
  name: string | null;
  phone: string | null;
  do_not_call: boolean | null;
};

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function parseNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toScriptRole(roleCategory: string | null): ScreeningScriptRoleCategory {
  if (roleCategory === "backend") return "backend";
  if (roleCategory === "frontend") return "frontend";
  if (roleCategory === "data_ml") return "data_ml";
  if (roleCategory === "product") return "product";
  if (roleCategory === "devops") return "devops";
  return "backend";
}

function buildTenantSettings(row: OrganisationScreeningSettingsRow): ScreeningTenantSettings {
  return {
    screening_default_mode: row.screening_default_mode ?? "whatsapp",
    screening_fitscore_threshold: parseNumber(row.screening_fitscore_threshold, 75),
    voice_screening_enabled: Boolean(row.voice_screening_enabled),
    voice_screening_monthly_cap_inr:
      row.voice_screening_monthly_cap_inr == null
        ? null
        : parseNumber(row.voice_screening_monthly_cap_inr, 0),
  };
}

async function sendInitialMessage(args: {
  candidate: CandidateLiteRow;
  job: JobLiteRow;
  mode: ScreeningMode;
}): Promise<void> {
  const phone = normalizePhone(args.candidate.phone);
  if (!phone) return;
  const firstName = args.candidate.name?.trim()?.split(/\s+/)[0] ?? "there";
  const roleTitle = args.job.title?.trim() || "this role";
  const companyName = "TigerHire partner";

  if (args.mode === "voice") {
    await sendWhatsAppMessage(
      phone,
      `Hi ${firstName}, thanks for applying to ${roleTitle}. We can do a quick 5-minute AI screening call. Reply YES to continue or SKIP to stay in manual recruiter review. If you continue, please expect a call from our AI screening line (it may appear as an unknown or business number).`,
    );
    return;
  }

  if (args.mode === "whatsapp") {
    const script = getWhatsAppScreeningScript(toScriptRole(args.job.role_category));
    const greeting = script.greeting
      .replaceAll("{candidate_name}", firstName)
      .replaceAll("{role_title}", roleTitle)
      .replaceAll("{company_name}", companyName);
    await sendWhatsAppMessage(phone, greeting);
    await sendWhatsAppMessage(phone, script.consent_question);
  }
}

export async function triggerScreeningAfterFitScore(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    candidateId: string;
    forcedMode?: ScreeningMode;
    triggeredBy?: ScreeningTriggeredBy;
    recruiterId?: string | null;
  },
): Promise<ScreeningJob | null> {
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, organisation_id, title, role_category, description")
    .eq("id", args.jobId)
    .maybeSingle<JobLiteRow>();
  if (jobError) throw jobError;
  if (!job?.organisation_id) return null;

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, name, phone, do_not_call")
    .eq("id", args.candidateId)
    .maybeSingle<CandidateLiteRow>();
  if (candidateError) throw candidateError;
  if (!candidate) return null;

  const activeJob = await findActiveScreeningJobForCandidate(supabase, {
    organisationId: job.organisation_id,
    candidateId: args.candidateId,
  });
  if (activeJob) return activeJob;

  let mode: ScreeningMode = args.forcedMode ?? "none";
  if (!args.forcedMode) {
    const { data: org, error: orgError } = await supabase
      .from("organisations")
      .select(
        "id, screening_default_mode, screening_fitscore_threshold, voice_screening_enabled, voice_screening_monthly_cap_inr",
      )
      .eq("id", job.organisation_id)
      .single<OrganisationScreeningSettingsRow>();
    if (orgError) throw orgError;

    const latest = await FitScoreService.getLatestProductionScore(
      supabase,
      args.jobId,
      args.candidateId,
    );
    const fitScore = parseNumber((latest?.overall_score as number | null | undefined) ?? null, 0);

    const currentMonthStart = new Date();
    currentMonthStart.setUTCDate(1);
    currentMonthStart.setUTCHours(0, 0, 0, 0);
    const { data: currentMonthVoice } = await supabase
      .from("screening_jobs")
      .select("charge_inr")
      .eq("organisation_id", job.organisation_id)
      .eq("mode", "voice")
      .eq("status", "completed")
      .gte("ended_at", currentMonthStart.toISOString());
    const monthToDateVoiceSpendInr = (currentMonthVoice ?? []).reduce(
      (sum, row) =>
        sum + parseNumber((row as { charge_inr?: number | string | null }).charge_inr, 0),
      0,
    );

    const resolved = resolveScreeningMode({
      fitScore,
      tenant: buildTenantSettings(org),
      monthToDateVoiceSpendInr,
      expectedNextVoiceChargeInr: 99,
    });
    mode = resolved.mode;
  }

  mode = applyDoNotCallModeGuard({
    doNotCall: Boolean(candidate.do_not_call),
    resolvedMode: mode,
  });

  // Product rule: automated screening always starts with WhatsApp.
  // Voice remains available via explicit recruiter override (forcedMode).
  if (!args.forcedMode && mode === "voice") {
    mode = "whatsapp";
  }

  // Global kill switch: Bolna voice screening is gated behind a feature flag (default off).
  // When off, no voice jobs are created — including explicit recruiter overrides — so the
  // downstream Bolna call path is never reached. Fall back to WhatsApp.
  if (
    mode === "voice" &&
    !(await isEnabled(FEATURE_FLAG_VOICE_SCREENING_BOLNA, job.organisation_id))
  ) {
    mode = "whatsapp";
  }

  const phone = normalizePhone(candidate.phone);
  const initialStatus =
    mode === "none" ? "skipped" : mode === "manual" ? "queued" : "awaiting_consent";
  let jobRow: ScreeningJob;
  try {
    jobRow = await createScreeningJob(supabase, {
      organisation_id: job.organisation_id,
      candidate_id: args.candidateId,
      req_id: args.jobId,
      mode,
      status: initialStatus,
      triggered_by: args.triggeredBy ?? "auto",
      recruiter_id: args.recruiterId ?? null,
      whatsapp_thread_id: phone || null,
      last_activity_at: new Date().toISOString(),
    });
  } catch (error) {
    const maybeError = error as SupabaseErrorLike;
    // Concurrent triggers can race; return the already-active job rather than failing.
    if (maybeError?.code === "23505") {
      const existing = await findActiveScreeningJobForCandidate(supabase, {
        organisationId: job.organisation_id,
        candidateId: args.candidateId,
        reqId: args.jobId,
      });
      if (existing) return existing;
    }
    throw error;
  }

  if (mode === "voice" || mode === "whatsapp") {
    await scheduleScreeningInactivityCheck({
      jobId: jobRow.id,
      organisationId: job.organisation_id,
      activityAtIso: jobRow.last_activity_at ?? new Date().toISOString(),
    });
    await sendInitialMessage({ candidate, job, mode }).catch((error) => {
      logger.warn("Failed to send initial screening message", {
        error: error instanceof Error ? error.message : String(error),
        mode,
        jobId: args.jobId,
        candidateId: args.candidateId,
      });
    });
  }

  return jobRow;
}
