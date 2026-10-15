import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";
import { extractScreeningSummary } from "@/lib/screening/extract-summary";
import { getWhatsAppScreeningScript } from "@/lib/screening/scripts/whatsapp";
import { getVoiceScreeningScript } from "@/lib/screening/scripts/voice";
import { initiateBolnaCall } from "@/lib/screening/voice/bolna";
import {
  buildGapAwareVoiceScript,
  fetchCandidateGapFlags,
} from "@/lib/screening/voice/gap-questions";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_VOICE_SCREENING_BOLNA } from "@/lib/screening/voice/constants";
import { isWithinCallingWindow, nextCallingWindowStartIso } from "@/lib/screening/calling-hours";
import { shouldRepromptOnInvalidAnswer } from "@/lib/screening/question-flow";
import { scheduleScreeningInactivityCheck } from "@/lib/screening/inactivity";
import { getSessionOrganisationId, setSessionOrganisationId } from "@/lib/whatsapp/sessions";
import type { ScreeningScriptRoleCategory } from "@/lib/screening/types";

type ScreeningJobRow = {
  id: string;
  organisation_id: string;
  candidate_id: string;
  req_id: string;
  mode: "voice" | "whatsapp" | "manual" | "none";
  status: string;
  whatsapp_thread_id: string | null;
  bolna_call_id: string | null;
  whatsapp_message_count: number | null;
  summary_json: Record<string, unknown> | null;
  last_activity_at: string | null;
  created_at: string;
};

type CandidateRow = { id: string; name: string | null; phone: string | null };
type JobRow = {
  id: string;
  title: string | null;
  city: string | null;
  role_category: string | null;
  description: string | null;
  organisations?: { name: string | null } | { name: string | null }[] | null;
};

type RuntimeState = {
  script_version: string;
  question_index: number;
  responses: Record<string, string>;
  reprompt_counts: Record<string, number>;
};

const POSITIVE_RE = /^(yes|y|ok|okay|sure|start|continue)\b/i;
const NEGATIVE_RE = /^(no|n|skip|later|stop)\b/i;

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function toE164Phone(rawPhone: string | null, normalizedDigits: string): string {
  const raw = (rawPhone ?? "").trim();
  if (raw.startsWith("+")) {
    const digits = raw.replace(/[^\d+]/g, "");
    if (/^\+\d{10,15}$/.test(digits)) return digits;
  }

  const digits = normalizedDigits || raw.replace(/\D/g, "");
  if (!digits) return "";
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^\d{11,15}$/.test(digits)) return `+${digits}`;
  return "";
}

function roleToScriptCategory(roleCategory: string | null): ScreeningScriptRoleCategory {
  if (roleCategory === "backend") return "backend";
  if (roleCategory === "frontend") return "frontend";
  if (roleCategory === "data_ml") return "data_ml";
  if (roleCategory === "product") return "product";
  if (roleCategory === "devops") return "devops";
  return "backend";
}

function getRuntime(summaryJson: Record<string, unknown> | null): RuntimeState {
  const runtime = (summaryJson?.runtime ?? {}) as Record<string, unknown>;
  const responsesRaw = (runtime.responses ?? {}) as Record<string, unknown>;
  const repromptRaw = (runtime.reprompt_counts ?? {}) as Record<string, unknown>;
  const responses = Object.fromEntries(
    Object.entries(responsesRaw).map(([key, value]) => [key, String(value ?? "")]),
  );
  const repromptCounts = Object.fromEntries(
    Object.entries(repromptRaw).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]),
  );
  return {
    script_version: String(runtime.script_version ?? "1.0.0"),
    question_index: Math.max(0, Number(runtime.question_index ?? 0) || 0),
    responses,
    reprompt_counts: repromptCounts,
  };
}

function withRuntime(
  summaryJson: Record<string, unknown> | null,
  runtime: RuntimeState,
): Record<string, unknown> {
  return {
    ...(summaryJson ?? {}),
    runtime: {
      script_version: runtime.script_version,
      question_index: runtime.question_index,
      responses: runtime.responses,
      reprompt_counts: runtime.reprompt_counts,
    },
  };
}

function repromptForFormat(expected?: "number" | "yes_no" | "free_text" | "enum"): string {
  if (expected === "number") return "Could you share that as a number? Example: 60";
  if (expected === "yes_no") return "Could you reply with YES or NO?";
  if (expected === "enum") return "Could you reply using one of the listed options?";
  return "Could you share that in a clearer format?";
}

function getOrgName(job: JobRow): string {
  const orgRel = job.organisations;
  if (Array.isArray(orgRel)) return orgRel[0]?.name?.trim() || "TigerHire partner";
  return orgRel?.name?.trim() || "TigerHire partner";
}

function resolveReqLocation(job: JobRow): string {
  if (job.city?.trim()) return job.city.trim();
  return "the role location";
}

function buildTranscript(
  questions: { id: string; text: string }[],
  responses: Record<string, string>,
): string {
  return questions
    .map((question) => `Q: ${question.text}\nA: ${responses[question.id] ?? ""}`.trim())
    .join("\n\n");
}

type ActiveSiblingJobRow = {
  id: string;
  mode: "voice" | "whatsapp" | "manual" | "none";
  status: "queued" | "awaiting_consent" | "in_progress";
  created_at: string;
};

async function uploadTranscript(
  organisationId: string,
  screeningJobId: string,
  transcript: string,
): Promise<string | null> {
  if (!transcript.trim()) return null;
  const admin = createSupabaseAdmin();
  const path = `screening-audio/${organisationId}/${screeningJobId}-whatsapp.txt`;
  const { error } = await admin.storage
    .from("screening-audio")
    .upload(path, Buffer.from(transcript, "utf8"), { upsert: true, contentType: "text/plain" });
  if (error) {
    logger.warn("Failed to upload whatsapp transcript", { screeningJobId, error: error.message });
    return null;
  }
  return path;
}

function jobActivityTime(job: ScreeningJobRow): number {
  const last = job.last_activity_at ? Date.parse(job.last_activity_at) : NaN;
  if (!Number.isNaN(last)) return last;
  const created = Date.parse(job.created_at);
  return Number.isNaN(created) ? 0 : created;
}

/**
 * Pick the most recently active job among a set scoped to a single org.
 * Deterministic tie-break: last_activity_at desc → created_at desc → id asc.
 */
function pickMostRecentlyActive(jobs: ScreeningJobRow[]): ScreeningJobRow {
  return [...jobs].sort((a, b) => {
    const aLast = a.last_activity_at ? Date.parse(a.last_activity_at) : NaN;
    const bLast = b.last_activity_at ? Date.parse(b.last_activity_at) : NaN;
    const aLastN = Number.isNaN(aLast) ? -Infinity : aLast;
    const bLastN = Number.isNaN(bLast) ? -Infinity : bLast;
    if (aLastN !== bLastN) return bLastN - aLastN;

    const aCreated = Date.parse(a.created_at);
    const bCreated = Date.parse(b.created_at);
    const aCreatedN = Number.isNaN(aCreated) ? -Infinity : aCreated;
    const bCreatedN = Number.isNaN(bCreated) ? -Infinity : bCreated;
    if (aCreatedN !== bCreatedN) return bCreatedN - aCreatedN;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * Resolve which active screening job an inbound reply belongs to when a phone
 * may have active jobs across multiple organisations.
 *
 * - Single org: use it.
 * - Multiple orgs (cross-tenant collision): never silently pick the newest.
 *   Prefer the org stamped on the WhatsApp session; otherwise fall back to a
 *   fully deterministic ordering (last_activity_at desc → created_at desc →
 *   id asc). A warn is emitted whenever a multi-org collision is observed.
 *
 * Within the resolved org, the most recently active job is returned.
 */
function pickScreeningJobForOrg(
  jobs: ScreeningJobRow[],
  sessionOrgId: string | null,
  phone: string,
): ScreeningJobRow | null {
  if (jobs.length === 0) return null;

  const orgIds = Array.from(new Set(jobs.map((job) => job.organisation_id)));

  if (orgIds.length === 1) {
    return pickMostRecentlyActive(jobs);
  }

  // Multi-org collision: resolve deterministically, never "newest wins".
  let resolvedOrg: string;
  let reason: string;
  if (sessionOrgId && orgIds.includes(sessionOrgId)) {
    resolvedOrg = sessionOrgId;
    reason = "session_org";
  } else {
    // Deterministic fallback: org of the most recently active job
    // (last_activity_at desc → created_at desc → id asc).
    resolvedOrg = pickMostRecentlyActive(jobs).organisation_id;
    reason = "deterministic_fallback";
  }

  const phoneTail = phone.slice(-4);
  logger.warn("whatsapp_screening_cross_org_collision", {
    phone_tail: phoneTail,
    org_ids: orgIds,
    candidate_ids: Array.from(new Set(jobs.map((job) => job.candidate_id))),
    resolved_org: resolvedOrg,
    reason,
  });

  const orgJobs = jobs.filter((job) => job.organisation_id === resolvedOrg);
  return pickMostRecentlyActive(orgJobs);
}

export async function handleScreeningWhatsappReply(args: {
  phone: string;
  body: string;
}): Promise<boolean> {
  const phone = normalizePhone(args.phone);
  const body = args.body.trim();
  if (!phone || !body) return false;

  const admin = createSupabaseAdmin();
  // Fetch ALL active jobs for this phone (do NOT collapse to one with limit(1)):
  // when a phone is active in multiple orgs we must resolve the org explicitly
  // rather than letting "most recently created" silently win (cross-tenant leak).
  const { data: activeJobs, error: screeningError } = await admin
    .from("screening_jobs")
    .select(
      "id, organisation_id, candidate_id, req_id, mode, status, whatsapp_thread_id, bolna_call_id, whatsapp_message_count, summary_json, last_activity_at, created_at",
    )
    .eq("whatsapp_thread_id", phone)
    .in("status", ["awaiting_consent", "in_progress"])
    .order("created_at", { ascending: false })
    .returns<ScreeningJobRow[]>();
  if (screeningError) throw screeningError;

  const jobs = activeJobs ?? [];
  if (jobs.length === 0) return false;

  // Prefer the org stamped on the WhatsApp session for stickiness, then resolve.
  const sessionOrgId = await getSessionOrganisationId(phone);
  const screeningJob = pickScreeningJobForOrg(jobs, sessionOrgId, phone);
  if (!screeningJob) return false;
  if (screeningJob.mode !== "voice" && screeningJob.mode !== "whatsapp") return false;

  // Stamp the resolved org back onto the session (best-effort) so subsequent
  // replies on this thread stay routed to the same org.
  await setSessionOrganisationId(phone, screeningJob.organisation_id);

  const [{ data: candidate }, { data: job }] = await Promise.all([
    admin
      .from("candidates")
      .select("id, name, phone")
      .eq("id", screeningJob.candidate_id)
      .maybeSingle<CandidateRow>(),
    admin
      .from("jobs")
      .select(
        "id, title, city, role_category, description, organisations!jobs_organisation_id_fkey(name)",
      )
      .eq("id", screeningJob.req_id)
      .maybeSingle<JobRow>(),
  ]);

  if (!candidate || !job) return false;
  const roleCategory = roleToScriptCategory(job.role_category);

  if (screeningJob.status === "awaiting_consent") {
    const { data: siblingActiveJobs, error: siblingError } = await admin
      .from("screening_jobs")
      .select("id, mode, status, created_at")
      .eq("organisation_id", screeningJob.organisation_id)
      .eq("candidate_id", screeningJob.candidate_id)
      .eq("req_id", screeningJob.req_id)
      .neq("id", screeningJob.id)
      .in("status", ["queued", "awaiting_consent", "in_progress"])
      .order("created_at", { ascending: false });
    if (siblingError) throw siblingError;

    const siblings = (siblingActiveJobs ?? []) as ActiveSiblingJobRow[];
    const siblingInProgress = siblings.find((job) => job.status === "in_progress");
    if (siblingInProgress) {
      await admin
        .from("screening_jobs")
        .update({
          status: "cancelled",
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", screeningJob.id);
      await sendWhatsAppMessage(
        phone,
        "Your screening is already in progress on another channel. We'll continue with that one.",
      );
      return true;
    }

    if (siblings.length > 0) {
      const siblingIds = siblings.map((job) => job.id);
      await admin
        .from("screening_jobs")
        .update({
          status: "cancelled",
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", siblingIds);
    }

    if (NEGATIVE_RE.test(body)) {
      const activityAtIso = new Date().toISOString();
      await admin
        .from("screening_jobs")
        .update({ status: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", screeningJob.id);
      await sendWhatsAppMessage(
        phone,
        "No problem. We will route your profile directly to the recruiter.",
      );
      return true;
    }
    if (!POSITIVE_RE.test(body)) {
      const activityAtIso = new Date().toISOString();
      await admin
        .from("screening_jobs")
        .update({ last_activity_at: activityAtIso })
        .eq("id", screeningJob.id);
      await scheduleScreeningInactivityCheck({
        jobId: screeningJob.id,
        organisationId: screeningJob.organisation_id,
        activityAtIso,
      });
      await sendWhatsAppMessage(phone, "Reply YES to continue, or SKIP to skip this screening.");
      return true;
    }

    if (screeningJob.mode === "voice") {
      // Global kill switch: if Bolna voice screening was disabled after this job was created,
      // don't dial out. Acknowledge the candidate and leave the job for manual follow-up.
      if (!(await isEnabled(FEATURE_FLAG_VOICE_SCREENING_BOLNA, screeningJob.organisation_id))) {
        logger.warn("voice_screening_skipped_flag_off", {
          screeningJobId: screeningJob.id,
          organisationId: screeningJob.organisation_id,
        });
        await sendWhatsAppMessage(
          phone,
          "Thanks! Our team will follow up with you shortly about the next step.",
        );
        return true;
      }

      const { data: orgSettings } = await admin
        .from("organisations")
        .select("screening_calling_hours_start, screening_calling_hours_end")
        .eq("id", screeningJob.organisation_id)
        .maybeSingle<{
          screening_calling_hours_start: string | null;
          screening_calling_hours_end: string | null;
        }>();

      if (
        !isWithinCallingWindow({
          start: orgSettings?.screening_calling_hours_start,
          end: orgSettings?.screening_calling_hours_end,
        })
      ) {
        const scheduledAt = nextCallingWindowStartIso({
          start: orgSettings?.screening_calling_hours_start,
        });
        const activityAtIso = new Date().toISOString();
        await admin
          .from("screening_jobs")
          .update({
            scheduled_at: scheduledAt,
            last_activity_at: activityAtIso,
          })
          .eq("id", screeningJob.id);
        await scheduleScreeningInactivityCheck({
          jobId: screeningJob.id,
          organisationId: screeningJob.organisation_id,
          activityAtIso,
        });
        await sendWhatsAppMessage(
          phone,
          "Thanks! Calling is available during your configured screening window. We will place your call in the next available slot.",
        );
        return true;
      }

      // Personalize with the candidate's unresolved FitScore concerns; best-effort — a
      // missing or failed flag lookup falls back to the generic script, never blocks the call.
      const gapFlags = await fetchCandidateGapFlags(admin, {
        jobId: screeningJob.req_id,
        candidateId: screeningJob.candidate_id,
      }).catch(() => null);
      const voiceScript = buildGapAwareVoiceScript(getVoiceScreeningScript(roleCategory), gapFlags);
      const call = await initiateBolnaCall({
        organisation_id: screeningJob.organisation_id,
        candidate_phone: toE164Phone(candidate.phone, phone),
        candidate_name: candidate.name ?? "Candidate",
        company_name: getOrgName(job),
        role_title: job.title ?? "Role",
        req_location: resolveReqLocation(job),
        script: voiceScript,
        webhook_correlation_id: screeningJob.id,
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
        .eq("id", screeningJob.id);
      await scheduleScreeningInactivityCheck({
        jobId: screeningJob.id,
        organisationId: screeningJob.organisation_id,
        activityAtIso: new Date().toISOString(),
      });
      await sendWhatsAppMessage(
        phone,
        "Great. We are placing your screening call now. Please expect a call from our AI screening line (it may appear as an unknown or business number).",
      );
      return true;
    }

    const script = getWhatsAppScreeningScript(roleCategory);
    const runtime: RuntimeState = {
      script_version: script.version,
      question_index: 0,
      responses: {},
      reprompt_counts: {},
    };
    await admin
      .from("screening_jobs")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        summary_json: withRuntime(screeningJob.summary_json, runtime),
        whatsapp_message_count: 1,
        last_activity_at: new Date().toISOString(),
        nudge_sent_at: null,
      })
      .eq("id", screeningJob.id);
    await scheduleScreeningInactivityCheck({
      jobId: screeningJob.id,
      organisationId: screeningJob.organisation_id,
      activityAtIso: new Date().toISOString(),
    });
    await sendWhatsAppMessage(phone, script.questions[0]?.text ?? "Let's begin.");
    return true;
  }

  if (screeningJob.mode !== "whatsapp" || screeningJob.status !== "in_progress") return true;

  const script = getWhatsAppScreeningScript(roleCategory);
  const runtime = getRuntime(screeningJob.summary_json);
  const currentQuestion = script.questions[runtime.question_index];
  if (!currentQuestion) return true;

  const repromptCount = runtime.reprompt_counts[currentQuestion.id] ?? 0;
  if (
    shouldRepromptOnInvalidAnswer({
      answer: body,
      expected: currentQuestion.expected_format,
      enumValues: currentQuestion.enum_values,
      repromptCount,
    })
  ) {
    runtime.reprompt_counts[currentQuestion.id] = repromptCount + 1;
    const activityAtIso = new Date().toISOString();
    await admin
      .from("screening_jobs")
      .update({
        summary_json: withRuntime(screeningJob.summary_json, runtime),
        last_activity_at: activityAtIso,
      })
      .eq("id", screeningJob.id);
    await scheduleScreeningInactivityCheck({
      jobId: screeningJob.id,
      organisationId: screeningJob.organisation_id,
      activityAtIso,
    });
    await sendWhatsAppMessage(phone, repromptForFormat(currentQuestion.expected_format));
    return true;
  }

  runtime.responses[currentQuestion.id] = body;
  runtime.question_index += 1;
  const nextQuestion = script.questions[runtime.question_index];
  const nextCount = (screeningJob.whatsapp_message_count ?? 0) + 1;

  if (nextQuestion) {
    const activityAtIso = new Date().toISOString();
    await admin
      .from("screening_jobs")
      .update({
        summary_json: withRuntime(screeningJob.summary_json, runtime),
        whatsapp_message_count: nextCount,
        last_activity_at: activityAtIso,
      })
      .eq("id", screeningJob.id);
    await scheduleScreeningInactivityCheck({
      jobId: screeningJob.id,
      organisationId: screeningJob.organisation_id,
      activityAtIso,
    });
    await sendWhatsAppMessage(phone, nextQuestion.text);
    return true;
  }

  const transcript = buildTranscript(
    script.questions.map((question) => ({ id: question.id, text: question.text })),
    runtime.responses,
  );
  const transcriptPath = await uploadTranscript(
    screeningJob.organisation_id,
    screeningJob.id,
    transcript,
  );
  const summary = await extractScreeningSummary({
    context: {
      role_title: job.title ?? "Role",
      role_category: job.role_category as
        | "backend"
        | "frontend"
        | "data_ml"
        | "product"
        | "devops"
        | "design"
        | "sales"
        | "finance"
        | null,
      jd_summary: (job.description ?? "").slice(0, 1200),
      transcript,
      mode: "whatsapp",
    },
    attribution: {
      candidateId: screeningJob.candidate_id,
      jobId: screeningJob.req_id,
      organisationId: screeningJob.organisation_id,
    },
  });

  await admin
    .from("screening_jobs")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      transcript_url: transcriptPath,
      summary_json: summary,
      recommendation: summary.recommendation,
      whatsapp_message_count: nextCount,
      nudge_sent_at: null,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", screeningJob.id);

  const { persistScreeningSummaryToApplication } =
    await import("@/lib/screening/persist-summary-to-application");
  await persistScreeningSummaryToApplication(admin, {
    jobId: screeningJob.req_id,
    candidateId: screeningJob.candidate_id,
    summary,
  });

  const firstName = candidate.name?.trim()?.split(/\s+/)[0] ?? "there";
  await sendWhatsAppMessage(phone, script.closing.replaceAll("{candidate_name}", firstName));
  return true;
}
