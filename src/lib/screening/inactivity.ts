import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { enqueue } from "@/lib/jobs/queue";
import { getVoiceScreeningScript } from "@/lib/screening/scripts/voice";
import { initiateBolnaCall } from "@/lib/screening/voice/bolna";
import {
  buildGapAwareVoiceScript,
  fetchCandidateGapFlags,
} from "@/lib/screening/voice/gap-questions";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_VOICE_SCREENING_BOLNA } from "@/lib/screening/voice/constants";
import { isWithinCallingWindow, nextCallingWindowStartIso } from "@/lib/screening/calling-hours";
import { SCREENING_INACTIVITY_NUDGE_HOURS, SCREENING_INACTIVITY_TIMEOUT_HOURS } from "./config";

export type ScreeningInactivityEvent = {
  jobId: string;
  organisationId: string;
  activityAtIso: string;
};

const ACTIVE_STATUSES = new Set(["awaiting_consent", "in_progress"]);

type ScreeningInactivityRow = {
  id: string;
  organisation_id: string;
  candidate_id: string;
  req_id: string;
  mode: "voice" | "whatsapp" | "manual" | "none";
  status: string;
  whatsapp_thread_id: string | null;
  nudge_sent_at: string | null;
  last_activity_at: string | null;
};

function isStaleEvent(job: ScreeningInactivityRow, activityAtIso: string): boolean {
  const jobActivityAt = Date.parse(job.last_activity_at ?? "");
  const eventActivityAt = Date.parse(activityAtIso);
  if (!Number.isFinite(jobActivityAt) || !Number.isFinite(eventActivityAt)) return true;
  return jobActivityAt > eventActivityAt;
}

export async function scheduleScreeningInactivityCheck(
  payload: ScreeningInactivityEvent,
): Promise<void> {
  await enqueue("screening-inactivity", payload).catch((error) => {
    logger.warn("Failed to enqueue screening inactivity event", {
      error: error instanceof Error ? error.message : String(error),
      screening_job_id: payload.jobId,
      organisation_id: payload.organisationId,
    });
    return {};
  });
}

export function nudgeDueAt(activityAtIso: string): Date {
  return new Date(
    new Date(activityAtIso).getTime() + SCREENING_INACTIVITY_NUDGE_HOURS * 60 * 60 * 1000,
  );
}

export function timeoutDueAt(activityAtIso: string): Date {
  return new Date(
    new Date(activityAtIso).getTime() + SCREENING_INACTIVITY_TIMEOUT_HOURS * 60 * 60 * 1000,
  );
}

export async function fetchScreeningInactivityJob(args: {
  jobId: string;
  organisationId: string;
}): Promise<ScreeningInactivityRow | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("screening_jobs")
    .select(
      "id, organisation_id, candidate_id, req_id, mode, status, whatsapp_thread_id, nudge_sent_at, last_activity_at",
    )
    .eq("id", args.jobId)
    .eq("organisation_id", args.organisationId)
    .maybeSingle<ScreeningInactivityRow>();
  if (error) throw error;
  return data;
}

export async function processScreeningInactivityNudge(payload: ScreeningInactivityEvent): Promise<{
  skipped?: string;
  nudged?: boolean;
}> {
  const admin = createSupabaseAdmin();
  const job = await fetchScreeningInactivityJob({
    jobId: payload.jobId,
    organisationId: payload.organisationId,
  });
  if (!job) return { skipped: "job_not_found" };
  if (!ACTIVE_STATUSES.has(job.status)) return { skipped: "inactive_status" };
  if (isStaleEvent(job, payload.activityAtIso)) return { skipped: "stale_event" };
  if (job.nudge_sent_at) return { skipped: "nudge_already_sent" };

  const phone = (job.whatsapp_thread_id ?? "").replace(/\D/g, "");
  if (!phone) return { skipped: "missing_phone" };

  await sendWhatsAppMessage(phone, "Still there? Take your time — your answers are saved.");
  const { error } = await admin
    .from("screening_jobs")
    .update({
      nudge_sent_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("organisation_id", job.organisation_id);
  if (error) throw error;
  return { nudged: true };
}

function normalizeE164FromIndianDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return "";
}

function roleToVoiceCategory(
  roleCategory: string | null,
): "backend" | "frontend" | "data_ml" | "product" | "devops" {
  if (roleCategory === "backend") return "backend";
  if (roleCategory === "frontend") return "frontend";
  if (roleCategory === "data_ml") return "data_ml";
  if (roleCategory === "product") return "product";
  if (roleCategory === "devops") return "devops";
  return "backend";
}

async function triggerVoiceFallbackAfterWhatsappNoResponse(args: {
  job: ScreeningInactivityRow;
}): Promise<{ skipped?: string; createdJobId?: string; started?: boolean }> {
  const admin = createSupabaseAdmin();
  if (args.job.mode !== "whatsapp") return { skipped: "not_whatsapp_mode" };

  const [{ data: org }, { data: candidate }, { data: req }] = await Promise.all([
    admin
      .from("organisations")
      .select(
        "id, name, voice_screening_enabled, screening_calling_hours_start, screening_calling_hours_end",
      )
      .eq("id", args.job.organisation_id)
      .maybeSingle<{
        id: string;
        name: string | null;
        voice_screening_enabled: boolean | null;
        screening_calling_hours_start: string | null;
        screening_calling_hours_end: string | null;
      }>(),
    admin
      .from("candidates")
      .select("id, name, phone, do_not_call")
      .eq("id", args.job.candidate_id)
      .maybeSingle<{
        id: string;
        name: string | null;
        phone: string | null;
        do_not_call: boolean | null;
      }>(),
    admin
      .from("jobs")
      .select("id, title, role_category, city")
      .eq("id", args.job.req_id)
      .maybeSingle<{
        id: string;
        title: string | null;
        role_category: string | null;
        city: string | null;
      }>(),
  ]);

  if (!org?.voice_screening_enabled) return { skipped: "voice_disabled" };
  // Global kill switch: voice screening must also be enabled platform-wide (default off).
  if (!(await isEnabled(FEATURE_FLAG_VOICE_SCREENING_BOLNA, args.job.organisation_id))) {
    return { skipped: "voice_disabled" };
  }
  if (candidate?.do_not_call) return { skipped: "candidate_do_not_call" };
  if (!candidate || !req) return { skipped: "missing_candidate_or_job" };

  const phone = normalizeE164FromIndianDigits(candidate.phone ?? args.job.whatsapp_thread_id ?? "");
  if (!phone) return { skipped: "invalid_phone" };

  const { data: existingActive } = await admin
    .from("screening_jobs")
    .select("id")
    .eq("organisation_id", args.job.organisation_id)
    .eq("candidate_id", args.job.candidate_id)
    .eq("req_id", args.job.req_id)
    .in("status", ["queued", "awaiting_consent", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existingActive) return { skipped: "active_path_exists" };

  const nowIso = new Date().toISOString();
  const { data: created, error: createError } = await admin
    .from("screening_jobs")
    .insert({
      organisation_id: args.job.organisation_id,
      candidate_id: args.job.candidate_id,
      req_id: args.job.req_id,
      mode: "voice",
      status: "awaiting_consent",
      triggered_by: "auto",
      overridden_from_mode: "whatsapp",
      whatsapp_thread_id: args.job.whatsapp_thread_id,
      last_activity_at: nowIso,
    })
    .select("id")
    .single<{ id: string }>();
  if (createError) throw createError;

  const withinWindow = isWithinCallingWindow({
    start: org.screening_calling_hours_start,
    end: org.screening_calling_hours_end,
  });
  if (!withinWindow) {
    const scheduledAt = nextCallingWindowStartIso({
      start: org.screening_calling_hours_start,
    });
    await admin
      .from("screening_jobs")
      .update({
        scheduled_at: scheduledAt,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", created.id);
    await sendWhatsAppMessage(
      phone,
      "We couldn't reach you on WhatsApp, so we'll place your screening call in the next available calling window.",
    );
    return { createdJobId: created.id, started: false };
  }

  // Personalize with the candidate's unresolved FitScore concerns; best-effort — a missing
  // or failed flag lookup falls back to the generic script, never blocks the call.
  const gapFlags = await fetchCandidateGapFlags(admin, {
    jobId: args.job.req_id,
    candidateId: args.job.candidate_id,
  }).catch(() => null);
  const voiceScript = buildGapAwareVoiceScript(
    getVoiceScreeningScript(roleToVoiceCategory(req.role_category)),
    gapFlags,
  );
  const call = await initiateBolnaCall({
    organisation_id: args.job.organisation_id,
    candidate_phone: phone,
    candidate_name: candidate.name ?? "Candidate",
    company_name: org.name ?? "TigerHire partner",
    role_title: req.title ?? "Role",
    req_location: req.city ?? "the role location",
    script: voiceScript,
    webhook_correlation_id: created.id,
  });
  await admin
    .from("screening_jobs")
    .update({
      status: "in_progress",
      started_at: new Date().toISOString(),
      bolna_call_id: call.bolna_call_id,
      last_activity_at: new Date().toISOString(),
      nudge_sent_at: null,
    })
    .eq("id", created.id);
  await sendWhatsAppMessage(
    phone,
    "We couldn't reach you on WhatsApp, so we're placing your screening call now. Please expect a call from our AI screening line (it may appear as an unknown or business number).",
  );
  return { createdJobId: created.id, started: true };
}

export async function processScreeningInactivityTimeout(
  payload: ScreeningInactivityEvent,
): Promise<{
  skipped?: string;
  timedOut?: boolean;
  voiceFallback?: { skipped?: string; createdJobId?: string; started?: boolean };
}> {
  const admin = createSupabaseAdmin();
  const job = await fetchScreeningInactivityJob({
    jobId: payload.jobId,
    organisationId: payload.organisationId,
  });
  if (!job) return { skipped: "job_not_found" };
  if (!ACTIVE_STATUSES.has(job.status)) return { skipped: "inactive_status" };
  if (isStaleEvent(job, payload.activityAtIso)) return { skipped: "stale_event" };

  const { error } = await admin
    .from("screening_jobs")
    .update({
      status: "no_response",
      ended_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("organisation_id", job.organisation_id)
    .in("status", ["awaiting_consent", "in_progress"]);
  if (error) throw error;

  const voiceFallback = await triggerVoiceFallbackAfterWhatsappNoResponse({ job }).catch(
    (fallbackError) => {
      logger.warn("Failed to trigger voice fallback after WhatsApp no_response", {
        screening_job_id: job.id,
        organisation_id: job.organisation_id,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      return { skipped: "fallback_error" };
    },
  );

  return { timedOut: true, voiceFallback };
}
