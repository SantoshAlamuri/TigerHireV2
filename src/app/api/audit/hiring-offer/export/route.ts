import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth, hasRole, jsonError, handleApiError } from "@/lib/api-helpers";

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "created_at,event_type,entity_type,entity_id,actor_role,prev_status,new_status,decision,comments\n";
  }
  const headers = [
    "created_at",
    "event_type",
    "entity_type",
    "entity_id",
    "actor_role",
    "prev_status",
    "new_status",
    "decision",
    "comments",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const raw = row[h];
      const text =
        raw == null
          ? ""
          : typeof raw === "string"
            ? raw
            : Array.isArray(raw) || typeof raw === "object"
              ? JSON.stringify(raw)
              : String(raw);
      return `"${text.replace(/"/g, '""')}"`;
    });
    lines.push(values.join(","));
  }
  return `${lines.join("\n")}\n`;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "leadership", "recruiter", "finance", "super_admin")) {
      return jsonError("Forbidden", 403);
    }

    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    const days = Number(url.searchParams.get("days") ?? "90");
    const fromIso = new Date(
      Date.now() - Math.max(1, Math.min(days, 365)) * 24 * 3600 * 1000,
    ).toISOString();

    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("hiring_offer_audit_events")
      .select(
        "created_at, event_type, entity_type, entity_id, actor_role, prev_status, new_status, decision, comments",
      )
      .eq("organisation_id", ctx.organisationId)
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (entityType) query = query.eq("entity_type", entityType);
    if (entityId) query = query.eq("entity_id", entityId);

    const { data, error } = await query;
    if (error) return jsonError("Failed to load audit events", 500);
    const csv = toCsv((data ?? []) as Array<Record<string, unknown>>);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hiring-offer-audit-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to export audit events", {
      route: "GET /api/audit/hiring-offer/export",
    });
  }
}
