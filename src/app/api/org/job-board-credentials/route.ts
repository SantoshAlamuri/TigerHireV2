import { NextRequest, NextResponse } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { encryptCredentials } from "@/lib/security/credentials-encryption";
import {
  upsertConnection,
  deleteConnection,
} from "@/lib/repositories/integration-connections.repository";
import { validateOrigin } from "@/lib/security/csrf";

const getCredentialsSchema = z
  .object({
    board: z.enum(["adzuna", "indeed"]),
  })
  .strict();

const setCredentialsSchema = z
  .object({
    board: z.enum(["adzuna", "indeed"]),
    credentials: z.union([
      // Adzuna credentials
      z
        .object({
          app_id: z.string().min(1),
          app_key: z.string().min(1),
          advertiser_id: z.string().optional(),
        })
        .strict(),
      // Indeed credentials
      z
        .object({
          access_token: z.string().min(1),
        })
        .strict(),
    ]),
  })
  .strict();

/**
 * GET /api/org/job-board-credentials?board=adzuna
 * Get job board credentials for the current organisation (masked for security).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership", "super_admin")) {
      return jsonError("Only company admins can manage job board credentials", 403);
    }
    if (!ctx.organisationId) {
      return jsonError("No organisation associated with your account", 400);
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = getCredentialsSchema.safeParse(params);
    if (!parsed.success) return handleZodError(parsed.error);

    const { board } = parsed.data;
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("organisation_job_board_credentials")
      .select("id, board, is_active, last_used_at, created_at, updated_at")
      .eq("organisation_id", ctx.organisationId)
      .eq("board", board)
      .maybeSingle();

    if (error) {
      return jsonError(`Failed to fetch credentials: ${error.message}`, 500);
    }

    // Return metadata only (not the encrypted credentials themselves)
    return jsonSuccess({
      configured: !!data,
      board: data?.board ?? board,
      is_active: data?.is_active ?? false,
      last_used_at: data?.last_used_at ?? null,
      created_at: data?.created_at ?? null,
      updated_at: data?.updated_at ?? null,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * POST /api/org/job-board-credentials
 * Set or update job board credentials for the current organisation.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership", "super_admin")) {
      return jsonError("Only company admins can manage job board credentials", 403);
    }
    if (!ctx.organisationId) {
      return jsonError("No organisation associated with your account", 400);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/org/job-board-credentials");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = setCredentialsSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { board, credentials } = parsed.data;

    // Encrypt credentials
    const encrypted = encryptCredentials(credentials as Record<string, unknown>);

    const supabase = await createSupabaseServerClient();

    // Upsert credentials
    const { data, error } = await supabase
      .from("organisation_job_board_credentials")
      .upsert(
        {
          organisation_id: ctx.organisationId,
          board,
          encrypted_credentials: encrypted,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,board" },
      )
      .select("id, board, is_active, updated_at")
      .single();

    if (error) {
      return jsonError(`Failed to save credentials: ${error.message}`, 500);
    }

    // Dual-write into new scoped integrations model for gradual migration.
    const secretRef = `legacy_job_board:${encrypted.toString("base64")}`;
    await upsertConnection(supabase, {
      scope: "organisation",
      organisation_id: ctx.organisationId,
      owner_user_id: null,
      provider: board,
      auth_type: "api_key",
      status: "connected",
      status_message: null,
      secret_ref: secretRef,
      config: { migratedFrom: "organisation_job_board_credentials" },
      is_default: false,
    });

    return jsonSuccess({
      success: true,
      board: data.board,
      is_active: data.is_active,
      updated_at: data.updated_at,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/org/job-board-credentials?board=adzuna
 * Delete job board credentials for the current organisation.
 */
export async function DELETE(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership", "super_admin")) {
      return jsonError("Only company admins can manage job board credentials", 403);
    }
    if (!ctx.organisationId) {
      return jsonError("No organisation associated with your account", 400);
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = getCredentialsSchema.safeParse(params);
    if (!parsed.success) return handleZodError(parsed.error);

    const { board } = parsed.data;
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("organisation_job_board_credentials")
      .delete()
      .eq("organisation_id", ctx.organisationId)
      .eq("board", board);

    if (error) {
      return jsonError(`Failed to delete credentials: ${error.message}`, 500);
    }

    await deleteConnection(supabase, {
      scope: "organisation",
      provider: board,
      organisationId: ctx.organisationId,
    });

    return jsonSuccess({ success: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
