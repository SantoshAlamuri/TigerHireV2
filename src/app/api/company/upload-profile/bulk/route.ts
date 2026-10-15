/** Large batches use parallel saves; allow enough wall time for storage + DB. */
export const maxDuration = 300;

import pLimit from "p-limit";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { savePublicApplication } from "@/lib/agents/public-apply";
import { startCanonicalScreeningCollectionBestEffort } from "@/lib/whatsapp/screening-qa-flow";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { reportError } from "@/lib/observability/report-error";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { withIdempotency } from "@/lib/security/idempotency";
import { toUserFacingUploadError } from "@/lib/agency-upload-errors";
import { inferMimeFromName } from "@/lib/services/extract-document-text";
import { cacheDel } from "@/lib/redis/cache";
import { myPipelineKey } from "@/lib/redis/keys";
import { normalizeEmailForCandidate } from "@/lib/agents/candidate-dedup";
import {
  AGENCY_BULK_SAVE_CONCURRENCY,
  AGENCY_UPLOAD_CLIENT_BATCH_SIZE,
} from "@/lib/constants/agency-bulk-upload";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { enqueueCompanyCandidateScoring } from "@/lib/agency/enqueue-candidate-scoring";
import { z } from "zod";

const MAX_FILE_SIZE = MAX_STANDARD_UPLOAD_BYTES;
const MAX_FILES_PER_BULK = AGENCY_UPLOAD_CLIENT_BATCH_SIZE;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const COMPANY_UPLOAD_BULK_ENDPOINT = "POST /api/company/upload-profile/bulk";
const companyBulkUploadPayloadSchema = z
  .object({
    jobId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
  })
  .strict();

export interface CompanyBulkUploadResultItem {
  fileName: string;
  success: boolean;
  candidateId?: string;
  candidateName?: string | null;
  jobsScored?: number;
  topScore?: number | null;
  /** True when profile was saved but parsing/scoring has not run yet. */
  parsingPending?: boolean;
  error?: string;
}

/**
 * POST /api/company/upload-profile/bulk
 *
 * A company recruiter uploads multiple candidate resumes for one of their own
 * org's open jobs (used while job-board integrations aren't all live). Profiles
 * and CVs are saved immediately; CV parsing + FitScore are enqueued to Inngest
 * when enqueueScoring=true (default for auto-score UI). Falls back to the
 * client's sync POST /api/company/reprocess-candidates when Inngest is unset.
 *
 * Mirrors POST /api/agency/upload-profile/bulk but scopes to the caller's own
 * organisation (no agency_clients link).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  return withIdempotency(request, COMPANY_UPLOAD_BULK_ENDPOINT, async () => {
    try {
      const ctx = await getAuthContext();
      if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
      if (!hasRole(ctx, "super_admin", "leadership", "recruiter"))
        return jsonError("Forbidden", 403);
      if (!ctx.organisationId)
        return jsonError("No organisation associated with your account", 400);

      let rlAllowed = false;
      try {
        const rl = await checkRateLimit({
          key: buildScopedRateLimitKey({
            route: "company-upload-bulk",
            organisationId: ctx.organisationId,
            userId: ctx.userId,
          }),
          limit: 20,
          windowSecs: 60,
        });
        rlAllowed = rl.allowed;
      } catch (err) {
        reportError(err, {
          route: COMPANY_UPLOAD_BULK_ENDPOINT,
          userId: ctx.userId,
        });
        return jsonError("Rate limit check unavailable. Please try again later.", 503);
      }
      if (!rlAllowed)
        return jsonError("Too many bulk uploads. Please wait a moment before trying again.", 429);

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch (err) {
        reportError(err, { route: COMPANY_UPLOAD_BULK_ENDPOINT });
        return jsonError(
          "Upload payload could not be read. Try fewer or smaller files per batch (each file max 10 MB). If this persists after restarting the dev server, contact support.",
          413,
        );
      }
      const payloadParsed = companyBulkUploadPayloadSchema.safeParse({
        jobId: (formData.get("jobId") as string | null) ?? undefined,
        name: (formData.get("name") as string | null) ?? undefined,
        phone: (formData.get("phone") as string | null) ?? undefined,
        email: (formData.get("email") as string | null) ?? undefined,
      });
      if (!payloadParsed.success) return jsonError("Invalid request body", 422);
      const { jobId, name, phone, email } = payloadParsed.data;

      const effectiveJobId = jobId?.trim() ?? "";
      if (!effectiveJobId) {
        return jsonError(
          "Choose a target role before uploading. Each batch must be tied to one open job.",
          400,
        );
      }

      // Collect all files: FormData can have multiple entries with key "files" or "file"
      const files: File[] = [];
      const fileEntries = formData.getAll("files");
      for (const entry of fileEntries) {
        if (entry instanceof File && entry.size > 0) files.push(entry);
      }
      if (files.length === 0) {
        const single = formData.get("file") as File | null;
        if (single && single.size > 0) files.push(single);
      }
      if (files.length === 0) return jsonError("At least one CV file is required", 400);
      if (files.length > MAX_FILES_PER_BULK)
        return jsonError(
          `Maximum ${MAX_FILES_PER_BULK} files per bulk upload. You selected ${files.length}.`,
          400,
        );

      const emailNorm = normalizeEmailForCandidate(email);

      if (files.length === 1 && !emailNorm) {
        return jsonError(
          "Email is required when uploading a single file so we can match returning candidates and avoid duplicate profiles.",
          422,
        );
      }

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          return jsonError(
            `File "${file.name}" is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB per file. Please compress or use a smaller file.`,
            400,
          );
        }
        const effectiveType =
          (file.type && file.type.trim()) || inferMimeFromName(file.name || "") || "";
        if (!effectiveType || !ALLOWED_TYPES.includes(effectiveType)) {
          return jsonError(
            `File "${file.name}" has invalid type. Use PDF or Word (.pdf, .doc, .docx).`,
            400,
          );
        }
      }

      const supabase = await createSupabaseServerClient();

      // The target job must belong to the caller's own org and be open.
      const { data: jobVerify } = await supabase
        .from("jobs")
        .select("id")
        .eq("id", effectiveJobId)
        .eq("organisation_id", ctx.organisationId)
        .eq("status", "open")
        .maybeSingle();
      if (!jobVerify) {
        return jsonError(
          "That role is not available for your organisation or is no longer open.",
          400,
        );
      }

      const targetOrgId = ctx.organisationId;
      const limit = pLimit(AGENCY_BULK_SAVE_CONCURRENCY);
      const isSingleFilePayload = files.length === 1;

      const indexedOutcomes = await Promise.all(
        files.map((file, orderIndex) =>
          limit(
            async (): Promise<{
              orderIndex: number;
              item: CompanyBulkUploadResultItem;
            }> => {
              try {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                if (!buffer.length) {
                  return {
                    orderIndex,
                    item: {
                      fileName: file.name,
                      success: false,
                      error: "File is empty. Choose a valid PDF or Word document.",
                    },
                  };
                }
                const contentType =
                  (file.type && file.type.trim()) ||
                  inferMimeFromName(file.name || "") ||
                  undefined;
                const result = await savePublicApplication({
                  fileBuffer: buffer,
                  fileName: file.name,
                  contentType,
                  organisationId: targetOrgId,
                  jobId: effectiveJobId,
                  ...(isSingleFilePayload
                    ? {
                        name,
                        phone,
                        email: emailNorm ?? undefined,
                      }
                    : {}),
                  source: "recruiter_upload",
                });

                return {
                  orderIndex,
                  item: {
                    fileName: file.name,
                    success: true,
                    candidateId: result.candidateId,
                    candidateName: result.candidateName,
                    jobsScored: 0,
                    topScore: null,
                    parsingPending: true,
                  },
                };
              } catch (err) {
                const message = err instanceof Error ? err.message : "Processing failed";
                return {
                  orderIndex,
                  item: {
                    fileName: file.name,
                    success: false,
                    error: toUserFacingUploadError(message),
                  },
                };
              }
            },
          ),
        ),
      );

      indexedOutcomes.sort((a, b) => a.orderIndex - b.orderIndex);
      const results: CompanyBulkUploadResultItem[] = indexedOutcomes.map((o) => o.item);

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      const pending = results.filter((r) => r.success && r.parsingPending).length;

      // Ask each uploaded candidate the recruiter's screening questions over WhatsApp
      // (no-op when the job has none, or the answers are already on file). Scoring stays
      // held by the always-on canonical gate until they answer — uploads are not exempt.
      const uploadedCandidateIds = results
        .filter((r) => r.success && r.candidateId)
        .map((r) => r.candidateId!);
      if (uploadedCandidateIds.length > 0) {
        for (const candidateId of uploadedCandidateIds) {
          await startCanonicalScreeningCollectionBestEffort({
            jobId: effectiveJobId,
            candidateId,
            organisationId: targetOrgId,
            source: "company_bulk_upload",
          });
        }
      }

      const enqueueScoring = formData.get("enqueueScoring") !== "false";
      const pendingCandidateIds = results
        .filter(
          (r) => r.success && r.candidateId && (r.parsingPending === undefined || r.parsingPending),
        )
        .map((r) => r.candidateId!);

      let scoringQueued = 0;
      if (enqueueScoring && pendingCandidateIds.length > 0) {
        const enqueueResult = await enqueueCompanyCandidateScoring(pendingCandidateIds, {
          organisationId: ctx.organisationId,
          userId: ctx.userId,
        });
        scoringQueued = enqueueResult.queued;
      }

      if (succeeded > 0) {
        await cacheDel(myPipelineKey(ctx.userId));
      }

      return jsonSuccess(
        {
          results,
          summary: {
            total: results.length,
            succeeded,
            failed,
            pending,
            scoringQueued,
          },
        },
        201,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // —— Handle 413/504 from Vercel/infrastructure
      if (
        message.includes("413") ||
        message.includes("Payload Too Large") ||
        message.includes("request entity too large")
      ) {
        return jsonError(
          `Total upload size too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024} MB per file. Please compress files or upload fewer files at once.`,
          413,
        );
      }
      if (
        message.includes("504") ||
        message.includes("Gateway Timeout") ||
        message.includes("timeout") ||
        message.includes("Function execution exceeded")
      ) {
        return jsonError(
          "Upload timed out. Files may be too large or processing took too long. Try smaller files or upload fewer at once.",
          504,
        );
      }

      return handleApiError(err, "Failed to bulk upload profiles", {
        route: COMPANY_UPLOAD_BULK_ENDPOINT,
      });
    }
  });
}
