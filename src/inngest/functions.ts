import { inngest } from "./client";
import { handleWhatsappInboundJob, whatsappInboundConfig } from "./whatsapp-inbound";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { distributeJob, removeJobFromBoards } from "@/lib/distribution/engine";
import { pingGoogleJobIndexing } from "@/lib/jobs/google-indexing";
import { expireReferralLinksForJob } from "@/lib/referrers/expire-referral-links-for-job";
import { notifyJobClosedStakeholders } from "@/lib/jobs/notify-job-closed";
import { logger } from "@/lib/observability/logger";
import { parseResumeWithClaude } from "@/lib/agents/cv-parser";
import { fetchAttributionFromLatestApplication } from "@/lib/costs/candidate-application-attribution";
import { extractTextFromBuffer, inferMimeFromName } from "@/lib/services/extract-document-text";
import { detectAuthenticitySignal } from "@/lib/services/human-signal-detector";
import { runFitScoreBatchAgent } from "@/lib/agents/fitscore-agent";
import { createNotification } from "@/lib/services/notifications";
import {
  hoursUntil,
  planApplicationDeadlineReminder,
} from "@/lib/jobs/application-deadline-reminders";
import { upsertApprovedHeadcountPlan } from "@/lib/services/headcount-plan-sync";
import { processReferralCampaignSend } from "@/lib/referrers/referral-campaign-send";
import {
  attributeApplicationToCampaign,
  recordCampaignStatusAttribution,
} from "@/lib/referrers/campaign-attribution";
import { autoEndExpiredCampaigns, executeCampaignLaunch } from "@/lib/referrers/campaign-launch";
import { getCampaignById } from "@/lib/referrers/campaigns";
import { runOrganisationOutboundWebhookFanout } from "@/lib/webhooks/fanout-organisation-outbound";
import { initiateSpringVerifyForApplication } from "@/lib/integrations/springverify/workflow";
import {
  normalizePhoneForCandidate,
  normalizeEmailForCandidate,
} from "@/lib/agents/candidate-dedup";
import { normalizeContactDetail } from "@/lib/candidates/normalize-contact-detail";
import { triggerScreeningAfterFitScore } from "@/lib/screening/trigger";
import {
  nudgeDueAt,
  processScreeningInactivityNudge,
  processScreeningInactivityTimeout,
  timeoutDueAt,
  type ScreeningInactivityEvent,
} from "@/lib/screening/inactivity";
import {
  AgencyReprocessJdNotApprovedError,
  reprocessAgencyCandidate,
} from "@/lib/agency/reprocess-candidate";
import {
  processPrescreenReminder,
  processPrescreenTimeout,
  reminderDueAt as prescreenReminderDueAt,
  timeoutDueAt as prescreenTimeoutDueAt,
  type PrescreenLifecyclePayload,
} from "@/lib/prescreen/lifecycle";

/**
 * FitScore single: compute one job–candidate score. Triggered when enqueue("fit-score-single", { jobId, candidateId }).
 * Retries and DLQ are handled by Inngest.
 */
export const fitScoreSingle = inngest.createFunction(
  {
    id: "fit-score-single",
    retries: 3,
    timeouts: { finish: "5m" },
    triggers: { event: "fit-score/single" },
  },
  async ({ event }) => {
    const { jobId, candidateId } = event.data as {
      jobId: string;
      candidateId: string;
    };
    const admin = createSupabaseAdmin();
    await FitScoreService.computeSingle(admin, jobId, candidateId, { source: "upload" });
    const { notifyWhatsAppFitScoreComplete } =
      await import("@/lib/whatsapp/fit-score-complete-notifier");
    await notifyWhatsAppFitScoreComplete(admin, { jobId, candidateId }).catch((error) => {
      logger.warn("WhatsApp FitScore completion notify failed", {
        jobId,
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    await triggerScreeningAfterFitScore(admin, {
      jobId,
      candidateId,
      triggeredBy: "auto",
    }).catch((error) => {
      logger.warn("Screening trigger failed after FitScore", {
        jobId,
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    logger.info("FitScore single completed (Inngest)", { jobId, candidateId });
    return { jobId, candidateId };
  },
);

/**
 * FitScore batch: supports either semantic batch (jobId/maxPairs) or explicit candidate list.
 * Explicit lists are scored in full — dropping part of a requested batch silently
 * breaks the product's "every applicant is scored" guarantee.
 */
export const fitScoreBatch = inngest.createFunction(
  {
    id: "fit-score-batch",
    retries: 2,
    timeouts: { finish: "10m" },
    triggers: { event: "fit-score/batch" },
  },
  async ({ event, step }) => {
    const { jobId, candidateIds, maxPairs } = event.data as {
      jobId: string;
      candidateIds?: string[];
      maxPairs?: number;
    };
    const admin = createSupabaseAdmin();

    if (Array.isArray(candidateIds) && candidateIds.length > 0) {
      const requested = candidateIds.length;
      // Previously this scored Math.floor(requested * 0.5) and silently dropped
      // the remainder — 380 uploaded, 190 scored, no requeue, success reported.
      // That falsified the product's "every applicant is scored" promise.
      // Score the full list. If the run dies on the Inngest 10m budget, the
      // unscored-reconciliation cron re-enqueues the survivors per candidate
      // (src/lib/fitscore/unscored-reconciliation.ts) — that sweep, not a cap,
      // is the backstop.
      // Chunked through step.run so Inngest checkpoints between chunks. Without
      // this the whole batch shares one `timeouts.finish` budget and a run that
      // dies near the end re-does everything on retry; with it, completed chunks
      // are never repeated. Chunk size is kept under the per-step budget at the
      // measured ~5-6 scores/min throughput.
      const CHUNK = 10;
      let scoredCandidates = 0;
      for (let offset = 0; offset < candidateIds.length; offset += CHUNK) {
        const chunk = candidateIds.slice(offset, offset + CHUNK);
        const chunkResult = await step.run(`score-chunk-${offset / CHUNK}`, async () => {
          const res = await FitScoreService.computeBatch(admin, jobId, chunk, {
            // Keep deferred pairs in `pending_jd_approval` for sweep after HM approval.
            onUnapprovedJdBase: "queue_pending",
            source: "upload",
          });
          if ("status" in res && res.status === "pending_jd_approval") {
            return { deferred: true as const, message: res.message };
          }
          return { deferred: false as const, count: chunk.length };
        });
        if (chunkResult.deferred) {
          logger.warn("FitScore batch deferred: JD base not approved (Inngest will retry)", {
            jobId,
            requestedCandidates: requested,
            message: chunkResult.message,
          });
          throw new Error(chunkResult.message ?? "jd_base_not_approved");
        }
        scoredCandidates += chunkResult.count;
      }
      logger.info("FitScore batch completed (explicit list)", {
        jobId,
        requestedCandidates: requested,
        scoredCandidates,
      });
      return {
        mode: "explicit_list",
        requestedCandidates: requested,
        scoredCandidates,
      };
    }

    const agentResult = await runFitScoreBatchAgent({
      jobId,
      maxPairs: maxPairs ?? 100,
    });
    logger.info("FitScore batch completed (semantic)", {
      jobId,
      runId: agentResult.runId,
      processed: agentResult.recordsProcessed,
      created: agentResult.recordsCreated,
      errors: agentResult.errors.length,
    });
    return {
      mode: "semantic",
      runId: agentResult.runId,
      processed: agentResult.recordsProcessed,
      created: agentResult.recordsCreated,
      errors: agentResult.errors.length,
    };
  },
);

/**
 * Agency candidate reprocess: CV download, parse, and FitScore for agency-uploaded profiles.
 */
export const agencyCandidateReprocess = inngest.createFunction(
  {
    id: "agency-candidate-reprocess",
    retries: 2,
    timeouts: { finish: "5m" },
    triggers: { event: "agency/candidate-reprocess" },
  },
  async ({ event }) => {
    const {
      candidateId,
      agencyOrganisationId,
      triggeredByUserId,
      bypassScreeningGate,
      clientOrgIds,
    } = event.data as {
      candidateId: string;
      agencyOrganisationId: string;
      triggeredByUserId?: string;
      bypassScreeningGate?: boolean;
      /** Company uploads pass their own org so scoring does not depend on agency_clients. */
      clientOrgIds?: string[];
    };
    const admin = createSupabaseAdmin();
    try {
      const result = await reprocessAgencyCandidate(admin, {
        candidateId,
        agencyOrganisationId,
        triggeredByUserId,
        markProcessing: true,
        // Only the bulk-upload enqueue sets this; scopes the gate bypass to that path.
        bypassScreeningGate: bypassScreeningGate === true,
        ...(Array.isArray(clientOrgIds) && clientOrgIds.length > 0 ? { clientOrgIds } : {}),
      });
      logger.info("Agency candidate reprocess completed (Inngest)", {
        candidateId,
        success: result.success,
      });
      return result;
    } catch (err) {
      if (err instanceof AgencyReprocessJdNotApprovedError) {
        logger.warn("Agency candidate reprocess deferred: JD base not approved", {
          candidateId,
        });
        throw err;
      }
      throw err;
    }
  },
);

/**
 * Job distribute: push new job to external boards (e.g. Adzuna). Fire-and-forget after job creation.
 */
export const jobDistribute = inngest.createFunction(
  {
    id: "job-distribute",
    retries: 2,
    triggers: { event: "job/distribute" },
  },
  async ({ event }) => {
    const { jobId } = event.data as { jobId: string };
    const result = await distributeJob(jobId);
    logger.info("Job distribution completed (Inngest)", { jobId, result });
    // Notify Google's Indexing API to re-crawl the public job page (no-ops without creds).
    // Skipped when the job failed the pre-publish schema gate.
    if (!result.schemaErrors) {
      const ping = await pingGoogleJobIndexing({ jobId, type: "URL_UPDATED" });
      if (!ping.skipped) logger.info("Google indexing notified (publish)", { jobId, ping });
    }
    return { jobId, result };
  },
);

/**
 * Job remove from boards: when job status becomes closed/archived, remove from external boards.
 */
export const jobRemoveFromBoards = inngest.createFunction(
  {
    id: "job-remove-from-boards",
    retries: 2,
    triggers: { event: "job/remove-from-boards" },
  },
  async ({ event }) => {
    const { jobId } = event.data as { jobId: string };
    await removeJobFromBoards(jobId);
    await expireReferralLinksForJob(jobId);
    await notifyJobClosedStakeholders(jobId);
    // Tell Google the job page is gone so it drops from Google for Jobs (no-ops without creds).
    const ping = await pingGoogleJobIndexing({ jobId, type: "URL_DELETED" });
    if (!ping.skipped) logger.info("Google indexing notified (delete)", { jobId, ping });
    logger.info("Job removed from boards (Inngest)", { jobId });
    return { jobId };
  },
);

/**
 * A17/B3: fired when a candidate accepts an offer. This worker starts SpringVerify BGV when
 * configured, and safely no-ops in environments without vendor keys.
 */
export const offerBgvTrigger = inngest.createFunction(
  {
    id: "offer-bgv-trigger",
    retries: 2,
    triggers: { event: "offer/bgv-trigger" },
  },
  async ({ event }) => {
    const { offerId, organisationId, candidateId, applicationId } = event.data as {
      offerId: string;
      organisationId: string;
      candidateId: string;
      applicationId: string;
    };
    const result = await initiateSpringVerifyForApplication({
      applicationId,
      initiatedBy: candidateId,
      expectedOrganisationId: organisationId,
      source: "offer_accept",
    });

    if (!result.ok) {
      if (result.code === "not_configured") {
        logger.info("offer/bgv-trigger skipped (SpringVerify not configured)", {
          offerId,
          organisationId,
          applicationId,
        });
        return { offerId, organisationId, candidateId, applicationId, skipped: "not_configured" };
      }

      if (
        result.code === "application_not_found" ||
        result.code === "candidate_not_found" ||
        result.code === "candidate_email_missing" ||
        result.code === "forbidden"
      ) {
        logger.warn("offer/bgv-trigger skipped (non-retriable)", {
          offerId,
          organisationId,
          applicationId,
          code: result.code,
          error: result.error,
        });
        return { offerId, organisationId, candidateId, applicationId, skipped: result.code };
      }

      throw new Error(result.error);
    }

    logger.info("offer/bgv-trigger initiated SpringVerify case", {
      offerId,
      organisationId: result.organisationId,
      applicationId: result.applicationId,
      springverifyResponseType: typeof result.response,
    });
    return {
      offerId,
      organisationId: result.organisationId,
      candidateId,
      applicationId: result.applicationId,
      initiated: true,
    };
  },
);

/**
 * Resume parse: AI-powered resume parsing fired after upload. Downloads the file from
 * Supabase storage, extracts text, runs Claude parsing, and updates the candidate profile.
 */
export const resumeParse = inngest.createFunction(
  {
    id: "resume-parse",
    retries: 2,
    timeouts: { finish: "3m" },
    triggers: { event: "resume/parse" },
  },
  async ({ event }) => {
    const { candidateId, resumeUrl, fileName, storagePath } = event.data as {
      candidateId: string;
      resumeUrl: string;
      fileName: string;
      storagePath: string;
    };

    const enrichStart = Date.now();
    const admin = createSupabaseAdmin();

    // Idempotent on cv_parsed_at: the candidate-onboarding flow runs a synchronous
    // parse (POST /api/candidates/me/parse-resume) that sets cv_parsed_at. If that
    // already landed, skip — re-parsing would burn a second Claude call and could
    // overwrite fields the candidate edited after onboarding pre-fill. (Mirrors
    // the cv-parse-retry idempotency contract.)
    {
      const { data: existing } = await admin
        .from("candidates")
        .select("cv_parsed_at")
        .eq("id", candidateId)
        .maybeSingle();
      if (existing?.cv_parsed_at) {
        logger.info("[resume-parse] Skipped — candidate already parsed", {
          candidateId,
          cvParsedAt: existing.cv_parsed_at,
        });
        return { candidateId, skipped: true, skipReason: "already_parsed" };
      }
    }

    // Download the file from Supabase storage
    const { data: fileData, error: downloadError } = await admin.storage
      .from("resumes")
      .download(storagePath);

    if (downloadError || !fileData) {
      logger.error("[resume-parse] Failed to download file from storage", {
        candidateId,
        storagePath,
        error: String(downloadError),
      });
      throw new Error(`Failed to download resume: ${downloadError?.message}`);
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const mimeType = inferMimeFromName(fileName) ?? "";
    const isPdf = mimeType === "application/pdf";

    logger.info("[resume-parse] Starting AI parsing", {
      candidateId,
      mimeType,
      isPdf,
      fileSize: fileBuffer.length,
      fileName,
    });

    const baseUpdate: Record<string, unknown> = {};

    try {
      const appAttribution = await fetchAttributionFromLatestApplication(admin, candidateId);
      const parseAttribution = { ...appAttribution, candidateId };

      const result = isPdf
        ? await parseResumeWithClaude({ type: "pdf", buffer: fileBuffer }, parseAttribution)
        : await (async () => {
            const rawText = await extractTextFromBuffer(fileBuffer, mimeType, fileName);
            if (!rawText?.trim()) throw new Error("Text extraction returned empty");
            return parseResumeWithClaude({ type: "text", text: rawText }, parseAttribution);
          })();

      const rawText = result.rawTextForStorage?.slice(0, 100_000) ?? null;
      baseUpdate.cv_raw_text = rawText ?? undefined;
      baseUpdate.skills = Array.isArray(result.parsed.canonical_skills)
        ? result.parsed.canonical_skills
        : [];
      baseUpdate.experience_years = result.parsed.years_experience ?? null;
      baseUpdate.current_role = result.parsed.current_title ?? null;
      baseUpdate.current_company = result.parsed.current_company ?? null;
      baseUpdate.seniority_level = result.parsed.seniority_level ?? null;
      baseUpdate.location = result.parsed.location_city ?? null;
      baseUpdate.cv_parsed_at = new Date().toISOString();
      baseUpdate.availability = result.parsed.availability ?? null;
      baseUpdate.salary_expectation_min = result.parsed.salary_expectation_min ?? null;
      baseUpdate.salary_expectation_max = result.parsed.salary_expectation_max ?? null;
      if (result.parsed.full_name) {
        baseUpdate.full_name = result.parsed.full_name;
        baseUpdate.name = result.parsed.full_name;
      }

      const { data: existingCand } = await admin
        .from("candidates")
        .select("phone, email")
        .eq("id", candidateId)
        .maybeSingle();

      const parsedPhone = normalizePhoneForCandidate(result.parsed.phone ?? undefined);
      if (parsedPhone && !normalizeContactDetail(existingCand?.phone)) {
        baseUpdate.phone = parsedPhone;
      }
      const parsedEmail = normalizeEmailForCandidate(result.parsed.email ?? undefined);
      if (parsedEmail && !normalizeContactDetail(existingCand?.email)) {
        baseUpdate.email = parsedEmail;
      }

      // Run authenticity detection for recruiter-facing AI-authorship signal.
      if (rawText) {
        try {
          const authenticity = detectAuthenticitySignal(rawText);
          baseUpdate.authenticity_signal = authenticity.signal;
          baseUpdate.authenticity_confidence = authenticity.confidence;
          baseUpdate.authenticity_reasons = authenticity.reasons;
          logger.info("[resume-parse] Authenticity signal detected", {
            candidateId,
            signal: authenticity.signal,
            confidence: authenticity.confidence,
          });
        } catch (signalError) {
          logger.warn("[resume-parse] Authenticity signal detection failed", {
            candidateId,
            error: String(signalError),
          });
        }
      }

      logger.info("[resume-parse] Parsing succeeded", {
        candidateId,
        durationMs: Date.now() - enrichStart,
        name: result.parsed.full_name,
        skillsCount: result.parsed.canonical_skills?.length,
        seniority: result.parsed.seniority_level,
        experience: result.parsed.years_experience,
        model: result.model,
        inputTokens: result.tokens.input,
        outputTokens: result.tokens.output,
        parseQuality: result.parseQuality,
        parseMethod: result.parseMethod,
      });
    } catch (e) {
      logger.error("[resume-parse] AI parsing FAILED", {
        candidateId,
        durationMs: Date.now() - enrichStart,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      throw e; // Let Inngest retry
    }

    // Update candidate profile
    const payload = Object.fromEntries(
      Object.entries(baseUpdate).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;
    payload.updated_at = new Date().toISOString();

    const { error: updateError } = await admin
      .from("candidates")
      .update(payload)
      .eq("id", candidateId);

    if (updateError) {
      logger.error("[resume-parse] Candidate profile update failed", {
        candidateId,
        error: updateError.message,
        code: updateError.code,
      });
      throw new Error(`Profile update failed: ${updateError.message}`);
    }

    return { candidateId, enriched: true };
  },
);

/**
 * CV parse retry: Inngest-driven retry for Phase 2 of processPublicApplication.
 * When the inline parse + FitScore in public-apply.ts throws (Claude 5xx, budget
 * gate, network), enqueue("cv-parse-retry", { candidateId, jobId, organisationId, source })
 * pushes a retry here so the candidate doesn't stay stuck in pending forever as a
 * "ghost" application with no parsed skills.
 *
 * Idempotent on cv_parsed_at — if the candidate is already parsed when this runs
 * (manual reprocess landed first, or a previous retry succeeded), it no-ops.
 */
export const cvParseRetry = inngest.createFunction(
  {
    id: "cv-parse-retry",
    retries: 3,
    timeouts: { finish: "5m" },
    triggers: { event: "cv-parse/retry" },
  },
  async ({ event }) => {
    const { candidateId, jobId, organisationId, source } = event.data as {
      candidateId: string;
      jobId?: string | null;
      organisationId: string;
      source?: string | null;
    };
    const admin = createSupabaseAdmin();
    const { retryCvParse } = await import("@/lib/agents/cv-parse-retry");
    const result = await retryCvParse(admin, { candidateId, jobId, organisationId, source });
    logger.info("cv-parse-retry completed", {
      candidateId,
      jobId,
      source,
      skipped: result.skipped ?? false,
      skipReason: result.skipReason,
      parsed: result.parsed ?? false,
      jobsScored: result.jobsScored ?? 0,
      topScore: result.topScore ?? null,
    });
    return result;
  },
);

/**
 * Pipeline reminder placeholder worker.
 * Triggered by enqueue("pipeline-reminder", payload).
 */
export const pipelineReminder = inngest.createFunction(
  {
    id: "pipeline-reminder",
    retries: 1,
    triggers: { event: "pipeline/reminder" },
  },
  async ({ event }) => {
    logger.warn("pipeline_reminder_placeholder_noop", {
      payload: event.data,
      degraded: true,
    });
    return { received: true, dispatched: false };
  },
);

function isFanoutWebhookPayload(d: unknown): d is {
  type: "fanout";
  organisationId: string;
  eventType: string;
  data: Record<string, unknown>;
} {
  if (d == null || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  if (o.type !== "fanout") return false;
  if (typeof o.organisationId !== "string" || o.organisationId.length === 0) return false;
  if (typeof o.eventType !== "string" || o.eventType.length === 0) return false;
  if (o.data == null || typeof o.data !== "object" || Array.isArray(o.data)) return false;
  return true;
}

/**
 * Outbound webhooks: delivers HMAC-signed JSON to org-registered `organisation_outbound_webhooks`
 * when enqueue("webhook-process", { type: "fanout", ... }) is used. Legacy / test payloads without
 * `type: "fanout"` are ignored (log-only).
 */
export const webhookProcess = inngest.createFunction(
  {
    id: "webhook-process",
    retries: 2,
    triggers: { event: "webhook/process" },
  },
  async ({ event }) => {
    const raw = event.data;
    if (!isFanoutWebhookPayload(raw)) {
      logger.info("Webhook process skipped (non-fanout payload)", {
        keys: raw && typeof raw === "object" ? Object.keys(raw as object) : [],
      });
      return { received: true, mode: "noop" as const };
    }
    const { organisationId, eventType, data } = raw;
    const { hooks, sent, failed } = await runOrganisationOutboundWebhookFanout({
      organisationId,
      eventType,
      data,
    });
    if (failed > 0) {
      logger.warn("Some outbound webhooks failed (see outbound_webhook_deliveries)", {
        organisationId,
        eventType,
        failed,
        sent,
        hooks,
      });
    }
    return { received: true, mode: "fanout" as const, hooks, sent, failed };
  },
);

/**
 * Durable, per-phone-serialized inbound WhatsApp processing. Config + body live in
 * ./whatsapp-inbound so the worker can be unit-tested without an Inngest runtime.
 */
export const whatsappInbound = inngest.createFunction(
  whatsappInboundConfig,
  async ({ event, step }) => {
    // Shim Inngest's step to the minimal StepRunner the (unit-testable) job body needs.
    const stepRunner = {
      run: <T>(name: string, fn: () => Promise<T>) => step.run(name, fn) as Promise<T>,
    };
    return handleWhatsappInboundJob({ event, step: stepRunner });
  },
);

/**
 * Post-Hire Pulse: daily scheduled function that checks for hires needing 30/60/90-day check-ins.
 * Runs daily and sends WhatsApp check-ins to hiring managers.
 */
export const postHirePulseScheduler = inngest.createFunction(
  {
    id: "post-hire-pulse-scheduler",
    retries: 1,
    triggers: { cron: "0 10 * * *" }, // Daily at 10 AM
  },
  async () => {
    const admin = createSupabaseAdmin();
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    // Fetch every hire whose hire date falls anywhere in the 28..92-day window so all
    // three milestones (30/60/90) are covered in one daily pass. (Previously only the
    // 30-day window was queried, so 60- and 90-day check-ins never fired.)
    const windowStart = new Date(now.getTime() - 92 * dayMs); // ~90-day milestone edge
    const windowEnd = new Date(now.getTime() - 28 * dayMs); // ~30-day milestone edge

    // hired_at is the write-once source of truth (see 20260719120000 migration). Note:
    // pipeline_candidates has NO updated_at column (the prior query referenced one that never
    // existed, so this cron silently threw); created_at is the only legacy fallback.
    const { data: hires } = await admin
      .from("pipeline_candidates")
      .select(
        "id, job_id, candidate_id, hired_at, created_at, jobs!inner(hiring_manager_id, title)",
      )
      .eq("status", "hired")
      .gte("hired_at", windowStart.toISOString())
      .lte("hired_at", windowEnd.toISOString());

    const results = [];

    for (const hire of hires ?? []) {
      // Fall back to created_at only for any legacy row the backfill could not populate.
      const hireDate = new Date((hire.hired_at as string | null) ?? hire.created_at);
      const daysSinceHire = Math.floor((now.getTime() - hireDate.getTime()) / dayMs);
      const jobsData = hire.jobs;
      // Handle both array and single object cases
      const job = Array.isArray(jobsData)
        ? (jobsData[0] as { hiring_manager_id: string; title: string } | undefined)
        : (jobsData as { hiring_manager_id: string; title: string } | null);

      if (!job?.hiring_manager_id) continue;

      let checkInDay: 30 | 60 | 90 | null = null;
      if (daysSinceHire >= 28 && daysSinceHire <= 32) checkInDay = 30;
      else if (daysSinceHire >= 58 && daysSinceHire <= 62) checkInDay = 60;
      else if (daysSinceHire >= 88 && daysSinceHire <= 92) checkInDay = 90;

      if (!checkInDay) continue;

      // Check if already sent
      const { data: existing } = await admin
        .from("post_hire_pulse_responses")
        .select("id")
        .eq("pipeline_candidate_id", hire.id)
        .eq("check_in_day", checkInDay)
        .single();

      if (existing) continue;

      // Get hiring manager and candidate details
      const [{ data: profile }, { data: candidate }] = await Promise.all([
        // `profiles.name` does not exist (`full_name` does). The select failed
        // whole, so `profile` was always null and the `!profile?.phone`
        // guard below skipped every hiring manager — the post-hire pulse
        // check-in has never been sent to anyone.
        admin.from("profiles").select("phone, full_name").eq("id", job.hiring_manager_id).single(),
        admin.from("candidates").select("name").eq("id", hire.candidate_id).single(),
      ]);

      if (!profile?.phone) continue;

      // Send WhatsApp check-in
      const { sendPostHirePulseCheckIn } = await import("@/lib/services/whatsapp");
      const result = await sendPostHirePulseCheckIn({
        phone: profile.phone,
        hiringManagerName: profile.full_name ?? "Manager",
        candidateName: candidate?.name ?? "the candidate",
        jobTitle: job.title,
        checkInDay,
      });

      // Record sent
      await admin.from("post_hire_pulse_responses").insert({
        pipeline_candidate_id: hire.id,
        job_id: hire.job_id,
        candidate_id: hire.candidate_id,
        hiring_manager_id: job.hiring_manager_id,
        check_in_day: checkInDay,
        sent_at: now.toISOString(),
      });

      results.push({ pipelineCandidateId: hire.id, checkInDay, result });
    }

    logger.info("Post-hire pulse scheduler completed", { sent: results.length });
    return { sent: results.length, results };
  },
);

/**
 * A2: Nudge applicants when a job's optional application deadline is within 7d / 24h.
 * Runs every 6 hours; per-application sent flags prevent duplicates.
 */
export const applicationDeadlineReminders = inngest.createFunction(
  {
    id: "application-deadline-reminders",
    retries: 1,
    triggers: { cron: "30 */6 * * *" },
  },
  async () => {
    const admin = createSupabaseAdmin();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const { data: jobs, error: jobsErr } = await admin
      .from("jobs")
      .select("id, title, applications_close_at")
      .eq("status", "open")
      .not("applications_close_at", "is", null)
      .gt("applications_close_at", nowIso);

    if (jobsErr) {
      logger.error("application-deadline-reminders: jobs query failed", {
        error: String(jobsErr.message),
      });
      throw new Error(jobsErr.message);
    }

    const jobList = jobs ?? [];
    if (jobList.length === 0) {
      return { jobs: 0, reminders: 0 };
    }

    const jobById = Object.fromEntries(
      jobList.map((j) => [
        j.id as string,
        j as { id: string; title: string; applications_close_at: string },
      ]),
    );
    const jobIds = Object.keys(jobById);

    const { data: apps, error: appsErr } = await admin
      .from("applications")
      .select(
        "id, candidate_id, job_id, status, app_close_reminder_7d_sent_at, app_close_reminder_24h_sent_at",
      )
      .in("job_id", jobIds)
      .in("status", ["applied", "viewed", "shortlisted"]);

    if (appsErr) {
      logger.error("application-deadline-reminders: applications query failed", {
        error: String(appsErr.message),
      });
      throw new Error(appsErr.message);
    }

    const appRows = apps ?? [];
    const candidateIds = [...new Set(appRows.map((a) => a.candidate_id as string))];
    const userByCandidateId = new Map<string, string>();

    if (candidateIds.length > 0) {
      const { data: candRows, error: candErr } = await admin
        .from("candidates")
        .select("id, user_id")
        .in("id", candidateIds);
      if (candErr) {
        logger.error("application-deadline-reminders: candidates query failed", {
          error: String(candErr.message),
        });
        throw new Error(candErr.message);
      }
      for (const c of candRows ?? []) {
        const uid = c.user_id as string | null;
        if (uid) userByCandidateId.set(c.id as string, uid);
      }
    }

    let reminders = 0;
    for (const app of appRows) {
      const job = jobById[app.job_id as string];
      if (!job?.applications_close_at) continue;

      const hoursLeft = hoursUntil(job.applications_close_at, nowMs);
      if (!Number.isFinite(hoursLeft) || hoursLeft <= 0) continue;

      const kind = planApplicationDeadlineReminder({
        hoursLeft,
        sent7d: Boolean(app.app_close_reminder_7d_sent_at),
        sent24h: Boolean(app.app_close_reminder_24h_sent_at),
      });
      if (!kind) continue;

      const userId = userByCandidateId.get(app.candidate_id as string);
      if (!userId) continue;

      const title = "Application deadline approaching";
      const body =
        kind === "24h"
          ? `"${job.title}" stops accepting applications in about 24 hours.`
          : `"${job.title}" stops accepting applications in 7 days or less.`;

      const ok = await createNotification({
        userId,
        type: "application_update",
        title,
        body,
        link: "/candidate/applications",
        metadata: { jobId: job.id },
      });
      if (!ok) continue;

      const patch =
        kind === "24h"
          ? { app_close_reminder_24h_sent_at: nowIso }
          : { app_close_reminder_7d_sent_at: nowIso };

      const { error: updErr } = await admin
        .from("applications")
        .update({ ...patch, updated_at: nowIso })
        .eq("id", app.id as string);
      if (updErr) {
        logger.warn("application-deadline-reminders: failed to mark reminder sent", {
          applicationId: app.id,
          error: String(updErr.message),
        });
        continue;
      }
      reminders += 1;
    }

    logger.info("application-deadline-reminders completed", {
      jobs: jobList.length,
      reminders,
    });
    return { jobs: jobList.length, reminders };
  },
);

/**
 * Screening inactivity handler:
 * - waits 6h from activity watermark and nudges if still inactive
 * - waits 24h from same watermark and marks no_response if still inactive
 */
export const screeningInactivity = inngest.createFunction(
  {
    id: "screening-inactivity",
    retries: 1,
    triggers: { event: "screening/inactivity" },
  },
  async ({ event, step }) => {
    const payload = event.data as ScreeningInactivityEvent;
    if (!payload?.jobId || !payload?.organisationId || !payload?.activityAtIso) {
      return { skipped: "invalid_payload" };
    }

    await step.sleepUntil("wait-for-nudge", nudgeDueAt(payload.activityAtIso));
    const nudgeResult = await step.run("process-nudge", async () =>
      processScreeningInactivityNudge(payload),
    );

    await step.sleepUntil("wait-for-timeout", timeoutDueAt(payload.activityAtIso));
    const timeoutResult = await step.run("process-timeout", async () =>
      processScreeningInactivityTimeout(payload),
    );

    return { nudgeResult, timeoutResult };
  },
);

/**
 * Prescreen lifecycle (per-channel gate): one reminder at PRESCREEN_REMINDER_HOURS,
 * then force-resolve as unverified at PRESCREEN_TIMEOUT_HOURS if still open.
 * Idempotent: handlers no-op once the session is complete.
 */
export const prescreenLifecycle = inngest.createFunction(
  {
    id: "prescreen-lifecycle",
    retries: 2,
    triggers: { event: "prescreen/lifecycle" },
  },
  async ({ event, step }) => {
    const payload = event.data as PrescreenLifecyclePayload;
    if (
      !payload?.sessionId ||
      !payload?.jobId ||
      !payload?.candidateId ||
      !payload?.questionsSentAtIso
    ) {
      return { skipped: "invalid_payload" };
    }

    await step.sleepUntil("prescreen-reminder", prescreenReminderDueAt(payload.questionsSentAtIso));
    const reminder = await step.run("prescreen-process-reminder", async () =>
      processPrescreenReminder(payload),
    );

    await step.sleepUntil("prescreen-timeout", prescreenTimeoutDueAt(payload.questionsSentAtIso));
    const timeout = await step.run("prescreen-process-timeout", async () =>
      processPrescreenTimeout(payload),
    );

    return { reminder, timeout };
  },
);

/**
 * Headcount plan sync worker. Accepts normalized HRMS payload and updates approved plan read-model.
 */
export const headcountPlanSync = inngest.createFunction(
  {
    id: "headcount-plan-sync",
    retries: 2,
    timeouts: { finish: "5m" },
    triggers: { event: "headcount-plan-sync/run" },
  },
  async ({ event }) => {
    const payload = event.data as {
      organisationId: string;
      actorProfileId: string;
      planCode: string;
      title: string;
      fiscalYear: number;
      sourceSystem?: string | null;
      sourceRef?: string | null;
      lines: Array<{
        department?: string | null;
        roleLevel?: string | null;
        costCenter?: string | null;
        locationCity?: string | null;
        headcountLimit?: number | null;
        approvedBudgetMin?: number | null;
        approvedBudgetMax?: number | null;
        currency?: string | null;
      }>;
    };
    const admin = createSupabaseAdmin();
    const synced = await upsertApprovedHeadcountPlan(admin, payload);
    return {
      organisationId: payload.organisationId,
      planCode: payload.planCode,
      ...synced,
    };
  },
);

/**
 * Referral campaign sender: processes recipients in bounded batches and stops when no pending rows remain
 * or campaign is no longer active.
 */
export const referralCampaignSend = inngest.createFunction(
  {
    id: "referral-campaign-send",
    retries: 2,
    timeouts: { finish: "10m" },
    triggers: { event: "referral-campaign/send" },
  },
  async ({ event }) => {
    const payload = event.data as {
      campaignId: string;
      organisationId: string;
      batchSize?: number;
    };

    const admin = createSupabaseAdmin();
    const maxPasses = 20;
    const batchSize = Math.max(1, Math.min(payload.batchSize ?? 25, 200));
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let pending = 0;
    let halted = false;

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const out = await processReferralCampaignSend(admin, {
        campaignId: payload.campaignId,
        organisationId: payload.organisationId,
        batchSize,
      });
      sent += out.sent;
      failed += out.failed;
      skipped += out.skipped;
      pending = out.pending;
      halted = out.halted;
      if (halted || pending === 0 || out.sent + out.failed + out.skipped === 0) break;
    }

    logger.info("Referral campaign send worker completed", {
      campaignId: payload.campaignId,
      organisationId: payload.organisationId,
      sent,
      failed,
      skipped,
      pending,
      halted,
    });

    return {
      campaignId: payload.campaignId,
      organisationId: payload.organisationId,
      sent,
      failed,
      skipped,
      pending,
      halted,
    };
  },
);

export const referralCampaignScheduledLaunch = inngest.createFunction(
  {
    id: "referral-campaign-scheduled-launch",
    retries: 2,
    triggers: { event: "referral-campaign/scheduled-launch" },
  },
  async ({ event, step }) => {
    const payload = event.data as {
      campaignId: string;
      organisationId: string;
      userId: string;
      batchSize?: number;
      launchesAt?: string;
    };
    if (payload.launchesAt) {
      await step.sleepUntil("wait-for-campaign-start", new Date(payload.launchesAt));
    }

    const admin = createSupabaseAdmin();
    const campaign = await getCampaignById(admin, payload.campaignId, payload.organisationId);
    if (!campaign || campaign.status === "ended") {
      return { skipped: true, reason: "campaign_not_launchable" };
    }

    await executeCampaignLaunch(admin, {
      campaignId: payload.campaignId,
      organisationId: payload.organisationId,
      userId: payload.userId,
      audienceFilter: campaign.audience_filter,
      objective: campaign.objective,
    });

    const { enqueue } = await import("@/lib/jobs/queue");
    await enqueue(
      "referral-campaign-send",
      {
        campaignId: payload.campaignId,
        organisationId: payload.organisationId,
        batchSize: payload.batchSize ?? 25,
      },
      { id: `referral-campaign-send:${payload.campaignId}:${Date.now()}` },
    );

    return { campaignId: payload.campaignId, launched: true };
  },
);

export const referralCampaignCheckEnd = inngest.createFunction(
  {
    id: "referral-campaign-check-end",
    triggers: { cron: "0 * * * *" },
  },
  async () => {
    const admin = createSupabaseAdmin();
    const ended = await autoEndExpiredCampaigns(admin);
    logger.info("Referral campaign auto-end cron completed", { ended });
    return { ended };
  },
);

export const referralCampaignAttribute = inngest.createFunction(
  {
    id: "referral-campaign-attribute",
    retries: 3,
    triggers: { event: "referral-campaign/attribute" },
  },
  async ({ event }) => {
    const payload = event.data as {
      applicationId: string;
      referrerId: string;
      jobId: string;
    };
    const admin = createSupabaseAdmin();
    const campaignId = await attributeApplicationToCampaign(admin, payload);
    return { applicationId: payload.applicationId, campaignId };
  },
);

export const referralCampaignStatusAttribute = inngest.createFunction(
  {
    id: "referral-campaign-status-attribute",
    retries: 2,
    triggers: { event: "referral-campaign/status-attribute" },
  },
  async ({ event }) => {
    const payload = event.data as { applicationId: string; status: string };
    const admin = createSupabaseAdmin();
    await recordCampaignStatusAttribution(admin, payload);
    return payload;
  },
);

/**
 * Brief 8 Phase C: interviewer feedback nudges (24h after slot end) and candidate slot-picker follow-ups.
 */
export const interviewSchedulingFollowups = inngest.createFunction(
  {
    id: "interview-scheduling-followups",
    triggers: { cron: "15 * * * *" },
  },
  async () => {
    const admin = createSupabaseAdmin();
    const { runInterviewerFeedbackOverdueNudges, runCandidateSlotPickerFollowups } =
      await import("@/lib/interviews/scheduling-followups");
    const interviewer = await runInterviewerFeedbackOverdueNudges(admin);
    const candidate = await runCandidateSlotPickerFollowups(admin);
    logger.info("Interview scheduling follow-ups completed", { interviewer, candidate });
    return { interviewer, candidate };
  },
);

/**
 * WhatsApp screening reconciler: the interview flow is event-driven, so a
 * missed trigger strands a candidate silently. This sweep repairs strays —
 * stalled armed sessions, unrecorded gates, pending pairs whose JD is already
 * approved — idempotently and capped. See lib/whatsapp/screening-reconciler.
 */
export const whatsappScreeningReconciler = inngest.createFunction(
  {
    id: "whatsapp-screening-reconciler",
    triggers: { cron: "45 * * * *" },
  },
  async () => {
    const admin = createSupabaseAdmin();
    const { runScreeningReconciler } = await import("@/lib/whatsapp/screening-reconciler");
    const summary = await runScreeningReconciler(admin);
    logger.info("WhatsApp screening reconciler completed", { ...summary });
    return summary;
  },
);

/** Brief 11 Phase C: detect candidates stuck past plan stage dwell time. */
export const planExceptionDetection = inngest.createFunction(
  {
    id: "plan-exception-detection",
    triggers: { cron: "0 */6 * * *" },
  },
  async () => {
    const admin = createSupabaseAdmin();
    const { runPlanExceptionDetection } =
      await import("@/lib/recruitment-plan/plan-exception-detection");
    const result = await runPlanExceptionDetection(admin);
    logger.info("Plan exception detection completed", result);
    return result;
  },
);

/** V3 Phase 2: async JD Base generation (event-driven). */
export const generateJdBase = inngest.createFunction(
  {
    id: "generate-jd-base",
    retries: 2,
    timeouts: { finish: "5m" },
    triggers: { event: "jd-base/generate" },
  },
  async ({ event }) => {
    const { jobId } = event.data as { jobId: string };
    const admin = createSupabaseAdmin();
    const { data: job, error } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (error || !job) throw new Error(`Job not found: ${jobId}`);
    const { ensureJdBaseForJob } = await import("@/lib/fitscore/hybrid/jd-base");
    await ensureJdBaseForJob(admin, job as import("@/lib/fitscore/types").JobData);
    logger.info("generateJdBase completed", { jobId });
    return { jobId };
  },
);

/**
 * Post-approval reconcile: re-score every existing candidate for a job after JD Base
 * approval. Runs in the background so the approve request confirms instantly — inline
 * it timed out on jobs with hundreds of candidates (each rescore is an LLM call), the
 * wizard showed a failure although approval had committed, and the retry triggered a
 * duplicate full rescore. The approve route enqueues with a `{jobId}:{version}` event
 * id so Inngest dedupes retries of the same approval.
 */
export const jdBaseApprovalReconcile = inngest.createFunction(
  {
    id: "jd-base-approval-reconcile",
    retries: 2,
    timeouts: { finish: "60m" },
    triggers: { event: "jd-base/approval-reconcile" },
  },
  async ({ event }) => {
    const { jobId, approvedByUserId } = event.data as {
      jobId: string;
      approvedByUserId?: string | null;
    };
    const admin = createSupabaseAdmin();
    const { reconcileApprovedJdBaseForJob } = await import("@/lib/fitscore/pending-jd-approval");
    const reconciliation = await reconcileApprovedJdBaseForJob(admin, jobId);
    if (reconciliation.scored > 0 && approvedByUserId) {
      const { notifyJdReconcileComplete, logJdRescorePlanHistory } =
        await import("@/lib/fitscore/notify-jd-reconcile");
      await notifyJdReconcileComplete(admin, {
        jobId,
        scoredCount: reconciliation.scored,
        failedCount: reconciliation.failed,
        approvedByUserId,
        verdictChanges: reconciliation.verdictChanges,
      });
      await logJdRescorePlanHistory(admin, {
        jobId,
        scoredCount: reconciliation.scored,
        verdictChanges: reconciliation.verdictChanges,
      });
      const { notifyWhatsAppFitScoreComplete } =
        await import("@/lib/whatsapp/fit-score-complete-notifier");
      const ids = reconciliation.pendingSweep.scoredCandidateIds ?? [];
      await Promise.all(
        ids.map((candidateId) =>
          notifyWhatsAppFitScoreComplete(admin, { jobId, candidateId }).catch((error) => {
            logger.warn("WhatsApp JD approval score notify failed", {
              jobId,
              candidateId,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }),
        ),
      );
    }
    logger.info("jdBaseApprovalReconcile completed", {
      jobId,
      processed: reconciliation.processed,
      scored: reconciliation.scored,
      failed: reconciliation.failed,
    });
    return {
      jobId,
      processed: reconciliation.processed,
      scored: reconciliation.scored,
      failed: reconciliation.failed,
    };
  },
);

/**
 * Auto-generate a draft JD from an approved hiring request. Runs in the
 * background so the approval decision confirms instantly instead of blocking on
 * the Claude JD-generation call. Idempotent — skips if a job is already assigned.
 */
export const requisitionGenerateJd = inngest.createFunction(
  {
    id: "requisition-generate-jd",
    retries: 2,
    timeouts: { finish: "5m" },
    triggers: { event: "requisition/generate-jd" },
  },
  async ({ event }) => {
    const { hiringRequestId, actorProfileId } = event.data as {
      hiringRequestId: string;
      actorProfileId: string;
    };
    const admin = createSupabaseAdmin();
    const { generateJdForApprovedRequisition } =
      await import("@/lib/hiring-requests/generate-jd-from-request");
    const result = await generateJdForApprovedRequisition(admin, {
      hiringRequestId,
      actorProfileId,
    });
    logger.info("requisitionGenerateJd completed", { hiringRequestId, result });
    return { hiringRequestId, ...result };
  },
);

/** V3 Phase 4: listwise rerank on boundary pool (cron + event). */
export const listwiseRerank = inngest.createFunction(
  {
    id: "listwise-rerank",
    retries: 2,
    timeouts: { finish: "8m" },
    triggers: [{ event: "fitscore/listwise-rerank" }, { cron: "0 3 * * 1" }],
  },
  async ({ event }) => {
    const admin = createSupabaseAdmin();
    const payload = (event?.data ?? {}) as {
      jobId?: string;
      jdBaseVersion?: number;
      organisationId?: string;
    };
    if (!payload.jobId) {
      logger.info("listwiseRerank cron tick (no jobId in payload)");
      return { skipped: true };
    }
    const { runListwiseRerank } = await import("@/lib/fitscore/cascade/listwise-rerank");
    const { data: scores } = await admin
      .from("fit_scores")
      .select("candidate_id, overall_score")
      .eq("job_id", payload.jobId)
      .eq("scoring_status", "scored")
      .is("superseded_at", null)
      .order("overall_score", { ascending: false })
      .limit(30);
    const candidates = (scores ?? []).map((s) => ({
      candidateId: s.candidate_id as string,
      fitScore: Number(s.overall_score),
    }));
    const result = await runListwiseRerank(admin, {
      jobId: payload.jobId,
      jdBaseVersion: payload.jdBaseVersion ?? 1,
      organisationId: payload.organisationId,
      roleTitle: "Role",
      candidates,
      summaries: {},
    });
    return { jobId: payload.jobId, ordered: result.orderedIds.length, fromCache: result.fromCache };
  },
);

/** V3 Phase 4: lazy Sonnet verdict when HM views shortlist. */
export const lazyVerdict = inngest.createFunction(
  {
    id: "lazy-verdict",
    retries: 2,
    timeouts: { finish: "3m" },
    triggers: { event: "fitscore/lazy-verdict" },
  },
  async ({ event }) => {
    const { jobId, candidateId } = event.data as { jobId: string; candidateId: string };
    const admin = createSupabaseAdmin();
    const { getJdBaseByJobId } = await import("@/lib/fitscore/hybrid/jd-base");
    const jdBase = await getJdBaseByJobId(admin, jobId);
    if (!jdBase?.approvedBy) return { skipped: true, reason: "no_approved_jd" };
    const { data: scoreRow } = await admin
      .from("fit_scores")
      .select("v2_extraction, overall_score, evidence_json")
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .is("superseded_at", null)
      .maybeSingle();
    if (!scoreRow?.v2_extraction) return { skipped: true, reason: "no_score" };
    logger.info("lazyVerdict queued", { jobId, candidateId });
    return { jobId, candidateId, note: "hook_runVerdictExplanation_on_hm_view" };
  },
);
