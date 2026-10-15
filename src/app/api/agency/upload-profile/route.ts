/** CV parse + FitScore can exceed 60s on large resumes; align with reprocess route headroom. */
export const maxDuration = 300;

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrganisationRepository } from "@/lib/repositories/OrganisationRepository";
import { savePublicApplication } from "@/lib/agents/public-apply";
import { enqueueAgencyCandidateScoring } from "@/lib/agency/enqueue-candidate-scoring";
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
import { inferMimeFromName } from "@/lib/services/extract-document-text";
import { cacheDel } from "@/lib/redis/cache";
import { myPipelineKey } from "@/lib/redis/keys";
import { normalizeEmailForCandidate } from "@/lib/agents/candidate-dedup";
import { ApplicationApplyError } from "@/lib/applications/application-apply-error";
import { logger } from "@/lib/observability/logger";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { z } from "zod";

const MAX_FILE_SIZE = MAX_STANDARD_UPLOAD_BYTES;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const AGENCY_UPLOAD_ENDPOINT = "POST /api/agency/upload-profile";
const agencyUploadFileSchema = z.custom<File>(
  (value) =>
    Boolean(
      value &&
      typeof value === "object" &&
      "name" in value &&
      "type" in value &&
      "size" in value &&
      "arrayBuffer" in value,
    ),
  { message: "Invalid file payload" },
);
const agencyUploadPayloadSchema = z
  .object({
    file: agencyUploadFileSchema,
    clientOrgId: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
    jobId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
  })
  .strict();

function getEffectiveFileType(file: { type: string; name: string }): string {
  return (file.type && file.type.trim()) || inferMimeFromName(file.name || "") || "";
}

/**
 * POST /api/agency/upload-profile
 * Agency uploads a candidate resume for a client. Creates/updates candidate and scores against client's jobs.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  return withIdempotency(request, AGENCY_UPLOAD_ENDPOINT, async () => {
    try {
      const ctx = await getAuthContext();
      if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
      if (!hasRole(ctx, "agency")) return jsonError("Forbidden", 403);
      if (!ctx.organisationId)
        return jsonError("No organisation associated with your account", 400);

      let rlAllowed = false;
      try {
        const rl = await checkRateLimit({
          key: buildScopedRateLimitKey({
            route: "agency-upload",
            organisationId: ctx.organisationId,
            userId: ctx.userId,
          }),
          limit: 30,
          windowSecs: 60,
        });
        rlAllowed = rl.allowed;
      } catch (err) {
        reportError(err, {
          route: "POST /api/agency/upload-profile",
          userId: ctx.userId,
        });
        return jsonError("Rate limit check unavailable. Please try again later.", 503);
      }
      if (!rlAllowed) return jsonError("Too many uploads. Please wait a moment.", 429);

      const formData = await request.formData();
      const payloadParsed = agencyUploadPayloadSchema.safeParse({
        file: formData.get("file"),
        clientOrgId: (formData.get("clientOrgId") as string | null) ?? undefined,
        slug: (formData.get("slug") as string | null) ?? undefined,
        jobId: (formData.get("jobId") as string | null) ?? undefined,
        name: (formData.get("name") as string | null) ?? undefined,
        phone: (formData.get("phone") as string | null) ?? undefined,
        email: (formData.get("email") as string | null) ?? undefined,
      });
      if (!payloadParsed.success) {
        return jsonError("CV file is required", 400);
      }
      const { file, clientOrgId, slug, jobId, name, phone, email } = payloadParsed.data;

      if (!normalizeEmailForCandidate(email)) {
        return jsonError(
          "Email is required so we can match returning candidates and avoid duplicate profiles.",
          422,
        );
      }
      if (!clientOrgId && !slug) return jsonError("clientOrgId or slug is required", 400);
      if (!jobId?.trim()) {
        return jsonError(
          "Choose a target role before uploading. Each upload must be tied to one open job.",
          400,
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return jsonError(
          `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB. Please compress or use a smaller file.`,
          400,
        );
      }
      const effectiveType = getEffectiveFileType({
        type: file.type || "",
        name: file.name || "",
      });
      if (!effectiveType || !ALLOWED_TYPES.includes(effectiveType)) {
        return jsonError("Invalid file type. Use PDF or Word (.pdf, .doc, .docx).", 400);
      }

      const supabase = await createSupabaseServerClient();
      let targetOrgId: string;

      if (clientOrgId) {
        const { data: link } = await supabase
          .from("agency_clients")
          .select("client_organisation_id")
          .eq("agency_organisation_id", ctx.organisationId)
          .eq("client_organisation_id", clientOrgId)
          .single();
        if (!link) return jsonError("Client not found or not linked to your agency", 404);
        targetOrgId = link.client_organisation_id;
        const targetOrg = await OrganisationRepository.getById(supabase, targetOrgId).catch(
          () => null,
        );
      } else if (slug) {
        const org = await OrganisationRepository.getBySlug(supabase, slug);
        if (!org) return jsonError("Company not found with that slug", 404);
        const { data: link } = await supabase
          .from("agency_clients")
          .select("client_organisation_id")
          .eq("agency_organisation_id", ctx.organisationId)
          .eq("client_organisation_id", org.id)
          .single();
        if (!link) return jsonError("This company is not added as your client", 403);
        targetOrgId = org.id;
      } else {
        return jsonError("clientOrgId or slug is required", 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (!buffer.length) {
        return jsonError("File is empty. Choose a valid PDF or Word document.", 400);
      }

      const { data: jobVerify } = await supabase
        .from("jobs")
        .select("id")
        .eq("id", jobId)
        .eq("organisation_id", targetOrgId)
        .eq("status", "open")
        .maybeSingle();
      if (!jobVerify) {
        return jsonError("That role is not available for this client or is no longer open.", 400);
      }

      const result = await savePublicApplication({
        fileBuffer: buffer,
        fileName: file.name,
        contentType: effectiveType || undefined,
        organisationId: targetOrgId,
        jobId,
        name,
        phone,
        email,
        source: "agency_upload",
        skipCandidateAcknowledgement: true,
      });

      const enqueueScoring = formData.get("enqueueScoring") !== "false";
      let scoringQueued = 0;
      if (enqueueScoring) {
        // Ask the recruiter's screening questions over WhatsApp (no-op if the job has none,
        // or if the answers are already on file). Uploads are NOT exempt from the always-on
        // canonical gate: scoring stays held until the candidate answers, then runs.
        await startCanonicalScreeningCollectionBestEffort({
          jobId,
          candidateId: result.candidateId,
          phone: phone ?? null,
          organisationId: targetOrgId,
          source: "agency_upload",
        });
        const enqueueResult = await enqueueAgencyCandidateScoring([result.candidateId], {
          organisationId: ctx.organisationId,
          userId: ctx.userId,
        });
        scoringQueued = enqueueResult.queued;
      }

      await cacheDel(myPipelineKey(ctx.userId));

      const message =
        scoringQueued > 0
          ? "Profile saved. Scoring runs in the background — you can close this window."
          : "Profile saved. Use Score pending on the pipeline when background scoring is available.";

      return jsonSuccess(
        {
          candidateId: result.candidateId,
          candidateName: result.candidateName,
          jobsScored: 0,
          topScore: null,
          parsingPending: true,
          scoringQueued,
          message,
        },
        201,
      );
    } catch (err) {
      if (err instanceof ApplicationApplyError && err.code === "public_apply_invalid_target") {
        return jsonError(err.message, 400);
      }
      const message = err instanceof Error ? err.message : String(err);

      // —— File & extraction errors (400) ——
      if (
        message.includes("Could not extract text") ||
        message.includes("Unsupported file type") ||
        message.includes("Failed to extract text from PDF") ||
        message.includes("Failed to extract text from Word")
      ) {
        return jsonError(
          "Could not read the file. Use a valid PDF or Word document with selectable text.",
          400,
        );
      }
      if (message.includes("PDF_PARSE_ERROR:")) {
        return jsonError(message.replace("PDF_PARSE_ERROR: ", "").trim(), 400);
      }
      if (message.includes("WORD_PARSE_ERROR:")) {
        return jsonError(message.replace("WORD_PARSE_ERROR: ", "").trim(), 400);
      }
      if (
        message.includes("PDF appears corrupted") ||
        message.includes("image-only") ||
        message.includes("password-protected")
      ) {
        return jsonError(
          "PDF could not be read (corrupted, image-only, or password-protected). Use a text-based PDF or re-save the file.",
          400,
        );
      }
      if (message.includes("Object.defineProperty") || message.includes("non-object")) {
        return jsonError(
          "File processing error: the file may be corrupted or in an unsupported format. Try a different PDF/Word file, re-save it, or use a smaller file.",
          400,
        );
      }
      if (message.includes("no JSON") || message.includes("CV parser")) {
        return jsonError(
          "Could not parse the CV content. Ensure the file has clear text (name, skills, experience) and try again.",
          400,
        );
      }

      // —— AI / config errors (503) ——
      if (
        message.includes("ANTHROPIC") ||
        message.includes("anthropic") ||
        message.includes("api_key") ||
        message.includes("401") ||
        message.includes("authentication") ||
        message.includes("invalid_api_key")
      ) {
        return jsonError(
          "CV parsing is not configured. Add a valid ANTHROPIC_API_KEY to .env.local.",
          503,
        );
      }
      if (
        message.includes("rate_limit") ||
        message.includes("overloaded") ||
        message.includes("529") ||
        message.includes("timeout")
      ) {
        return jsonError(
          "CV parsing service is busy or timed out. Please try again in a minute.",
          503,
        );
      }

      // —— Supabase / infra (503) ——
      if (
        message.includes("Supabase") ||
        message.includes("SUPABASE") ||
        message.includes("organisation_id") ||
        message.includes("env vars")
      ) {
        return jsonError(
          "Server configuration error. Check Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).",
          503,
        );
      }
      if (
        message.includes("Failed to save candidate") ||
        message.includes("Candidate record not found") ||
        message.includes("duplicate key") ||
        message.includes("foreign key")
      ) {
        return jsonError(
          "Database error while saving the profile. Please try again or contact support.",
          503,
        );
      }
      if (
        message.includes("storage") ||
        message.includes("bucket") ||
        message.includes("candidate-cvs")
      ) {
        return jsonError(
          "File storage is not configured. Ensure the candidate-cvs bucket exists in Supabase Storage.",
          503,
        );
      }

      // —— Handle 413/504 from Vercel/infrastructure
      if (
        message.includes("413") ||
        message.includes("Payload Too Large") ||
        message.includes("request entity too large")
      ) {
        return jsonError(
          `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB. Please compress the PDF or use a smaller file.`,
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
          "Upload timed out. The file may be too large or processing took too long. Try a smaller file or split into multiple uploads.",
          504,
        );
      }

      // —— Generic fallback: still return a helpful message and log the real error
      return handleApiError(err, "Upload failed. Please try a different file or try again later.", {
        route: "POST /api/agency/upload-profile",
      });
    }
  });
}
