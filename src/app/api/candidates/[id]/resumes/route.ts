import { NextRequest } from "next/server";
import { createCvStorageSignedUrl } from "@/lib/supabase/cv-signed-url";
import { resolveCvStorageObject } from "@/lib/supabase/resolve-cv-storage";
import { toBrowserFacingStorageUrl } from "@/lib/supabase/storage-public-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import {
  assertCanAccessCandidateResumes,
  ForbiddenError,
  NotFoundError,
} from "@/lib/security/candidate-resume-access";
import { validateOrigin } from "@/lib/security/csrf";
import { validateResumeFileUrl } from "@/lib/security/validate-storage-url";
import { logger } from "@/lib/observability/logger";
import { writeAccessAuditEvent } from "@/lib/security/access-audit";
import { z } from "zod";

const SIGNED_URL_EXPIRY_SEC = 3600; // 1 hour
const RESUME_VERSION_SELECT_COLUMNS = `
  id, candidate_id, file_url, file_name, file_size, storage_path, is_default, label, uploaded_by, created_at
`;
const listResumeVersionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
const createResumeVersionBodySchema = z
  .object({
    file_url: z.string().trim().min(1),
    file_name: z.string().trim().min(1),
    file_size: z.number().int().nonnegative().nullable().optional(),
    label: z.string().trim().min(1).nullable().optional(),
    is_default: z.boolean().optional(),
    storage_path: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (
      !hasRole(
        ctx,
        "candidate_pro",
        "candidate_free",
        "super_admin",
        "leadership",
        "recruiter",
        "agency",
        "hiring_manager",
      )
    ) {
      return jsonError("Forbidden", 403);
    }

    const { id: candidateId } = await params;
    const paginationParsed = listResumeVersionsQuerySchema.safeParse({
      limit: _request.nextUrl.searchParams.get("limit") ?? undefined,
      offset: _request.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!paginationParsed.success) return handleZodError(paginationParsed.error);
    const { limit, offset } = paginationParsed.data;
    const rangeEnd = offset + limit;
    const supabase = await createSupabaseServerClient();

    await assertCanAccessCandidateResumes(supabase, ctx, candidateId);
    await writeAccessAuditEvent({
      userId: ctx.userId,
      candidateId,
      action: "view_pii",
      ipAddress: _request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: _request.headers.get("user-agent"),
      metadata: {
        route: "GET /api/candidates/[id]/resumes",
        role: ctx.role,
      },
    });

    const { data: rows, error } = await supabase
      .from("resume_versions")
      .select(RESUME_VERSION_SELECT_COLUMNS)
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .range(offset, rangeEnd);

    if (error) {
      logger.error("Failed to fetch resume versions", { error: String(error) });
      return jsonError("Failed to fetch CV versions", 500);
    }

    const rawRows = (rows ?? []) as Array<{
      id: string;
      file_url: string;
      file_name: string;
      storage_path?: string | null;
      [k: string]: unknown;
    }>;
    const hasMore = rawRows.length > limit;
    const versions = rawRows.slice(0, limit);

    for (const v of versions) {
      const resolved = resolveCvStorageObject({
        fileUrl: v.file_url,
        storagePath: v.storage_path,
      });
      if (resolved) {
        const signed = await createCvStorageSignedUrl(
          resolved.bucket,
          resolved.path,
          SIGNED_URL_EXPIRY_SEC,
        );
        (v as Record<string, unknown>).view_url =
          signed?.url ?? toBrowserFacingStorageUrl(v.file_url) ?? v.file_url;
      } else {
        (v as Record<string, unknown>).view_url =
          toBrowserFacingStorageUrl(v.file_url) ?? v.file_url;
      }
    }

    return jsonSuccess({
      versions,
      pagination: { limit, offset, hasMore },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return jsonError(err.message, 404);
    if (err instanceof ForbiddenError) return jsonError(err.message, 403);
    return handleApiError(err, "Failed to fetch resume versions", {
      route: "GET /api/candidates/[id]/resumes",
    });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (
      !hasRole(ctx, "candidate_pro", "candidate_free", "super_admin", "recruiter", "leadership")
    ) {
      return jsonError("Forbidden", 403);
    }

    const { id: candidateId } = await params;

    const parsed = await parseJsonBody<{
      file_url?: string;
      file_name?: string;
      file_size?: number;
      label?: string;
      is_default?: boolean;
      storage_path?: string;
    }>(request, "POST /api/candidates/[id]/resumes");
    if (parsed.errorResponse) return parsed.errorResponse;
    const bodyParsed = createResumeVersionBodySchema.safeParse(parsed.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    const fileUrlError = validateResumeFileUrl(body.file_url);
    if (fileUrlError) return jsonError(fileUrlError, 422);

    const supabase = await createSupabaseServerClient();

    await assertCanAccessCandidateResumes(supabase, ctx, candidateId);

    // Always insert with is_default: false; atomically promote via RPC if requested
    // (prevents race condition between concurrent uploads on the unique partial index)
    const insertPayload = {
      candidate_id: candidateId,
      file_url: body.file_url,
      file_name: body.file_name,
      file_size: body.file_size ?? null,
      label: body.label ?? null,
      is_default: false,
      uploaded_by: ctx.userId,
      ...(body.storage_path != null && { storage_path: body.storage_path }),
    };

    const { data, error } = await supabase
      .from("resume_versions")
      .insert(insertPayload)
      .select(RESUME_VERSION_SELECT_COLUMNS)
      .single();

    if (error) {
      logger.error("Failed to create resume version", { error: String(error) });
      return jsonError("Failed to create CV version", 500);
    }

    if (body.is_default) {
      const admin = createSupabaseAdmin();
      await admin.rpc("switch_default_resume", {
        p_candidate_id: candidateId,
        p_version_id: data.id,
      });
    }

    const version = data as Record<string, unknown>;
    const fileUrl = typeof version.file_url === "string" ? version.file_url : "";
    const resolved = resolveCvStorageObject({
      fileUrl,
      storagePath: version.storage_path as string | undefined,
    });
    if (resolved) {
      const signed = await createCvStorageSignedUrl(
        resolved.bucket,
        resolved.path,
        SIGNED_URL_EXPIRY_SEC,
      );
      version.view_url = signed?.url ?? toBrowserFacingStorageUrl(fileUrl) ?? fileUrl;
    } else {
      version.view_url = toBrowserFacingStorageUrl(fileUrl) ?? fileUrl;
    }

    return jsonSuccess({ version: data }, 201);
  } catch (err) {
    if (err instanceof NotFoundError) return jsonError(err.message, 404);
    if (err instanceof ForbiddenError) return jsonError(err.message, 403);
    return handleApiError(err, "Failed to create resume version", {
      route: "POST /api/candidates/[id]/resumes",
    });
  }
}
