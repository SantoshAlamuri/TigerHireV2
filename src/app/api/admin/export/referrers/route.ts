import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";

function toCsv(headers: string[], rows: Record<string, unknown>[], keys: string[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(keys.map((k) => escape(row[k])).join(","));
  }
  return lines.join("\n");
}

/**
 * GET /api/admin/export/referrers — CSV of all referrers (super_admin only).
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const rl = await checkRateLimit({
      key: `export-admin-referrers:${ctx.userId}`,
      limit: 5,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Rate limit exceeded. Please wait before exporting again.", 429);
    }

    const supabase = createSupabaseAdmin();
    const { data: refs, error } = await supabase
      .from("referrers")
      .select(
        "id, name, type, status, whatsapp_verified, whatsapp_number, upi_id, city, linkedin_url, parent_referrer_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10_000);

    if (error) {
      logger.error("admin export referrers: query failed", { message: error.message });
      return jsonError("Export failed. Please try again later.", 500);
    }

    const rows = (refs ?? []) as {
      id: string;
      name: string | null;
      type: string | null;
      status: string | null;
      whatsapp_verified: boolean | null;
      whatsapp_number: string | null;
      upi_id: string | null;
      city: string | null;
      linkedin_url: string | null;
      parent_referrer_id: string | null;
      created_at: string | null;
    }[];

    const parentIds = [
      ...new Set(rows.map((r) => r.parent_referrer_id).filter(Boolean)),
    ] as string[];
    const parentNameById = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: parents, error: pErr } = await supabase
        .from("referrers")
        .select("id, name")
        .in("id", parentIds);
      if (pErr) {
        logger.error("admin export referrers: parent lookup failed", { message: pErr.message });
        return jsonError("Export failed. Please try again later.", 500);
      }
      for (const p of parents ?? []) {
        parentNameById.set(p.id as string, (p.name as string) ?? "");
      }
    }

    const flat: Record<string, unknown>[] = rows.map((r) => ({
      id: r.id,
      name: r.name ?? "",
      type: r.type ?? "",
      status: r.status ?? "",
      whatsapp_verified: r.whatsapp_verified ?? false,
      whatsapp_number: r.whatsapp_number ?? "",
      upi_id: r.upi_id ?? "",
      city: r.city ?? "",
      linkedin_url: r.linkedin_url ?? "",
      parent_referrer_name: r.parent_referrer_id
        ? (parentNameById.get(r.parent_referrer_id) ?? "")
        : "",
      created_at: r.created_at ?? "",
    }));

    const keys = [
      "id",
      "name",
      "type",
      "status",
      "whatsapp_verified",
      "whatsapp_number",
      "upi_id",
      "city",
      "linkedin_url",
      "parent_referrer_name",
      "created_at",
    ];

    const csv = toCsv(
      [
        "ID",
        "Name",
        "Type",
        "Status",
        "WhatsApp Verified",
        "WhatsApp Number",
        "UPI ID",
        "City",
        "LinkedIn URL",
        "Parent Referrer Name",
        "Created At",
      ],
      flat,
      keys,
    );

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `referrers-export-${timestamp}.csv`;

    logger.info("CSV export completed", {
      userId: ctx.userId,
      route: "GET /api/admin/export/referrers",
    });

    const { error: auditError } = await supabase.from("audit_log").insert({
      organisation_id: null,
      actor_user_id: ctx.userId,
      actor_email: null,
      event_type: "export.admin.referrers",
      resource_type: "referrers",
      resource_id: null,
      metadata: {
        route: "GET /api/admin/export/referrers",
        row_count: flat.length,
      },
    });
    if (auditError) {
      logger.error("admin export referrers: audit log failed", { message: auditError.message });
      return jsonError("Export failed. Please try again later.", 500);
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (err) {
    logger.error("admin export referrers failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError("Export failed. Please try again later.", 500);
  }
}
