import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  jsonError,
  jsonSuccess,
  handleApiError,
  parseJsonBody,
  handleZodError,
} from "@/lib/api-helpers";
import { deleteCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { entraSyncPayloadSchema } from "@/lib/validations/auth";
import { isScimAssignableRole } from "@/types/database";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/auth/entra/sync
 * Receives delta payload from Entra/SCIM bridge and applies:
 * - user activation/deactivation
 * - azure_oid upsert
 * - group -> TigerHire additive role mapping
 */
export async function POST(request: NextRequest) {
  try {
    const expected = process.env.ENTRA_SYNC_SECRET;
    const auth = request.headers.get("authorization");
    if (!expected || auth !== `Bearer ${expected}`) {
      return jsonError("Unauthorized", 401);
    }

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/auth/entra/sync");
    if (errorResponse) return errorResponse;

    const parsed = entraSyncPayloadSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    const users = parsed.data.users;

    const admin = createSupabaseAdmin();
    let processed = 0;
    let deactivated = 0;

    for (const user of users) {
      const { data: mappings } = await admin
        .from("azure_group_role_mappings")
        .select("tigerhire_role")
        .eq("organisation_id", user.organisationId)
        .in("azure_group_id", user.groupIds);
      const rawMappedRoles = Array.from(
        new Set((mappings ?? []).map((row: { tigerhire_role: string }) => row.tigerhire_role)),
      );
      // Defense in depth: even if a group->role mapping was poisoned, never let
      // automated provisioning grant a platform/elevated role (e.g. super_admin).
      const mappedRoles = rawMappedRoles.filter((role) => isScimAssignableRole(role));
      const droppedRoles = rawMappedRoles.filter((role) => !isScimAssignableRole(role));
      if (droppedRoles.length > 0) {
        logger.warn("Entra sync dropped non-assignable role mappings", {
          userId: user.userId,
          organisationId: user.organisationId,
          droppedRoles,
        });
      }

      await admin
        .from("profiles")
        .update({
          azure_oid: user.azureOid ?? null,
          is_active: user.active,
          organisation_id: user.organisationId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.userId);

      await admin
        .from("employee_roles")
        .delete()
        .eq("employee_id", user.userId)
        .eq("source", "entra_sync");
      if (mappedRoles.length > 0) {
        await admin.from("employee_roles").insert(
          mappedRoles.map((role) => ({
            employee_id: user.userId,
            role,
            source: "entra_sync",
          })),
        );
      }

      await deleteCachedAuthProfile(user.userId);
      processed++;
      if (!user.active) deactivated++;
    }

    return jsonSuccess({ ok: true, processed, deactivated });
  } catch (err) {
    return handleApiError(err, "Failed to sync Entra users", {
      route: "POST /api/auth/entra/sync",
    });
  }
}
