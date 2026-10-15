import { NextRequest } from "next/server";
import {
  getAuthContext,
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateOrigin } from "@/lib/security/csrf";
import { createSupportRequestSchema, submitSupportFeedbackSchema } from "@/lib/validations/support";

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toTicketNumber(id: string): string {
  const prefix = id.split("-")[0] ?? id.slice(0, 8);
  return `SR-${prefix.toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const parsedBody = await parseJsonBody(request, "POST /api/support-requests");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = createSupportRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", ctx.userId)
      .maybeSingle();

    const baseInsertPayload = {
      created_by: ctx.userId,
      organisation_id: isUuid(ctx.organisationId) ? ctx.organisationId : null,
      source: "in_app",
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: "open",
      owner_team: "support_desk",
      subject: parsed.data.subject,
      description: parsed.data.description,
      context_path: parsed.data.contextPath ?? null,
    };

    const enrichedInsertPayload = {
      ...baseInsertPayload,
      created_by_name: profile?.full_name ?? null,
      created_by_email: profile?.email ?? null,
      metadata: { role: ctx.role },
    };

    let { data, error } = await admin
      .from("support_requests")
      .insert(enrichedInsertPayload)
      .select("id, created_at, status")
      .single();

    const code = String((error as { code?: string } | null)?.code ?? "");
    const message = String(error?.message ?? "");
    const details = String((error as { details?: string } | null)?.details ?? "");
    const isOrganisationFkError =
      code === "23503" &&
      (message.toLowerCase().includes("organisation_id") ||
        details.toLowerCase().includes("organisation_id"));
    const isSchemaDriftError = code === "42703" || message.toLowerCase().includes("column");

    if (error && isOrganisationFkError && baseInsertPayload.organisation_id) {
      ({ data, error } = await admin
        .from("support_requests")
        .insert({
          ...enrichedInsertPayload,
          organisation_id: null,
        })
        .select("id, created_at, status")
        .single());
    }

    if (error && isSchemaDriftError) {
      ({ data, error } = await admin
        .from("support_requests")
        .insert(baseInsertPayload)
        .select("id, created_at, status")
        .single());
    }

    if (error) {
      const code = String((error as { code?: string } | null)?.code ?? "");
      const message = String(error.message ?? "");
      if (
        message.includes('relation "support_requests" does not exist') ||
        code.toUpperCase() === "PGRST205"
      ) {
        return jsonError(
          "Support system is not initialized yet. Please ask admin to run latest DB migrations.",
          503,
        );
      }
      return jsonError("Failed to create support request", 500);
    }

    return jsonSuccess(
      {
        request: data,
        ticketNumber: data?.id ? toTicketNumber(data.id) : null,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error, "Failed to create support request", {
      route: "POST /api/support-requests",
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const status = request.nextUrl.searchParams.get("status");
    const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    const admin = createSupabaseAdmin();
    let query = admin
      .from("support_requests")
      .select(
        "id, created_at, updated_at, category, priority, status, owner_team, assignee_user_id, subject, description, context_path, resolved_at, resolution_notes, feedback_rating, feedback_comment, feedback_submitted_at",
      )
      .eq("created_by", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return jsonError("Failed to load support requests", 500);

    return jsonSuccess({
      requests: (data ?? []).map((row) => ({
        ...row,
        ticketNumber: toTicketNumber(row.id),
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load support requests", {
      route: "GET /api/support-requests",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const parsedBody = await parseJsonBody(request, "PATCH /api/support-requests");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = submitSupportFeedbackSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: current, error: currentError } = await admin
      .from("support_requests")
      .select("id, created_by, status, feedback_rating")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (currentError || !current) return jsonError("Support request not found", 404);
    if (current.created_by !== ctx.userId) return jsonError("Forbidden", 403);
    if (current.status !== "resolved") {
      return jsonError("Feedback can only be submitted after resolution.", 409);
    }

    const { data, error } = await admin
      .from("support_requests")
      .update({
        feedback_rating: parsed.data.rating,
        feedback_comment: parsed.data.comment || null,
        feedback_submitted_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id)
      .select(
        "id, created_at, updated_at, category, priority, status, owner_team, assignee_user_id, subject, description, context_path, resolved_at, resolution_notes, feedback_rating, feedback_comment, feedback_submitted_at",
      )
      .single();
    if (error || !data) return jsonError("Failed to submit feedback", 500);

    return jsonSuccess({
      request: {
        ...data,
        ticketNumber: toTicketNumber(data.id),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to submit support feedback", {
      route: "PATCH /api/support-requests",
    });
  }
}
