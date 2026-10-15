import { z } from "zod";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import {
  getOrgSettingsPermissions,
  isRequisitionAdvancedModeEnabled,
} from "@/lib/settings/permissions";

const delegationSchema = z
  .object({
    approverRole: z.string().trim().min(2).max(80),
    delegateProfileId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().max(1000).optional().nullable(),
  })
  .strict();

const APPROVAL_DELEGATION_SELECT_COLUMNS =
  "id, organisation_id, approver_role, delegate_profile_id, starts_at, ends_at, reason, created_by, revoked_at, created_at, updated_at";

function isMissingDelegationsTableError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("approval_delegations") ||
    message.includes("schema cache")
  );
}

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "leadership", "super_admin", "recruiter", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const supabase = await createSupabaseServerClient();
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    if (!isRequisitionAdvancedModeEnabled(permissions)) {
      return jsonSuccess({ delegations: [] });
    }
    const { data, error } = await supabase
      .from("approval_delegations")
      .select(APPROVAL_DELEGATION_SELECT_COLUMNS)
      .eq("organisation_id", ctx.organisationId)
      .is("revoked_at", null)
      .order("starts_at", { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingDelegationsTableError(error)) {
        return jsonError(
          "Requisition delegation setup is not migrated yet. Apply the latest database migrations and retry.",
          503,
        );
      }
      throw error;
    }

    return jsonSuccess({ delegations: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to load requisition delegations", {
      route: "GET /api/settings/requisition-delegations",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "leadership", "recruiter", "super_admin")) return jsonError("Forbidden", 403);
    if (!ctx.isOrgAdmin && ctx.role !== "super_admin") return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/settings/requisition-delegations");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = delegationSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    const payload = parsed.data;
    if (new Date(payload.endsAt).getTime() <= new Date(payload.startsAt).getTime()) {
      return jsonError("endsAt must be later than startsAt", 400);
    }

    const supabase = await createSupabaseServerClient();
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    if (!isRequisitionAdvancedModeEnabled(permissions)) {
      return jsonError(
        "Requisition advanced mode is disabled. Enable it in Settings > Permissions first.",
        409,
      );
    }
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("approval_delegations")
      .insert({
        organisation_id: ctx.organisationId,
        approver_role: payload.approverRole,
        delegate_profile_id: payload.delegateProfileId,
        starts_at: payload.startsAt,
        ends_at: payload.endsAt,
        reason: payload.reason ?? null,
        created_by: ctx.userId,
        updated_at: nowIso,
      })
      .select(APPROVAL_DELEGATION_SELECT_COLUMNS)
      .single();
    if (error) {
      if (isMissingDelegationsTableError(error)) {
        return jsonError(
          "Requisition delegation setup is not migrated yet. Apply the latest database migrations and retry.",
          503,
        );
      }
      throw error;
    }
    return jsonSuccess({ delegation: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to save requisition delegation", {
      route: "POST /api/settings/requisition-delegations",
    });
  }
}
