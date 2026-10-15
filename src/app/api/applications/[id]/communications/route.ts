import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ApplicationRepository } from "@/lib/repositories/ApplicationRepository";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { assertApplicationRouteAccess } from "@/lib/applications/assert-application-access";
import { logger } from "@/lib/observability/logger";

type Ctx = { params: Promise<{ id: string }> };

const ROLES = ["hiring_manager", "leadership", "recruiter", "agency", "super_admin"] as const;

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * GET /api/applications/[id]/communications — merged timeline: WhatsApp (wa_messages) + app milestones.
 */
export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ROLES)) {
      return jsonError("Forbidden", 403);
    }

    const { id: applicationId } = await context.params;
    const supabase = await createSupabaseServerClient();
    const data = await ApplicationRepository.getById(supabase, applicationId);
    if (!data) return jsonError("Application not found", 404);

    const app = data as {
      jobs?:
        | { organisation_id?: string; hiring_manager_id?: string }
        | { organisation_id?: string; hiring_manager_id?: string }[]
        | null;
      candidates?: { user_id?: string } | { user_id?: string }[] | null;
    };
    const accessError = await assertApplicationRouteAccess(ctx, applicationId, app);
    if (accessError) return accessError;

    const admin = createSupabaseAdmin();
    const { data: wa, error: waErr } = await admin
      .from("wa_messages")
      .select("id, direction, template_name, body, status, created_at, wa_message_id")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true });

    const appRow = data as {
      candidate_id?: string;
      job_id?: string;
      created_at?: string;
      status?: string;
      updated_at?: string;
    };
    // Untagged notes (job_id IS NULL) carry no org identity, so an unconditional
    // `job_id.is.null` branch returned other organisations' private notes on any
    // candidate shared between tenants. Scope them to authors in the caller's org.
    // (Service-role client here, so RLS is not a backstop.)
    const orgAuthorIds: string[] = [];
    if (appRow.candidate_id && ctx.organisationId) {
      const { data: orgProfiles } = await admin
        .from("profiles")
        .select("id")
        .eq("organisation_id", ctx.organisationId);
      for (const row of orgProfiles ?? []) orgAuthorIds.push((row as { id: string }).id);
    }
    const untaggedClause =
      orgAuthorIds.length > 0
        ? `and(job_id.is.null,author_id.in.(${orgAuthorIds.join(",")}))`
        : null;
    const noteFilters = [
      appRow.job_id ? `job_id.eq.${appRow.job_id}` : null,
      untaggedClause,
    ].filter((v): v is string => Boolean(v));
    const notesQuery =
      appRow.candidate_id && noteFilters.length > 0
        ? await admin
            .from("candidate_notes")
            .select("id, body, created_at, author_id, job_id")
            .eq("candidate_id", appRow.candidate_id)
            .or(noteFilters.join(","))
            .order("created_at", { ascending: true })
        : { data: null, error: null as { message: string } | null };
    if (notesQuery.error) {
      logger.warn("communications: candidate_notes query failed", {
        applicationId,
        error: notesQuery.error.message,
      });
    }
    const noteRows = notesQuery.data;

    const events: Array<{
      id: string;
      at: string;
      kind: "message" | "system" | "note";
      label: string;
      detail: string | null;
    }> = [];

    events.push({
      id: "app-created",
      at: (appRow.created_at as string) ?? new Date().toISOString(),
      kind: "system",
      label: "Application",
      detail: "Submitted",
    });

    for (const row of waErr ? [] : (wa ?? [])) {
      const isOut = row.direction === "out";
      events.push({
        id: `wa-${row.id as string}`,
        at: row.created_at as string,
        kind: "message",
        label: isOut ? "WhatsApp (outbound)" : "WhatsApp (inbound)",
        detail: row.body
          ? String(row.body)
          : row.template_name
            ? `Template: ${row.template_name}`
            : null,
      });
    }

    for (const n of noteRows ?? []) {
      const ra = n as { id: string | number; body: string; created_at: string };
      events.push({
        id: `note-${String(ra.id)}`,
        at: ra.created_at,
        kind: "note",
        label: "Note",
        detail: ra.body,
      });
    }

    events.push({
      id: `status-${(appRow.status as string) ?? "unknown"}`,
      at: (appRow.updated_at as string) ?? (appRow.created_at as string),
      kind: "system",
      label: "Status",
      detail: appRow.status ?? null,
    });

    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return jsonSuccess({
      events,
      notice: waErr
        ? "wa_messages not available; apply DB migration 20260424200000_wa_messages_and_schedule_tokens.sql"
        : undefined,
      /** v1: no durable outbound email log; filter "Messages" still shows WhatsApp. */
      emailLogAvailable: false,
    });
  } catch (e) {
    return handleApiError(e, "Failed to load communications", {
      route: "GET /api/applications/[id]/communications",
    });
  }
}

export const dynamic = "force-dynamic";
