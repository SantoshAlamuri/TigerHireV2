import type { SupabaseClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/config/env";
import {
  parseCVWithClaude,
  parseResumeFileWithClaude,
  type ResumeParseCostAttribution,
} from "@/lib/agents/cv-parser";
import { isNonRetriableCvParseError } from "@/lib/agents/cv-parse-repair";
import {
  findExistingCandidate,
  normalizeEmailForCandidate,
  normalizePhoneForCandidate,
} from "@/lib/agents/candidate-dedup";
import {
  FitScoreService,
  numericOverallFromFitScoreServiceResult,
} from "@/lib/services/FitScoreService";
import { enqueuePendingJdApprovalPair, isJdBaseApproved } from "@/lib/fitscore/pending-jd-approval";
import type { JobData } from "@/lib/fitscore/types";
import { calculateGhostRiskScore } from "@/lib/agents/ghostbuster";
import { startVouchFlow } from "@/lib/agents/vouch";
import { sendApplicationReceivedTemplate, sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { sendApplicationConfirmation } from "@/lib/services/resend";
import { logAgentRun } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";
import { mergeApplicationReferralFields } from "@/lib/referrers/application-referral-merge";
import { recordIntakeConsentBestEffort } from "@/lib/consent/record-intake-consent";
import { assertNotInOrgCoolingOff } from "@/lib/applications/cooling-off";
import { ApplicationApplyError } from "@/lib/applications/application-apply-error";
import { startPrescreenGateBestEffort } from "@/lib/prescreen/start-gate";
import {
  fetchActiveScreeningQuestions,
  evaluateScreeningAnswers,
  type ScreeningAnswerItem,
} from "@/lib/screening/job-screening";
import { upsertApplicationScreeningAnswers } from "@/lib/screening/application-screening-answers";
import { buildCandidateAcknowledgementPlan } from "@/lib/acknowledgements/notifier";
import { buildAckDedupeKey } from "@/lib/acknowledgements/dedupe";
import { logCandidateAcknowledgementAttempt } from "@/lib/acknowledgements/log";
import { hasSentAttemptWithinWindow } from "@/lib/acknowledgements/idempotency";

/** Result of resolving `referral_links` + `referrers` for a public apply `ref` token. */
export type ReferralTokenResolution = {
  referralLinkId: string;
  directReferrerId: string;
  parentReferrerId: string | null;
  referrerType: string;
  referrerWhatsappNumber: string | null;
  referrerWhatsappVerified: boolean;
};

export interface PublicApplyInput {
  fileBuffer: Buffer;
  fileName: string;
  contentType?: string;
  organisationId: string;
  jobId?: string;
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  /** Server-only scope; public intake sets this independently of submitted source labels. */
  requirePublicJob?: boolean;
  /** Public apply `?ref=` token; resolved in `processPublicApplication` only. */
  ref?: string;
  /** Server-only: set after `resolveReferralToken` inside `processPublicApplication`. */
  referralResolution?: ReferralTokenResolution | null;
  /**
   * Yes/no answers for `jobId` (required when that job has active screening questions).
   * JSON body on POST /api/apply, or parsed in `processPublicApplication` tests.
   */
  screeningAnswers?: ScreeningAnswerItem[];
  /**
   * When true, candidate checked consent for WhatsApp on the apply form.
   * When false, outbound WhatsApp templates are skipped for this apply (email still used where applicable).
   */
  whatsappOptIn?: boolean;
  /**
   * Used by agency-specific flows that run their own acknowledgement orchestrator.
   * When true, this helper skips its default public-apply acknowledgement dispatch.
   */
  skipCandidateAcknowledgement?: boolean;
  /**
   * Explicit candidate consent captured at the point of intake — e.g. the web apply
   * form's consent checkbox. When `given: true`, an opt-in consent record is written
   * keyed on the candidate. When absent, recruiter-submitted sources (email_intake,
   * *_upload, direct) get a provenance/basis record instead. See
   * `@/lib/consent/record-intake-consent`.
   */
  consent?: { given: boolean; ipAddress?: string | null } | null;
}

export interface PublicApplyResult {
  candidateId: string;
  candidateName: string | null;
  /** Jobs that have a FitScore after this run (existing + newly computed for targeted open roles). */
  jobsScored: number;
  topScore: number | null;
  /** True when Phase 2 did not finish (parse not persisted or threw). */
  parsingPending?: boolean;
  /** True when resume was parsed but no FitScore could be stored for any targeted job. */
  scoringFailed?: boolean;
  /** Parsed OK but the client had no open roles to score against. */
  noOpenJobs?: boolean;
  /** At least one targeted role was not scored because the JD base is still awaiting approval (scores may update later). */
  fitScoresIncompleteDueToPendingJd?: boolean;
  /**
   * True when this apply matched an already-existing candidate row (dedupe hit).
   * SECURITY: the API must NOT hand back a claim token in this case — the row
   * may belong to someone else, and the token would bind their profile to the
   * caller. See #331.
   */
  wasExistingCandidate?: boolean;
}

export interface SavedPublicApplicationResult {
  candidateId: string;
  candidateName: string;
  cvUrl: string | null;
  /** True when the candidate row already existed before this apply (dedupe hit). See #331. */
  wasExistingCandidate: boolean;
}

/** Avoid name-only dedupe for placeholder labels (creates false merges or noisy collisions). */
const GENERIC_APPLY_NAMES = new Set([
  "candidate",
  "resume",
  "cv",
  "unknown",
  "n/a",
  "na",
  "applicant",
  "profile",
  "my resume",
]);

function allowNameOnlyDedupForApply(name: string, hasEmail: boolean, hasPhone: boolean): boolean {
  if (hasEmail || hasPhone) return false;
  const t = name.trim();
  if (t.length < 4) return false;
  const simple = t
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ")
    .trim();
  if (GENERIC_APPLY_NAMES.has(simple)) return false;
  const tokens = t.split(/[\s_]+/).filter(Boolean);
  return tokens.length >= 2 || t.length >= 14;
}

function nameFromFileName(fileName: string): string | null {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\[[\d\w_]+\]\s*$/i, "")
    .trim();
  if (!base) return null;
  const withSpaces = base
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return withSpaces || base;
}

/**
 * Resolve `?ref=` token: `referral_links` (valid expiry) + `referrers` row.
 * Returns null if token missing, unknown, expired, job not open, or link job is not in `organisationId`.
 */
export async function resolveReferralToken(
  supabase: SupabaseClient,
  organisationId: string,
  ref: string | undefined | null,
): Promise<ReferralTokenResolution | null> {
  const token = typeof ref === "string" ? ref.trim() : "";
  if (!token) return null;

  const { data: link, error: linkErr } = await supabase
    .from("referral_links")
    .select("id, referrer_id, job_id, expires_at")
    .eq("token", token)
    .limit(1)
    .maybeSingle();

  if (linkErr || !link) return null;

  const expiresAt = link.expires_at as string | null | undefined;
  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() <= Date.now()) return null;
  }

  const linkJobId = link.job_id as string;
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("organisation_id, status")
    .eq("id", linkJobId)
    .maybeSingle();

  if (!jobRow || (jobRow.organisation_id as string) !== organisationId) return null;
  if (String((jobRow as { status?: string }).status ?? "").toLowerCase() !== "open") return null;

  const referrerId = link.referrer_id as string;
  const { data: referrer, error: refErr } = await supabase
    .from("referrers")
    .select("id, parent_referrer_id, type, whatsapp_number, whatsapp_verified")
    .eq("id", referrerId)
    .limit(1)
    .maybeSingle();

  if (refErr || !referrer) return null;

  return {
    referralLinkId: link.id as string,
    directReferrerId: referrer.id as string,
    parentReferrerId: (referrer.parent_referrer_id as string | null) ?? null,
    referrerType: referrer.type as string,
    referrerWhatsappNumber: (referrer.whatsapp_number as string | null) ?? null,
    referrerWhatsappVerified: Boolean(referrer.whatsapp_verified),
  };
}

/**
 * Create a new candidate record.
 * Returns the candidate ID.
 */
async function createCandidate(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  candidateData: Record<string, unknown>,
): Promise<string> {
  const { data: inserted, error: insertErr } = await supabase
    .from("candidates")
    .insert(candidateData)
    .select("id")
    .single();

  if (!insertErr && inserted) return inserted.id;

  const pgCode = (insertErr as { code?: string } | null)?.code;
  if (pgCode === "23505") {
    const emailNorm = normalizeEmailForCandidate(candidateData.email as string | null);
    const phone = (candidateData.phone as string | null) ?? undefined;
    const existing = await findExistingCandidate(
      supabase,
      { email: emailNorm, phone },
      { matchByName: false },
    );
    if (existing) return existing;
  }

  logger.error("PublicApply: candidate insert failed", {
    error: String(insertErr),
  });
  throw new Error("Failed to save candidate profile.");
}

/**
 * Phase 1b: Save candidate record immediately after the CV is stored.
 * Returns fast so the user gets feedback. Never fails unless DB is unreachable.
 *
 * Pattern: find or create candidate, then upsert applications.
 */
async function saveCandidate(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  input: PublicApplyInput,
  cvUrl: string | null,
): Promise<{ candidateId: string; candidateName: string; wasExistingCandidate: boolean }> {
  if (input.source === "agency_upload" && !input.jobId?.trim()) {
    throw new ApplicationApplyError(
      "Choose a target role before uploading candidates for this client.",
      "public_apply_invalid_target",
    );
  }

  const candidateName = input.name?.trim() || nameFromFileName(input.fileName) || "Candidate";
  const candidateEmail = normalizeEmailForCandidate(input.email?.trim() || null);
  const candidatePhone = normalizePhoneForCandidate(input.phone);

  // Step 1: find or create candidate
  const existingId = await findExistingCandidate(
    supabase,
    { email: candidateEmail, phone: candidatePhone, name: candidateName },
    {
      matchByName: allowNameOnlyDedupForApply(candidateName, !!candidateEmail, !!candidatePhone),
    },
  );

  const nowIso = new Date().toISOString();
  // Fields appropriate for an INSERT of a brand-new candidate. The null fields
  // are explicit zero-values so the row schema is fully populated. NEVER apply
  // this whole object to an existing candidate — doing so would wipe the
  // skills array, current_role, location, cv_parsed_at, etc. that a previous
  // apply or enrichment already wrote.
  const newCandidateData: Record<string, unknown> = {
    name: candidateName,
    full_name: candidateName,
    email: candidateEmail,
    phone: candidatePhone,
    current_role: null,
    current_company: null,
    skills: [],
    experience_years: null,
    location: null,
    resume_url: cvUrl,
    cv_url: cvUrl,
    cv_raw_text: null,
    cv_parsed_at: null,
    entry_path: input.referralResolution ? "referral" : "apply_page",
    trust_score: input.referralResolution ? 40 : 10,
    ghost_risk_score: null,
    visibility: true,
    updated_at: nowIso,
    availability: null,
    seniority_level: null,
    salary_expectation_min: null,
    salary_expectation_max: null,
    processing_status: "pending",
  };

  // For existing candidates: only update contact + CV-pointer fields. Skill,
  // role, location, cv_parsed_at etc. are reserved for Phase 2 to overwrite
  // AFTER a successful parse. Phase 1 must never leave the row worse than it
  // found it — if Phase 2 fails, the candidate keeps its previously-parsed
  // profile instead of being downgraded to "Candidate, no skills, no role"
  // until someone manually reprocesses.
  const existingCandidateUpdateData: Record<string, unknown> = {
    name: candidateName,
    full_name: candidateName,
    email: candidateEmail,
    phone: candidatePhone,
    resume_url: cvUrl,
    cv_url: cvUrl,
    updated_at: nowIso,
    processing_status: "pending",
  };

  // Cooling-off applies to EXISTING candidates against THIS org. Check it
  // BEFORE we touch the candidate row so a cooled-off re-applicant doesn't
  // get their processing_status reset and their parsed profile risked. New
  // candidates can't be in cooling-off (no history with this org).
  if (existingId) {
    await assertNotInOrgCoolingOff(supabase, existingId, input.organisationId);
  }

  const candidateId = existingId ?? (await createCandidate(supabase, newCandidateData));

  if (existingId) {
    await supabase.from("candidates").update(existingCandidateUpdateData).eq("id", existingId);
  }

  // DPDP: record intake consent keyed on candidate_id. Explicit opt-in when the
  // candidate ticked a box on the apply form; otherwise a recruiter-submitted
  // provenance/basis record. Idempotent per (candidate_id, channel) and
  // best-effort — never blocks the apply.
  await recordIntakeConsentBestEffort(supabase, {
    candidateId,
    source: input.referralResolution
      ? input.referralResolution.referrerType
      : (input.source ?? "direct"),
    phone: candidatePhone,
    consent: input.consent ?? null,
    whatsappOptIn: input.whatsappOptIn,
  });

  let jobsQuery = supabase
    .from("jobs")
    .select("id")
    .eq("status", "open")
    .eq("organisation_id", input.organisationId);
  if (input.requirePublicJob) {
    jobsQuery = jobsQuery.eq("list_on_public_job_board", true).eq("is_active", true);
  }
  if (input.jobId) {
    jobsQuery = jobsQuery.eq("id", input.jobId);
  } else {
    jobsQuery = jobsQuery.limit(20);
  }
  const { data: openJobs } = await jobsQuery;
  for (const job of openJobs ?? []) {
    const jobId = job.id as string;
    const { data: firstStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("job_id", jobId)
      .order("stage_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    // Use limit(1), not maybeSingle: duplicate rows for the same job+candidate make
    // maybeSingle error and data null, so every apply would insert another duplicate.
    const { data: existingRows } = await supabase
      .from("pipeline_candidates")
      .select("id")
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .limit(1);
    const existing = existingRows?.[0];
    if (!existing) {
      await supabase.from("pipeline_candidates").insert({
        job_id: jobId,
        candidate_id: candidateId,
        stage_id: firstStage?.id ?? null,
        status: "in_progress",
        agency_stage: "interest_received",
      });
    }

    const res = input.referralResolution;
    const applicationSource = res ? res.referrerType : (input.source ?? "direct");

    const { data: refLinkRows } = await supabase
      .from("applications")
      .select("referral_link_id, direct_referrer_id, parent_referrer_id")
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId)
      .limit(1);
    const existingApp = refLinkRows?.[0] as
      | {
          referral_link_id: string | null;
          direct_referrer_id: string | null;
          parent_referrer_id: string | null;
        }
      | undefined;

    const referralMerged = mergeApplicationReferralFields(
      existingApp ?? null,
      res
        ? {
            referralLinkId: res.referralLinkId,
            directReferrerId: res.directReferrerId,
            parentReferrerId: res.parentReferrerId,
          }
        : null,
    );

    const { data: appRows, error: appUpErr } = await supabase
      .from("applications")
      .upsert(
        {
          candidate_id: candidateId,
          job_id: jobId,
          status: "applied",
          source: applicationSource,
          updated_at: new Date().toISOString(),
          referral_link_id: referralMerged.referral_link_id,
          direct_referrer_id: referralMerged.direct_referrer_id,
          parent_referrer_id: referralMerged.parent_referrer_id,
          whatsapp_opt_in:
            input.whatsappOptIn === true ? true : input.whatsappOptIn === false ? false : null,
        },
        { onConflict: "candidate_id,job_id" },
      )
      .select("id")
      .limit(1);
    if (appUpErr) {
      logger.error("PublicApply: application upsert failed", { error: String(appUpErr) });
    }
    const newAppId = (appRows?.[0] as { id: string } | undefined)?.id;
    const directRefId = referralMerged.direct_referrer_id;
    if (newAppId && directRefId) {
      const { enqueueCampaignAttribution } = await import("@/lib/referrers/campaign-attribution");
      enqueueCampaignAttribution({
        applicationId: newAppId,
        referrerId: directRefId,
        jobId,
      });
    }
    if (newAppId && input.jobId === jobId && (input.screeningAnswers?.length ?? 0) > 0) {
      await upsertApplicationScreeningAnswers(
        supabase,
        newAppId,
        input.screeningAnswers as ScreeningAnswerItem[],
      );
    }
    if (newAppId) {
      await startPrescreenGateBestEffort(supabase, {
        jobId,
        candidateId,
        applicationId: newAppId,
        organisationId: input.organisationId,
        source: applicationSource,
        phone: candidatePhone,
      });
    }
  }

  return { candidateId, candidateName, wasExistingCandidate: Boolean(existingId) };
}

/**
 * Phase 1a: Upload CV to storage so later processing can read it without
 * requiring the original request payload.
 */
async function uploadCvToStorage(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  input: PublicApplyInput,
): Promise<string | null> {
  const ext =
    input.contentType?.includes("wordprocessingml") || input.contentType === "application/msword"
      ? "docx"
      : "pdf";
  const fileName = `cvs/public_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const uploadBody =
    Buffer.isBuffer(input.fileBuffer) && input.fileBuffer.length > 0
      ? new Uint8Array(input.fileBuffer)
      : input.fileBuffer;
  const { error: uploadError } = await supabase.storage
    .from("candidate-cvs")
    .upload(fileName, uploadBody, {
      contentType: input.contentType || "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    logger.error("PublicApply: storage upload error", {
      error: String(uploadError),
      fileName: input.fileName,
      bucket: "candidate-cvs",
    });
    // If storage fails, we can still save the candidate but without CV URL
    // This allows the upload to succeed even if storage is temporarily unavailable
    // The CV can be re-uploaded later if needed
  }

  // Signed URL for private bucket (1h). Readers re-derive the storage path from
  // the URL and download via the admin client, so expiry only affects direct
  // browser links, which are regenerated on demand elsewhere.
  const { data: signed } = await supabase.storage
    .from("candidate-cvs")
    .createSignedUrl(fileName, 3600);
  return signed?.signedUrl ?? null;
}

/**
 * Phase 2: Extract text from CV, parse with AI, score against jobs.
 * Called after the candidate is already saved. If this fails, the candidate
 * stays in pending and can be reprocessed later from storage — no re-upload.
 */
async function processCandidate(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  candidateId: string,
  input: PublicApplyInput,
  cvUrl: string | null,
  startTime: number,
): Promise<{
  jobsNewlyScored: number;
  jobsWithFitScoresTotal: number;
  topScore: number | null;
  parseCompleted: boolean;
  /** True when the parse failed in a way a retry cannot fix (schema/JSON/corrupt file). */
  parseFailedPermanently: boolean;
  /** False when there were no open jobs on the client to score against. */
  hadTargetJobs: boolean;
  /** Jobs we skipped scoring for because the JD base was not approved (pairs queued for later sweep). */
  jobsDeferredPendingJdApproval: number;
}> {
  const parseAttribution: ResumeParseCostAttribution = {
    organisationId: input.organisationId,
    jobId: input.jobId,
    candidateId,
  };

  let parsed: Awaited<ReturnType<typeof parseCVWithClaude>>["parsed"];
  let rawText: string | null = null;
  let tokens: { input: number; output: number };
  let model: string;

  try {
    const result = await parseResumeFileWithClaude(
      input.fileBuffer,
      input.fileName ?? "resume.pdf",
      parseAttribution,
    );
    parsed = result.parsed;
    rawText = result.rawTextForStorage ?? null;
    tokens = result.tokens;
    model = result.model;
  } catch (parseErr) {
    const parseFailedPermanently = isNonRetriableCvParseError(parseErr);
    logger.warn("PublicApply: resume parse failed", {
      fileName: input.fileName,
      candidateId,
      permanent: parseFailedPermanently,
      error: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    if (parseFailedPermanently) {
      // Leave a recruiter-visible "failed" instead of a forever-"pending" ghost.
      await supabase
        .from("candidates")
        .update({ processing_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", candidateId);
    }
    return {
      jobsNewlyScored: 0,
      jobsWithFitScoresTotal: 0,
      topScore: null,
      parseCompleted: false,
      parseFailedPermanently,
      hadTargetJobs: false,
      jobsDeferredPendingJdApproval: 0,
    };
  }

  const candidateName = input.name || parsed.full_name || null;
  const candidateEmail = normalizeEmailForCandidate(input.email || parsed.email || null);

  const ghostRisk = calculateGhostRiskScore({
    vouchCount: 0,
    availability: parsed.availability || null,
  });

  await supabase
    .from("candidates")
    .update({
      name: candidateName,
      full_name: candidateName,
      email: candidateEmail ?? null,
      current_role: parsed.current_title || null,
      current_company: parsed.current_company || null,
      skills: Array.isArray(parsed.canonical_skills) ? parsed.canonical_skills : [],
      experience_years: parsed.years_experience ?? null,
      location: parsed.location_city || null,
      resume_url: cvUrl,
      cv_url: cvUrl,
      cv_raw_text: rawText?.slice(0, 100000) ?? null,
      cv_parsed_at: new Date().toISOString(),
      trust_score: 15,
      ghost_risk_score: ghostRisk,
      updated_at: new Date().toISOString(),
      availability: parsed.availability || null,
      seniority_level: parsed.seniority_level || null,
      salary_expectation_min: parsed.salary_expectation_min ?? null,
      salary_expectation_max: parsed.salary_expectation_max ?? null,
      processing_status: "complete",
    })
    .eq("id", candidateId);

  const { data: candidateRow } = await supabase
    .from("candidates")
    .select("id")
    .eq("id", candidateId)
    .maybeSingle();

  if (!candidateRow) {
    return {
      jobsNewlyScored: 0,
      jobsWithFitScoresTotal: 0,
      topScore: null,
      parseCompleted: true,
      parseFailedPermanently: false,
      hadTargetJobs: false,
      jobsDeferredPendingJdApproval: 0,
    };
  }

  let jobsQuery = supabase
    .from("jobs")
    .select("*")
    .eq("status", "open")
    .eq("organisation_id", input.organisationId)
    .eq("list_on_public_job_board", true)
    .eq("is_active", true);
  if (input.source === "agency_upload") {
    if (!input.jobId?.trim()) {
      return {
        jobsNewlyScored: 0,
        jobsWithFitScoresTotal: 0,
        topScore: null,
        parseCompleted: true,
        parseFailedPermanently: false,
        hadTargetJobs: false,
        jobsDeferredPendingJdApproval: 0,
      };
    }
    jobsQuery = jobsQuery.eq("id", input.jobId);
  } else if (input.jobId) {
    jobsQuery = jobsQuery.eq("id", input.jobId);
  } else {
    jobsQuery = jobsQuery.limit(20);
  }

  const { data: jobs } = await jobsQuery;
  const jobList = (jobs ?? []) as Array<Record<string, unknown> & { id: string }>;

  if (jobList.length === 0) {
    await logAgentRun(
      supabase,
      "public_apply",
      "apply_page",
      candidateId,
      "success",
      Date.now() - startTime,
      undefined,
      tokens,
      model,
    );
    return {
      jobsNewlyScored: 0,
      jobsWithFitScoresTotal: 0,
      topScore: null,
      parseCompleted: true,
      parseFailedPermanently: false,
      hadTargetJobs: false,
      jobsDeferredPendingJdApproval: 0,
    };
  }

  const jobDataList: JobData[] = jobList.map((job) => ({
    id: job.id,
    title: String(job.title ?? ""),
    description: String(job.description ?? ""),
    location: (job.location as string) ?? null,
    status: String(job.status ?? "open"),
    compensation_min: job.compensation_min as number | null,
    compensation_max: job.compensation_max as number | null,
    organisation_id: String(job.organisation_id ?? ""),
  }));

  // Step 3: Only run FitScore if no existing score for this candidate+job combination
  // Check all jobs at once for efficiency
  const jobIds = jobDataList.map((j) => j.id);
  const { data: existingScores } =
    jobIds.length > 0
      ? await supabase
          .from("fit_scores")
          .select("job_id, candidate_id, overall_score")
          .eq("candidate_id", candidateId)
          .in("job_id", jobIds)
          .or("is_test_run.eq.false,is_test_run.is.null")
      : { data: [] as { job_id: string; candidate_id: string; overall_score: number }[] };

  const existingScoreMap = new Map<string, number>();
  for (const score of existingScores ?? []) {
    existingScoreMap.set(score.job_id, score.overall_score);
  }

  // Only compute scores for jobs that don't have existing scores
  const jobsToScore = jobDataList.filter((jobData) => !existingScoreMap.has(jobData.id));

  let jobsDeferredPendingJdApproval = 0;
  const approvedJobsToScore: JobData[] = [];
  for (const jobData of jobsToScore) {
    const approved = await isJdBaseApproved(supabase, jobData.id);
    if (!approved) {
      await enqueuePendingJdApprovalPair(supabase, jobData.id, candidateId);
      jobsDeferredPendingJdApproval++;
      continue;
    }
    approvedJobsToScore.push(jobData);
  }

  // Cap concurrent per-job FitScore LLM calls (same gate FitScoreService uses for
  // batch scoring) so a candidate matching many approved jobs can't fan out
  // unbounded and exhaust the Anthropic rate limit.
  const fitScoreLimiter = pLimit(env.fitscoreBatchConcurrency);
  const scoreResults = await Promise.allSettled(
    approvedJobsToScore.map((jobData) =>
      fitScoreLimiter(() =>
        FitScoreService.computeSingle(supabase, jobData.id, candidateId, {
          saveToDb: true,
          onUnapprovedJdBase: "queue_pending",
          source: "upload",
        }),
      ),
    ),
  );

  let topScore: number | null = null;
  let jobsNewlyScored = 0;

  // Best score among roles that already had a persisted FitScore for this candidate (any targeted job).
  // Deferred JD-approval roles without a row cannot contribute until approved and swept/reprocessed.
  for (const score of existingScores ?? []) {
    if (topScore === null || score.overall_score > topScore) {
      topScore = score.overall_score;
    }
  }

  for (let i = 0; i < scoreResults.length; i++) {
    const outcome = scoreResults[i];
    if (outcome.status === "fulfilled") {
      const n = numericOverallFromFitScoreServiceResult(outcome.value);
      if (n != null) {
        jobsNewlyScored++;
        if (topScore === null || n > topScore) {
          topScore = n;
        }
      }
    } else {
      logger.warn("PublicApply: FitScore failed for job", {
        job_id: approvedJobsToScore[i]?.id,
        error: String(outcome.reason),
      });
    }
  }

  const existingCount = (existingScores ?? []).length;
  const jobsWithFitScoresTotal = existingCount + jobsNewlyScored;

  await logAgentRun(
    supabase,
    "public_apply",
    "apply_page",
    candidateId,
    "success",
    Date.now() - startTime,
    undefined,
    tokens,
    model,
  );

  return {
    jobsNewlyScored,
    jobsWithFitScoresTotal,
    topScore,
    parseCompleted: true,
    parseFailedPermanently: false,
    hadTargetJobs: true,
    jobsDeferredPendingJdApproval,
  };
}

/**
 * Save a candidate CV + candidate record without doing the expensive parsing
 * and scoring work inline. Bulk upload uses this fast path to avoid timeouts.
 */
export async function savePublicApplication(
  input: PublicApplyInput,
): Promise<SavedPublicApplicationResult> {
  const start = Date.now();
  if (input.source === "agency_upload" && !input.jobId?.trim()) {
    throw new ApplicationApplyError(
      "Choose a target role before uploading candidates for this client.",
      "public_apply_invalid_target",
    );
  }
  const supabase = createSupabaseAdmin();

  const cvUrl = await uploadCvToStorage(supabase, input);
  const { candidateId, candidateName, wasExistingCandidate } = await saveCandidate(
    supabase,
    input,
    cvUrl,
  );

  logger.info("PublicApply: candidate saved", {
    candidateId,
    fileName: input.fileName,
    durationMs: Date.now() - start,
  });

  return {
    candidateId,
    candidateName,
    wasExistingCandidate,
    cvUrl,
  };
}

/**
 * After a successful public apply + parse, notify the candidate on WhatsApp: approved
 * `th_application_received` template when we have both the application row and job context;
 * otherwise a session (non-template) message with the login link. Used from `processPublicApplication`
 * and exported for unit tests.
 */
export async function sendPostApplyCandidatePortalNudge(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  input: Pick<PublicApplyInput, "phone" | "jobId" | "whatsappOptIn">,
  candidateId: string,
  candidateName: string | null,
): Promise<void> {
  try {
    if (input.whatsappOptIn === false) {
      return;
    }
    const phoneRaw = input.phone?.trim();
    if (!phoneRaw) return;
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io").replace(/\/$/, "");
    if (input.jobId) {
      const { data: appRow } = await supabase
        .from("applications")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_id", input.jobId)
        .maybeSingle();
      const { data: jobD } = await supabase
        .from("jobs")
        .select("title, organisations!jobs_organisation_id_fkey ( name )")
        .eq("id", input.jobId)
        .maybeSingle();
      if (appRow && jobD) {
        const orgR = (jobD as { organisations?: { name?: string } | { name?: string }[] | null })
          .organisations;
        const org = Array.isArray(orgR) ? orgR[0] : orgR;
        const companyName = (org as { name?: string } | null | undefined)?.name ?? "the company";
        const jobTitle = (jobD as { title?: string }).title ?? "the role";
        const cName = candidateName?.trim() || "Candidate";
        await sendApplicationReceivedTemplate({
          phone: phoneRaw,
          candidateName: cName,
          jobTitle,
          companyName,
          applicationId: (appRow as { id: string }).id,
        });
        return;
      }
    }
    const msg = `Thanks for applying! Track your application and refer others to earn: ${base}/login`;
    await sendWhatsAppMessage(phoneRaw, msg);
  } catch (err) {
    logger.warn("PublicApply: post-apply candidate portal nudge failed", {
      candidateId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function mapSuppressionOutcome(
  code: string | undefined,
): "suppressed_no_channel" | "suppressed_no_consent" | "suppressed_policy" {
  if (code === "no_channel") return "suppressed_no_channel";
  if (code === "no_consent") return "suppressed_no_consent";
  return "suppressed_policy";
}

async function logCvIngestedAttempt(input: {
  applicationId: string | null;
  candidateId: string;
  jobId: string | null;
  channel: "email" | "whatsapp";
  templateVariant: string;
  outcome:
    | "sent"
    | "suppressed_no_channel"
    | "suppressed_no_consent"
    | "suppressed_duplicate"
    | "suppressed_policy"
    | "failed_provider";
  reasonCode?: string | null;
  reasonDetail?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  keySuffix?: string;
}) {
  await logCandidateAcknowledgementAttempt({
    applicationId: input.applicationId,
    candidateId: input.candidateId,
    jobId: input.jobId,
    eventType: "cv_ingested",
    ingestionPath: "public_apply",
    channel: input.channel,
    templateVariant: input.templateVariant,
    outcome: input.outcome,
    reasonCode: input.reasonCode ?? null,
    reasonDetail: input.reasonDetail ?? null,
    provider: input.provider ?? null,
    providerMessageId: input.providerMessageId ?? null,
    dedupeKey: `${buildAckDedupeKey({
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      eventType: "cv_ingested",
      channel: input.channel,
      templateVariant: input.templateVariant,
    })}${input.keySuffix ? `:${input.keySuffix}` : ""}`,
  });
}

/**
 * Centralized public-apply acknowledgement attempts (dark-launch):
 * - flags OFF => preserves legacy WA-only behavior.
 * - flags ON => email + WA channel attempts with suppression/failure logging.
 */
export async function notifyCvIngestedFromPublicApply(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  input: Pick<PublicApplyInput, "phone" | "jobId" | "whatsappOptIn" | "email">,
  candidateId: string,
  candidateName: string | null,
): Promise<void> {
  const phoneRaw = input.phone?.trim() ?? null;
  const emailRaw = normalizeEmailForCandidate(input.email ?? null);
  const { data: appRow } = input.jobId
    ? await supabase
        .from("applications")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_id", input.jobId)
        .maybeSingle()
    : { data: null as { id?: string } | null };
  const { data: jobD } = input.jobId
    ? await supabase
        .from("jobs")
        .select("title, organisations!jobs_organisation_id_fkey ( name )")
        .eq("id", input.jobId)
        .maybeSingle()
    : {
        data: null as {
          title?: string;
          organisations?: { name?: string } | { name?: string }[] | null;
        } | null,
      };
  const orgR = (jobD as { organisations?: { name?: string } | { name?: string }[] | null } | null)
    ?.organisations;
  const org = Array.isArray(orgR) ? orgR[0] : orgR;
  const companyName = (org as { name?: string } | null | undefined)?.name ?? "the company";
  const jobTitle = (jobD as { title?: string } | null)?.title ?? "the role";
  const applicationId = ((appRow as { id?: string } | null)?.id as string | undefined) ?? null;
  const templateVariant = applicationId
    ? "direct_apply_received"
    : "direct_apply_received_fallback";

  const plan = await buildCandidateAcknowledgementPlan({
    applicationId,
    candidateId,
    jobId: input.jobId ?? null,
    eventType: "cv_ingested",
    ingestionPath: "public_apply",
    candidateEmail: emailRaw,
    candidatePhone: phoneRaw,
    whatsappConsent: input.whatsappOptIn,
    templateVariant,
  });

  if (!plan.enabled) {
    await sendPostApplyCandidatePortalNudge(
      supabase,
      { phone: input.phone, jobId: input.jobId, whatsappOptIn: input.whatsappOptIn },
      candidateId,
      candidateName,
    );
    return;
  }

  const cName = candidateName?.trim() || "Candidate";
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io").replace(/\/$/, "");

  for (const channelPlan of plan.channels) {
    if (!channelPlan.shouldAttempt) {
      await logCvIngestedAttempt({
        applicationId,
        candidateId,
        jobId: input.jobId ?? null,
        channel: channelPlan.channel,
        templateVariant,
        outcome: mapSuppressionOutcome(channelPlan.suppressionReasonCode),
        reasonCode: channelPlan.suppressionReasonCode ?? null,
        provider: channelPlan.channel === "email" ? "resend" : "meta_whatsapp",
      });
      continue;
    }

    if (channelPlan.channel === "email") {
      const duplicate = await hasSentAttemptWithinWindow({
        supabase,
        applicationId,
        candidateId,
        eventType: "cv_ingested",
        channel: "email",
        templateVariant,
      });
      if (duplicate) {
        await logCvIngestedAttempt({
          applicationId,
          candidateId,
          jobId: input.jobId ?? null,
          channel: "email",
          templateVariant,
          outcome: "suppressed_duplicate",
          reasonCode: "duplicate",
          reasonDetail: "Suppressed duplicate acknowledgement attempt within 24h window.",
          provider: "resend",
          keySuffix: "duplicate",
        });
        continue;
      }
      if (!emailRaw) {
        await logCvIngestedAttempt({
          applicationId,
          candidateId,
          jobId: input.jobId ?? null,
          channel: "email",
          templateVariant,
          outcome: "suppressed_no_channel",
          reasonCode: "no_channel",
          provider: "resend",
        });
        continue;
      }
      try {
        const result = await sendApplicationConfirmation({
          candidateEmail: emailRaw,
          candidateName: cName,
          jobTitle,
          companyName,
        });
        if (result.skipped) {
          await logCvIngestedAttempt({
            applicationId,
            candidateId,
            jobId: input.jobId ?? null,
            channel: "email",
            templateVariant,
            outcome:
              result.reason === "email_preference_disabled"
                ? "suppressed_no_consent"
                : "suppressed_policy",
            reasonCode: result.reason,
            provider: "resend",
          });
        } else {
          await logCvIngestedAttempt({
            applicationId,
            candidateId,
            jobId: input.jobId ?? null,
            channel: "email",
            templateVariant,
            outcome: "sent",
            provider: "resend",
            providerMessageId: (result.data.data as { id?: string } | null | undefined)?.id ?? null,
          });
        }
      } catch (err) {
        await logCvIngestedAttempt({
          applicationId,
          candidateId,
          jobId: input.jobId ?? null,
          channel: "email",
          templateVariant,
          outcome: "failed_provider",
          reasonCode: "provider_error",
          reasonDetail: err instanceof Error ? err.message : String(err),
          provider: "resend",
        });
      }
      continue;
    }

    const duplicate = await hasSentAttemptWithinWindow({
      supabase,
      applicationId,
      candidateId,
      eventType: "cv_ingested",
      channel: "whatsapp",
      templateVariant,
    });
    if (duplicate) {
      await logCvIngestedAttempt({
        applicationId,
        candidateId,
        jobId: input.jobId ?? null,
        channel: "whatsapp",
        templateVariant,
        outcome: "suppressed_duplicate",
        reasonCode: "duplicate",
        reasonDetail: "Suppressed duplicate acknowledgement attempt within 24h window.",
        provider: "meta_whatsapp",
        keySuffix: "duplicate",
      });
      continue;
    }

    if (!phoneRaw) {
      await logCvIngestedAttempt({
        applicationId,
        candidateId,
        jobId: input.jobId ?? null,
        channel: "whatsapp",
        templateVariant,
        outcome: "suppressed_no_channel",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
      continue;
    }

    try {
      if (applicationId && input.jobId) {
        const wa = await sendApplicationReceivedTemplate({
          phone: phoneRaw,
          candidateName: cName,
          jobTitle,
          companyName,
          applicationId,
        });
        if (!wa.success) {
          await logCvIngestedAttempt({
            applicationId,
            candidateId,
            jobId: input.jobId ?? null,
            channel: "whatsapp",
            templateVariant,
            outcome: "failed_provider",
            reasonCode: "provider_error",
            reasonDetail: wa.error ?? null,
            provider: "meta_whatsapp",
          });
        } else {
          await logCvIngestedAttempt({
            applicationId,
            candidateId,
            jobId: input.jobId ?? null,
            channel: "whatsapp",
            templateVariant,
            outcome: "sent",
            provider: "meta_whatsapp",
            providerMessageId: wa.messageId ?? null,
          });
        }
      } else {
        const msg = `Thanks for applying! Track your application and refer others to earn: ${base}/login`;
        const wa = await sendWhatsAppMessage(phoneRaw, msg);
        if (!wa.success) {
          await logCvIngestedAttempt({
            applicationId,
            candidateId,
            jobId: input.jobId ?? null,
            channel: "whatsapp",
            templateVariant,
            outcome: "failed_provider",
            reasonCode: "provider_error",
            reasonDetail: wa.error ?? null,
            provider: "meta_whatsapp",
          });
        } else {
          await logCvIngestedAttempt({
            applicationId,
            candidateId,
            jobId: input.jobId ?? null,
            channel: "whatsapp",
            templateVariant,
            outcome: "sent",
            provider: "meta_whatsapp",
            providerMessageId: wa.messageId ?? null,
          });
        }
      }
    } catch (err) {
      await logCvIngestedAttempt({
        applicationId,
        candidateId,
        jobId: input.jobId ?? null,
        channel: "whatsapp",
        templateVariant,
        outcome: "failed_provider",
        reasonCode: "provider_error",
        reasonDetail: err instanceof Error ? err.message : String(err),
        provider: "meta_whatsapp",
      });
    }
  }
}

/**
 * Upload + process a candidate CV.
 *
 * Phase 1 (always completes): Upload CV to storage, save candidate record.
 * Phase 2 (best-effort inline): Extract text, parse with AI, score.
 *
 * If Phase 2 fails or times out, the candidate is saved with processing_status
 * "pending" and cv_url pointing to the stored file. The reprocess endpoint can
 * retry from storage — no re-upload needed.
 */
export async function processPublicApplication(
  input: PublicApplyInput,
): Promise<PublicApplyResult> {
  // This entry point is public. A submitted source label must never enable internal intake.
  input = { ...input, requirePublicJob: true };
  const start = Date.now();
  const supabase = createSupabaseAdmin();
  const referralResolution = await resolveReferralToken(supabase, input.organisationId, input.ref);

  if (input.jobId) {
    const { data: j } = await supabase
      .from("jobs")
      .select("id, organisation_id, status")
      .eq("id", input.jobId)
      .eq("list_on_public_job_board", true)
      .eq("is_active", true)
      .maybeSingle();
    if (!j || (j as { organisation_id: string }).organisation_id !== input.organisationId) {
      throw new ApplicationApplyError(
        "That role is not available for this company.",
        "public_apply_invalid_target",
      );
    }
    if (String((j as { status?: string }).status ?? "") !== "open") {
      throw new ApplicationApplyError(
        "This job is no longer accepting applications.",
        "public_apply_invalid_target",
      );
    }
    const qRows = await fetchActiveScreeningQuestions(supabase, input.jobId);
    if (qRows.length > 0) {
      const ev = evaluateScreeningAnswers(qRows, input.screeningAnswers);
      if (!ev.ok) {
        // Knockouts fire BEFORE any row is written, so a rejected candidate left no
        // trace at all — the employer never learned they existed and the decision
        // could not be reviewed or appealed. Record it before throwing.
        if (ev.reason === "knockout") {
          // Supabase RESOLVES with {error} on a DB/RLS failure rather than
          // rejecting, so a .then(onRejected) handler can never observe it.
          const { error: knockoutErr } = await supabase.from("screening_knockout_events").insert({
            job_id: input.jobId,
            email: input.email ?? null,
            phone: input.phone ?? null,
            candidate_name: input.name ?? null,
            answers: input.screeningAnswers ?? null,
            source: input.source ?? "public_apply",
          });
          if (knockoutErr) {
            logger.warn("knockout_event_log_failed", {
              jobId: input.jobId,
              error: String(knockoutErr.message),
            });
          } else {
            logger.info("screening_knockout_rejected", { jobId: input.jobId });
          }
        }
        throw new ApplicationApplyError(
          ev.message,
          ev.reason === "incomplete" ? "screening_incomplete" : "screening_not_passed",
        );
      }
    }
  }

  const { candidateId, candidateName, cvUrl, wasExistingCandidate } = await savePublicApplication({
    ...input,
    referralResolution,
  });

  logger.info("PublicApply: starting AI processing", {
    candidateId,
    fileName: input.fileName,
    durationMs: Date.now() - start,
  });

  // Phase 2: Try text extraction + AI parsing + scoring (best-effort)
  try {
    const result = await processCandidate(supabase, candidateId, input, cvUrl, start);

    if (referralResolution) {
      const vouchName = candidateName?.trim() || "Candidate";

      void (async () => {
        try {
          if (!referralResolution.referrerWhatsappVerified) return;
          const phone = referralResolution.referrerWhatsappNumber?.trim();
          if (!phone) return;
          await startVouchFlow(phone, candidateId, vouchName);
        } catch (err) {
          logger.warn("PublicApply: vouch trigger for direct referrer failed", {
            candidateId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();

      void (async () => {
        try {
          const parentId = referralResolution.parentReferrerId;
          if (!parentId) return;
          const { data: parent, error: parentErr } = await supabase
            .from("referrers")
            .select("whatsapp_number, whatsapp_verified")
            .eq("id", parentId)
            .maybeSingle();
          if (parentErr || !parent) return;
          if (!parent.whatsapp_verified) return;
          const parentPhone = (parent.whatsapp_number as string | null | undefined)?.trim();
          if (!parentPhone) return;
          await startVouchFlow(parentPhone, candidateId, vouchName);
        } catch (err) {
          logger.warn("PublicApply: vouch trigger for parent referrer failed", {
            candidateId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }

    if (!input.skipCandidateAcknowledgement) {
      void notifyCvIngestedFromPublicApply(
        supabase,
        {
          phone: input.phone,
          email: input.email,
          jobId: input.jobId,
          whatsappOptIn: input.whatsappOptIn,
        },
        candidateId,
        candidateName,
      );
    }

    const hasFitScores = result.jobsWithFitScoresTotal > 0 || result.topScore != null;
    const pendingJdFlag =
      result.jobsDeferredPendingJdApproval > 0
        ? ({ fitScoresIncompleteDueToPendingJd: true as const } as const)
        : {};

    if (hasFitScores) {
      return {
        candidateId,
        candidateName,
        wasExistingCandidate,
        jobsScored: result.jobsWithFitScoresTotal,
        topScore: result.topScore,
        ...pendingJdFlag,
      };
    }

    if (!result.parseCompleted && result.parseFailedPermanently) {
      // A retry would produce the identical rejection and bill the parse again.
      logger.warn("public_apply_parse_failed_permanently", { candidateId, jobId: input.jobId });
      return {
        candidateId,
        candidateName,
        wasExistingCandidate,
        jobsScored: 0,
        topScore: null,
        parsingPending: false,
        scoringFailed: true,
      };
    }

    if (!result.parseCompleted) {
      // Phase 2 swallowed a parse failure inside processCandidate (the row is
      // still pending). Enqueue the same Inngest retry so this orphan path
      // also recovers without manual reprocess.
      void (async () => {
        try {
          const { enqueue } = await import("@/lib/jobs/queue");
          await enqueue("cv-parse-retry", {
            candidateId,
            jobId: input.jobId ?? null,
            organisationId: input.organisationId,
            source: "phase2_parse_failed",
          });
        } catch (enqueueErr) {
          logger.warn("PublicApply: cv-parse-retry enqueue failed", {
            candidateId,
            error: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
          });
        }
      })();
      return {
        candidateId,
        candidateName,
        wasExistingCandidate,
        jobsScored: 0,
        topScore: null,
        parsingPending: true,
      };
    }

    if (!result.hadTargetJobs) {
      return {
        candidateId,
        candidateName,
        wasExistingCandidate,
        jobsScored: 0,
        topScore: null,
        parsingPending: false,
        noOpenJobs: true,
      };
    }

    return {
      candidateId,
      candidateName,
      wasExistingCandidate,
      jobsScored: 0,
      topScore: null,
      parsingPending: false,
      scoringFailed: true,
      ...pendingJdFlag,
    };
  } catch (err) {
    logger.warn("PublicApply: AI processing failed (candidate already saved)", {
      candidateId,
      fileName: input.fileName,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    });

    // Phase 2 failed inline (Claude 5xx, budget gate, network, etc.). Push a
    // background retry through Inngest so the candidate doesn't stay stuck as a
    // "ghost" application — pipeline_candidates/applications already exist but
    // skills/cv_parsed_at would never land without this. Fire-and-forget; the
    // Inngest function itself is idempotent on cv_parsed_at.
    void (async () => {
      try {
        const { enqueue } = await import("@/lib/jobs/queue");
        await enqueue("cv-parse-retry", {
          candidateId,
          jobId: input.jobId ?? null,
          organisationId: input.organisationId,
          source: "phase2_failed",
        });
      } catch (enqueueErr) {
        logger.warn("PublicApply: cv-parse-retry enqueue failed", {
          candidateId,
          error: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
        });
      }
    })();

    return {
      candidateId,
      candidateName,
      wasExistingCandidate,
      jobsScored: 0,
      topScore: null,
      parsingPending: true,
    };
  }
}
