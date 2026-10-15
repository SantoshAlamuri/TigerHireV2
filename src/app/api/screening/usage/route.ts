import { NextRequest } from "next/server";
import {
  getAuthContext,
  handleApiError,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function monthStartIso(): string {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return monthStart.toISOString();
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId && ctx.role !== "super_admin") return jsonError("Forbidden", 403);

    const query = supabase
      .from("screening_jobs")
      .select("mode, billable, charge_inr, created_at")
      .gte("created_at", monthStartIso());

    const scoped =
      ctx.role === "super_admin" ? query : query.eq("organisation_id", ctx.organisationId);
    const { data, error } = await scoped;
    if (error) throw error;

    const rows = data ?? [];
    const summary = {
      whatsapp: 0,
      voice: 0,
      manual: 0,
      none: 0,
      voiceBillable: 0,
      voiceSpendInr: 0,
    };
    for (const row of rows) {
      if (row.mode === "whatsapp") summary.whatsapp += 1;
      if (row.mode === "voice") {
        summary.voice += 1;
        if (row.billable) summary.voiceBillable += 1;
        const charge =
          typeof row.charge_inr === "number" ? row.charge_inr : Number(row.charge_inr ?? 0);
        if (Number.isFinite(charge)) summary.voiceSpendInr += charge;
      }
      if (row.mode === "manual") summary.manual += 1;
      if (row.mode === "none") summary.none += 1;
    }

    return jsonSuccess({ usage: summary });
  } catch (error) {
    return handleApiError(error, "Failed to fetch screening usage", {
      route: "GET /api/screening/usage",
    });
  }
}
