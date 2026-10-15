import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  findExistingCandidate,
  normalizeEmailForCandidate,
  normalizePhoneForCandidate,
} from "@/lib/agents/candidate-dedup";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { recordPlatformCostEvent } from "@/lib/costs/ledger";
import { enqueuePendingJdApprovalPair, isJdBaseApproved } from "@/lib/fitscore/pending-jd-approval";
import { logger } from "@/lib/observability/logger";
import { pushScoringDlq } from "@/lib/observability/scoring-dlq";
import { enqueue } from "@/lib/jobs/queue";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { startCanonicalScreeningCollectionBestEffort } from "@/lib/whatsapp/screening-qa-flow";
import type {
  IdibuCandidatePayload,
  IdibuCustomField,
  IdibuProcessOutcome,
  IdibuWebhookBody,
} from "./types";

const CV_DOWNLOAD_TIMEOUT_MS = 15_000;

/**
 * Reject URLs that could let an attacker pivot through our server to internal
 * infrastructure (SSRF). The Idibu webhook payload contains an attacker-influenced
 * `cv.file_link` which we `fetch()` server-side; without this guard a forged link
 * could target AWS IMDS (169.254.169.254), localhost services, or RFC1918 internal
 * IPs. This is a string-level allowlist; DNS rebinding is still possible but Vercel
 * functions are short-lived enough that the impact is bounded.
 */
function isSafeExternalUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (!host) return false;
  // Block localhost / loopback / link-local / RFC1918 / AWS IMDS, both name and IP-literal.
  if (host === "localhost" || host === "0.0.0.0") return false;
  if (host === "::1" || host === "[::1]") return false;
  // IPv4 literal checks
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map((n) => parseInt(n, 10));
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local incl. AWS IMDS
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 0) return false;
  }
  // IPv6 literal: anything starting with fc/fd (ULA) or fe80 (link-local).
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;
  return true;
}

function extractPhoneFromCustomFields(fields: IdibuCustomField[] | undefined): string | null {
  if (!fields?.length) return null;
  for (const field of fields) {
    const label = `${field.name ?? ""} ${field.label ?? ""}`.toLowerCase();
    if (label.includes("phone") || label.includes("mobile") || label.includes("contact")) {
      const value = field.value?.trim();
      if (value) return value;
    }
  }
  return null;
}

function fullNameFromPayload(payload: IdibuCandidatePayload): string {
  const first = payload.firstname?.trim() ?? "";
  const last = payload.lastname?.trim() ?? "";
  const combined = `${first} ${last}`.trim();
  return combined || "Candidate";
}

async function downloadCvAttachment(
  attachments: IdibuCandidatePayload["attachments"],
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cv = attachments?.find((a) => a.type === "cv_doc" && a.file_link?.trim());
  if (!cv?.file_link) return null;

  if (!isSafeExternalUrl(cv.file_link)) {
    throw new Error("cv_download_unsafe_url");
  }

  const res = await fetch(cv.file_link, {
    redirect: "follow",
    signal: AbortSignal.timeout(CV_DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`cv_download_failed:${res.status}`);
  }
  // Pre-flight size check: Content-Length is hint-only (server can lie), so we
  // also re-check after the read. Without these guards an attacker-controlled
  // file_link could stream gigabytes and OOM the function.
  const declaredLen = Number(res.headers.get("content-length") ?? "0");
  if (declaredLen > MAX_STANDARD_UPLOAD_BYTES) {
    throw new Error(`cv_download_too_large:${declaredLen}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_STANDARD_UPLOAD_BYTES) {
    throw new Error(`cv_download_too_large:${arrayBuffer.byteLength}`);
  }
  const contentType = res.headers.get("content-type") ?? "application/pdf";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function uploadCvToStorage(
  supabase: SupabaseClient,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const ext =
    contentType.includes("wordprocessingml") || contentType === "application/msword"
      ? "docx"
      : "pdf";
  const fileName = `cvs/idibu_${Date.now()}_${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("candidate-cvs")
    .upload(fileName, new Uint8Array(buffer), {
      contentType,
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`cv_upload_failed:${uploadError.message}`);
  }
  // Signed URL for private bucket (1h). Readers re-derive the storage path from
  // the URL and download via the admin client; expiry only affects direct links.
  const { data: signed } = await supabase.storage
    .from("candidate-cvs")
    .createSignedUrl(fileName, 3600);
  return signed?.signedUrl ?? null;
}

async function ensurePipelineRow(
  supabase: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<void> {
  const { data: existingRows } = await supabase
    .from("pipeline_candidates")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .limit(1);
  if (existingRows?.[0]) return;

  const { data: firstStage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  await supabase.from("pipeline_candidates").insert({
    job_id: jobId,
    candidate_id: candidateId,
    stage_id: firstStage?.id ?? null,
    status: "in_progress",
    agency_stage: "interest_received",
  });
}

async function recordIdibuCostEvent(params: {
  jobId: string;
  candidateId: string;
  organisationId: string;
  idibuCandidateId: string;
  board: string;
}): Promise<void> {
  await recordPlatformCostEvent({
    provider: "tigerhire",
    service: "idibu_webhook",
    category: "candidate_ingest",
    externalId: `idibu:candidate:${params.idibuCandidateId}`,
    organisationId: params.organisationId,
    jobId: params.jobId,
    candidateId: params.candidateId,
    amountUsd: 0,
    status: "estimated",
    metadata: {
      source: "idibu_webhook",
      board: params.board,
    },
  });
}

export async function processIdibuWebhook(
  body: IdibuWebhookBody,
  /**
   * The organisation whose webhook secret authenticated this request, when the
   * org-scoped endpoint was used. The target job is resolved from the caller's
   * payload, so without this check org A (holding its own valid secret) could
   * inject candidates, storage uploads and billed scoring into org B's job —
   * job UUIDs are public on the job board. `null` = shared platform endpoint,
   * which is separately guarded by `platformPathAllowedForVacancy`.
   */
  authenticatedOrganisationId?: string | null,
): Promise<{ outcome: IdibuProcessOutcome; jobId?: string; candidateId?: string }> {
  const supabase = createSupabaseAdmin();
  const payload = body.payload;
  const eventType = body["payload-information"]?.webhook_event ?? "unknown";
  const vacancyRef = payload?.vacancies?.[0]?.reference?.trim();
  const board = payload?.source?.trim() || "unknown";
  const email = normalizeEmailForCandidate(payload?.email);
  const idibuCandidateId = payload?.id != null ? String(payload.id) : null;

  logger.info("idibu_webhook_processing", {
    eventType,
    vacancyRef,
    candidateEmail: email,
    board,
    idibuCandidateId,
  });

  if (!payload || !vacancyRef) {
    await supabase.from("idibu_dead_letter").insert({
      payload_json: body as unknown as Record<string, unknown>,
      error_reason: "missing_vacancy_reference",
    });
    return { outcome: "dead_letter" };
  }

  // Idempotency: derive a stable event id from the idibu payload so a retried/duplicate
  // delivery does not re-create candidates/applications/cost events. idibu does not send a
  // first-class event id, so we compose one from vacancy ref + candidate ref + event type.
  // Reuses the shared webhook_event_try_acquire RPC (see stripe/razorpay webhooks).
  const idibuEventId = `${vacancyRef}:${idibuCandidateId ?? email ?? "anon"}:${eventType}`;
  const { data: acquired } = await supabase.rpc("webhook_event_try_acquire", {
    p_provider: "idibu",
    p_event_id: idibuEventId,
  });
  if (acquired === false) {
    logger.info("idibu_webhook_duplicate_event_skipped", {
      vacancyRef,
      idibuCandidateId,
      eventType,
    });
    return { outcome: "skipped" };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, organisation_id, title, status")
    .eq("id", vacancyRef)
    .maybeSingle();

  if (jobErr || !job?.organisation_id) {
    await supabase.from("idibu_dead_letter").insert({
      payload_json: body as unknown as Record<string, unknown>,
      error_reason: "job_not_found",
    });
    return { outcome: "dead_letter", jobId: vacancyRef };
  }

  const jobId = job.id as string;
  const organisationId = job.organisation_id as string;

  if (authenticatedOrganisationId != null && organisationId !== authenticatedOrganisationId) {
    logger.warn("idibu_webhook_cross_org_rejected", {
      jobId,
      jobOrganisationId: organisationId,
      authenticatedOrganisationId,
    });
    await supabase.from("idibu_dead_letter").insert({
      payload_json: body as unknown as Record<string, unknown>,
      error_reason: "cross_org_vacancy_reference",
    });
    return { outcome: "dead_letter", jobId };
  }

  if (email) {
    const existingCandidateId = await findExistingCandidate(supabase, { email });
    if (existingCandidateId) {
      const { data: existingApp } = await supabase
        .from("applications")
        .select("id")
        .eq("candidate_id", existingCandidateId)
        .eq("job_id", jobId)
        .limit(1)
        .maybeSingle();
      if (existingApp) {
        logger.info("idibu_webhook_duplicate", {
          jobId,
          candidateId: existingCandidateId,
          idibuCandidateId,
        });
        return { outcome: "duplicate", jobId, candidateId: existingCandidateId };
      }
    }
  }

  let cvUrl: string | null = null;
  let cvPending = false;
  try {
    const downloaded = await downloadCvAttachment(payload.attachments);
    if (!downloaded) {
      cvPending = true;
    } else {
      cvUrl = await uploadCvToStorage(supabase, downloaded.buffer, downloaded.contentType);
    }
  } catch (err) {
    cvPending = true;
    logger.error("idibu_webhook_cv_failed", {
      jobId,
      idibuCandidateId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const candidateName = fullNameFromPayload(payload);
  const phone = normalizePhoneForCandidate(extractPhoneFromCustomFields(payload.custom_fields));
  const existingCandidateId = email
    ? await findExistingCandidate(supabase, { email, phone })
    : null;

  const candidateData: Record<string, unknown> = {
    name: candidateName,
    full_name: candidateName,
    email,
    phone,
    resume_url: cvUrl,
    cv_url: cvUrl,
    entry_path: "idibu",
    source_detail: board,
    external_id: idibuCandidateId,
    processing_status: cvPending ? "pending_cv" : "pending",
    updated_at: new Date().toISOString(),
  };

  let candidateId = existingCandidateId;
  if (candidateId) {
    await supabase.from("candidates").update(candidateData).eq("id", candidateId);
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("candidates")
      .insert({
        ...candidateData,
        skills: [],
        visibility: true,
        trust_score: 10,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      throw new Error(`candidate_insert_failed:${insertErr?.message ?? "unknown"}`);
    }
    candidateId = inserted.id as string;
  }

  const applicationSource = `idibu:${board}`;
  const { data: appRows, error: appErr } = await supabase
    .from("applications")
    .upsert(
      {
        candidate_id: candidateId,
        job_id: jobId,
        status: "applied",
        source: applicationSource,
        apply_method: "job_board",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "candidate_id,job_id" },
    )
    .select("id")
    .limit(1);

  if (appErr) {
    throw new Error(`application_upsert_failed:${appErr.message}`);
  }

  await ensurePipelineRow(supabase, jobId, candidateId);

  if (idibuCandidateId) {
    await recordIdibuCostEvent({
      jobId,
      candidateId,
      organisationId,
      idibuCandidateId,
      board,
    });
  }

  if (cvPending) {
    logger.info("idibu_webhook_cv_pending", { jobId, candidateId, idibuCandidateId });
    return { outcome: "cv_failed", jobId, candidateId };
  }

  // Canonical screening collection (best-effort): board applicants don't answer
  // screening questions inline, so if this job has active questions, ask over
  // WhatsApp. Answers land in application_screening_answers and the always-on
  // FitScore gate passes once answered; no phone -> candidate stays gated.
  await startCanonicalScreeningCollectionBestEffort({
    admin: supabase,
    jobId,
    candidateId,
    organisationId,
    phone,
    source: "idibu",
  });

  const jdApproved = await isJdBaseApproved(supabase, jobId);
  if (!jdApproved) {
    await enqueuePendingJdApprovalPair(supabase, jobId, candidateId);
    return { outcome: "success", jobId, candidateId };
  }

  await enqueue("fit-score-single", { jobId, candidateId }).catch((err) => {
    logger.warn("idibu_webhook: failed to enqueue fit-score-single", {
      jobId,
      candidateId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  if (!process.env.INNGEST_EVENT_KEY) {
    try {
      await FitScoreService.computeSingle(supabase, jobId, candidateId, {
        source: "idibu",
      });
    } catch (err) {
      await pushScoringDlq(supabase, {
        jobId,
        candidateId,
        route: "POST /api/webhooks/idibu",
        errorMessage: err instanceof Error ? err.message : String(err),
        organisationId,
      });
      logger.error("idibu_webhook_scoring_failed", {
        jobId,
        candidateId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { outcome: "success", jobId, candidateId };
}

export function parseIdibuWebhookBody(raw: unknown): IdibuWebhookBody {
  if (!raw || typeof raw !== "object") return {};
  return raw as IdibuWebhookBody;
}
