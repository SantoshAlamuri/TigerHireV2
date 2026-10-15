import { NextRequest } from "next/server";
import {
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/security/platform-admin";
import { validateOrigin } from "@/lib/security/csrf";
import { updateSupportRequestSchema } from "@/lib/validations/support";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;

    const status = request.nextUrl.searchParams.get("status");
    const priority = request.nextUrl.searchParams.get("priority");
    const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const admin = createSupabaseAdmin();
    let query = admin
      .from("support_requests")
      .select(
        "id, created_at, updated_at, created_by, created_by_name, created_by_email, organisation_id, source, category, priority, status, owner_team, assignee_user_id, subject, description, context_path, resolved_at, resolved_by, resolution_notes, feedback_rating, feedback_comment, feedback_submitted_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);

    const { data, error } = await query;
    if (error) return jsonError("Failed to load support requests", 500);

    return jsonSuccess({ requests: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load support requests", {
      route: "GET /api/admin/support-requests",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;

    const parsedBody = await parseJsonBody(request, "PATCH /api/admin/support-requests");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = updateSupportRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { id, status, assigneeUserId, ownerTeam, resolutionNotes } = parsed.data;
    const admin = createSupabaseAdmin();

    const patch: Record<string, string | null> = {};
    if (status !== undefined) {
      patch.status = status;
      if (status === "resolved") {
        patch.resolved_at = new Date().toISOString();
        patch.resolved_by = auth.context.userId;
      } else {
        patch.resolved_at = null;
        patch.resolved_by = null;
      }
    }
    if (assigneeUserId !== undefined) patch.assignee_user_id = assigneeUserId;
    if (ownerTeam !== undefined) patch.owner_team = ownerTeam;
    if (resolutionNotes !== undefined) patch.resolution_notes = resolutionNotes || null;

    const { data, error } = await admin
      .from("support_requests")
      .update(patch)
      .eq("id", id)
      .select(
        "id, created_at, updated_at, created_by, created_by_name, created_by_email, organisation_id, source, category, priority, status, owner_team, assignee_user_id, subject, description, context_path, resolved_at, resolved_by, resolution_notes, feedback_rating, feedback_comment, feedback_submitted_at",
      )
      .single();

    if (error || !data) return jsonError("Failed to update support request", 500);
    return jsonSuccess({ request: data });
  } catch (error) {
    return handleApiError(error, "Failed to update support request", {
      route: "PATCH /api/admin/support-requests",
    });
  }
}
