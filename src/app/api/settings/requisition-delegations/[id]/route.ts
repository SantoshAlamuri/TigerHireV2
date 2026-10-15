import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import {
  getOrgSettingsPermissions,
  isRequisitionAdvancedModeEnabled,
} from "@/lib/settings/permissions";
import { z } from "zod";

const revokeDelegationBodySchema = z.object({}).strict();

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "leadership", "recruiter", "super_admin")) return jsonError("Forbidden", 403);
    if (!ctx.isOrgAdmin && ctx.role !== "super_admin") return jsonError("Forbidden", 403);
    const body = await request?.json?.().catch(() => ({}));
    const bodyParsed = revokeDelegationBodySchema.safeParse(body ?? {});
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    if (!isRequisitionAdvancedModeEnabled(permissions)) {
      return jsonError(
        "Requisition advanced mode is disabled. Enable it in Settings > Permissions first.",
        409,
      );
    }
    const { data, error } = await supabase
      .from("approval_delegations")
      .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      if (isMissingDelegationsTableError(error)) {
        return jsonError(
          "Requisition delegation setup is not migrated yet. Apply the latest database migrations and retry.",
          503,
        );
      }
      throw error;
    }
    if (!data) return jsonError("Delegation not found", 404);
    return jsonSuccess({ revoked: true });
  } catch (err) {
    return handleApiError(err, "Failed to revoke delegation", {
      route: "DELETE /api/settings/requisition-delegations/[id]",
    });
  }
}
