export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { toBrowserFacingStorageUrl } from "@/lib/supabase/storage-public-url";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { claimUnclaimedCandidateByEmail } from "@/lib/agents/candidate-dedup";
import { enqueue } from "@/lib/jobs/queue";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { z } from "zod";

const MAX_FILE_SIZE = MAX_STANDARD_UPLOAD_BYTES;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
];
const MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
} as const;
type SupportedResumeExtension = keyof typeof MIME_BY_EXTENSION;
const fileLikeSchema = z.custom<File>(
  (value) =>
    Boolean(
      value &&
      typeof value === "object" &&
      "type" in value &&
      "size" in value &&
      "arrayBuffer" in value,
    ),
  { message: "Invalid file payload" },
);
const uploadResumeBodySchema = z
  .object({
    resume: fileLikeSchema.optional(),
    file: fileLikeSchema.optional(),
  })
  .strict()
  .refine((data) => Boolean(data.resume || data.file), {
    message: "No file provided",
  });
const RESUME_VERSION_SELECT_COLUMNS = `
  id, candidate_id, file_url, file_name, file_size, storage_path, is_default, label, uploaded_by, created_at
`;

function normalizeResumeExtension(fileName: string): SupportedResumeExtension | null {
  const ext = fileName.split(".").pop()?.trim().toLowerCase();
  if (!ext) return null;
  return ext in MIME_BY_EXTENSION ? (ext as SupportedResumeExtension) : null;
}

function startsWithBytes(bytes: Uint8Array, expected: number[]): boolean {
  if (bytes.length < expected.length) return false;
  return expected.every((v, i) => bytes[i] === v);
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (!sample.length) return true;
  let printable = 0;
  for (const b of sample) {
    const isWhitespace = b === 9 || b === 10 || b === 13;
    const isPrintableAscii = b >= 32 && b <= 126;
    if (isWhitespace || isPrintableAscii) printable++;
  }
  return printable / sample.length >= 0.9;
}

function sniffResumeMime(bytes: Uint8Array): (typeof ALLOWED_TYPES)[number] | null {
  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return "application/msword"; // OLE2 DOC
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const zippedSample = new TextDecoder("latin1")
      .decode(bytes.subarray(0, Math.min(bytes.length, 8192)))
      .toLowerCase();
    if (zippedSample.includes("word/") || zippedSample.includes("[content_types].xml")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return null;
  }
  if (looksLikeText(bytes)) return "text/plain";
  return null;
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "candidate_pro", "candidate_free", "super_admin")) {
      return jsonError("Forbidden", 403);
    }

    // Rate limit check: fail closed if check throws (e.g., DB unavailable)
    let rl;
    try {
      rl = await checkRateLimit({
        key: buildScopedRateLimitKey({
          route: "upload-resume",
          organisationId: ctx.organisationId,
          userId: ctx.userId,
        }),
        limit: 10,
        windowSecs: 60,
      });
    } catch (rateLimitError) {
      logger.error("Rate limit check failed, rejecting request", {
        error: String(rateLimitError),
        userId: ctx.userId,
      });
      return jsonError("Rate limit check unavailable. Please try again later.", 503);
    }
    if (!rl.allowed) return jsonError("CV upload rate limit exceeded. Please wait.", 429);

    const formData = await request.formData();
    const fileParsed = uploadResumeBodySchema.safeParse({
      // formData.get returns null for an absent field; the schema's optional()
      // accepts undefined but not null, so coalesce or a one-field upload
      // (only "resume" OR only "file") always fails validation.
      resume: formData.get("resume") ?? undefined,
      file: formData.get("file") ?? undefined,
    });
    if (!fileParsed.success) return jsonError("No file provided (send 'resume' or 'file')", 400);
    const file = fileParsed.data.resume ?? fileParsed.data.file;
    if (!file) return jsonError("No file provided (send 'resume' or 'file')", 400);

    if (file.size > MAX_FILE_SIZE) {
      return jsonError("File too large. Maximum 10MB", 400);
    }
    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);
    const extension = normalizeResumeExtension(file.name || "");
    if (!extension) return jsonError("Invalid file extension. Accepted: PDF, DOCX, DOC, TXT", 400);

    const expectedMime = MIME_BY_EXTENSION[extension];
    const sniffedMime = sniffResumeMime(fileBytes);
    if (!sniffedMime || sniffedMime !== expectedMime) {
      return jsonError(
        "File content does not match its extension. Please upload a valid PDF, DOCX, DOC, or TXT file.",
        400,
      );
    }
    if (file.type && ALLOWED_TYPES.includes(file.type) && file.type !== expectedMime) {
      return jsonError("Uploaded file type mismatch. Please re-export and try again.", 400);
    }

    const supabase = await createSupabaseServerClient();
    // Privileged client for the storage write + signed URL. Storage RLS on the
    // resumes bucket keys on a {candidate_id}/ path that the user-scoped client
    // can't satisfy (and one policy is mis-written against candidates.name), so
    // the upload goes through admin. The caller is already authorized above and
    // the path is derived from their own candidate record, so this is safe.
    const admin = createSupabaseAdmin();

    // Find or create candidate record for this user
    let candidateId: string;
    const existing = await supabase
      .from("candidates")
      .select("id")
      .eq("user_id", ctx.userId)
      .single()
      .then((r) => r.data);

    if (existing) {
      candidateId = existing.id;
    } else {
      // Link WhatsApp-originated (or other) unclaimed candidate by email if same person
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const claimedId = await claimUnclaimedCandidateByEmail(admin, ctx.userId, authUser?.email);
      if (claimedId) {
        candidateId = claimedId;
      } else {
        // Use admin client: RLS on candidates does not allow INSERT for authenticated users
        const { data: newCandidate, error: createError } = await admin
          .from("candidates")
          .insert({
            user_id: ctx.userId,
            visibility: true,
          })
          .select("id")
          .single();

        if (createError || !newCandidate) {
          logger.error("Create candidate failed", {
            error: String(createError),
          });
          const body: { error: string; detail?: string } = {
            error: "Failed to create candidate profile",
          };
          if (process.env.NODE_ENV === "development") {
            body.detail = String(createError);
          }
          return NextResponse.json(body, { status: 500 });
        }
        candidateId = newCandidate.id;
      }
    }

    // Upload to Supabase Storage — path = {candidate_id}/{ts}.{ext} for RLS (first segment = candidate_id)
    const ext = extension;
    const storagePath = `${candidateId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from("resumes")
      .upload(storagePath, fileBuffer, {
        contentType: expectedMime,
        upsert: true,
      });

    if (uploadError) {
      logger.error("Upload resume storage failed", {
        error: String(uploadError),
      });
      const body: { error: string; detail?: string } = {
        error: "Failed to upload file",
      };
      if (process.env.NODE_ENV === "development") {
        body.detail = String(uploadError);
      }
      return NextResponse.json(body, { status: 500 });
    }

    const fileName = file.name || `resume.${ext}`;

    const { data: urlData } = supabase.storage.from("resumes").getPublicUrl(storagePath);

    // Insert with is_default: false first, then atomically switch via RPC
    // (avoids race condition: two concurrent uploads cannot both win the unique partial index)
    const { data: version, error: versionError } = await supabase
      .from("resume_versions")
      .insert({
        candidate_id: candidateId,
        file_url: urlData.publicUrl,
        file_name: fileName,
        file_size: file.size,
        storage_path: storagePath,
        is_default: false,
        uploaded_by: ctx.userId,
      })
      .select(RESUME_VERSION_SELECT_COLUMNS)
      .single();

    if (versionError) {
      logger.error("Resume version insert failed", {
        error: String(versionError),
      });
      const body: { error: string; detail?: string } = {
        error: "Failed to save resume version",
      };
      if (process.env.NODE_ENV === "development") {
        body.detail = String(versionError);
      }
      return NextResponse.json(body, { status: 500 });
    }

    // Atomically promote the new version to default (clears previous default in one transaction)
    await admin.rpc("switch_default_resume", {
      p_candidate_id: candidateId,
      p_version_id: version.id,
    });

    // Signed URL for private bucket (1h)
    const { data: signed } = await admin.storage.from("resumes").createSignedUrl(storagePath, 3600);

    const viewUrl = toBrowserFacingStorageUrl(signed?.signedUrl ?? null);

    // Update candidate resume_url for backward compat (prefer signed URL when available).
    // Clear cv_parsed_at: a NEW résumé must be re-parsed. The resume-parse worker is
    // idempotent on cv_parsed_at (to avoid double-parsing during onboarding), so leaving
    // a stale timestamp here would make it skip the new file and keep the old profile.
    const { error: updateError } = await admin
      .from("candidates")
      .update({
        resume_url: viewUrl ?? undefined,
        cv_parsed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    if (updateError) {
      logger.error("Upload resume: candidate resume_url update failed", {
        candidateId,
        error: updateError.message,
        code: updateError.code,
      });
      // Non-fatal: resume is uploaded, just the URL shortcut failed
    }

    // Fire-and-forget: enqueue AI parsing as a background job
    enqueue(
      "resume-parse",
      {
        candidateId,
        resumeUrl: urlData.publicUrl,
        fileName,
        storagePath,
      },
      { id: `resume-parse:${storagePath}` },
    ).catch((err) => {
      logger.error("[upload-resume] Failed to enqueue resume-parse job", {
        candidateId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return jsonSuccess(
      {
        version,
        candidateId,
        viewUrl,
        resumeUrl: viewUrl,
        message: "Resume uploaded successfully",
        parsing: "pending" as const,
      },
      201,
    );
  } catch (err) {
    return handleApiError(err, "Failed to upload resume", {
      route: "POST /api/candidates/upload-resume",
    });
  }
}
