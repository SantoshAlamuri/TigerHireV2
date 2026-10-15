import { NextRequest } from "next/server";
import {
  getAuthContext,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { usdToInr } from "@/lib/services/anthropic-budget-gate";

/**
 * GET /api/admin/cascade/report
 *
 * Single endpoint for cascade observability — built so ops doesn't have to
 * run-here-and-there to understand cost / quality. Returns:
 *
 *   - budget        : today + month spend vs cap (INR)
 *   - layerMix      : count by cascade layer over last 24h + 7d
 *   - cacheHitRate  : cache-hit vs cascade-run ratio
 *   - topKnockouts  : most common Layer 0 knockout reasons
 *   - costByLayer   : INR cost rolled up by cascade layer
 *   - recentSpend   : per-day INR spend last 14 days
 *
 * Restricted to platform admins (super_admin, leadership) — exposes org-wide
 * cost data.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership")) {
      return jsonError("Forbidden", 403);
    }

    const admin = createSupabaseAdmin();
    const fx = usdToInr();
    const now = new Date();
    const todayUtc = now.toISOString().slice(0, 10);
    const monthStart = `${todayUtc.slice(0, 7)}-01`;
    const dayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeekAgoIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const roleCapInr = Number(process.env.ANTHROPIC_ROLE_CAP_INR ?? 3_500);
    const dailyCapInr = Number(process.env.ANTHROPIC_DAILY_CAP_INR ?? 10_000);
    const monthlyCapInr = Number(process.env.ANTHROPIC_MONTHLY_CAP_INR ?? 100_000);
    const warnAtPct = Number(process.env.ANTHROPIC_WARN_AT_PCT ?? 80);
    const globalCapDisabled = process.env.ANTHROPIC_GLOBAL_CAP_DISABLED === "true";

    const [
      budgetRes,
      layerMixRes,
      cacheRes,
      knockoutsRes,
      costByLayerRes,
      recentSpendRes,
      topRolesRes,
    ] = await Promise.all([
      admin
        .from("budget_state")
        .select("window_kind, window_start_utc, spend_inr_paise, call_count, warn_alert_sent_at")
        .in("window_kind", ["day", "month"])
        .in("window_start_utc", [todayUtc, monthStart]),
      admin
        .from("cascade_decisions")
        .select("layer_resolved, created_at")
        .gte("created_at", weekAgoIso),
      admin.from("cascade_decisions").select("cache_hit").gte("created_at", dayAgoIso),
      admin
        .from("cascade_decisions")
        .select("knockout_reason")
        .gte("created_at", weekAgoIso)
        .not("knockout_reason", "is", null),
      admin
        .from("cascade_decisions")
        .select("layer_resolved, cost_inr_paise")
        .gte("created_at", dayAgoIso),
      admin.rpc("budget_recent_daily_spend", { p_since: twoWeekAgoIso }).then((r) => {
        // Fallback for projects that don't have the helper RPC yet — query
        // budget_state directly.
        if (r.error) {
          return admin
            .from("budget_state")
            .select("window_start_utc, spend_inr_paise, call_count")
            .eq("window_kind", "day")
            .gte("window_start_utc", twoWeekAgoIso.slice(0, 10))
            .order("window_start_utc", { ascending: false });
        }
        return r;
      }),
      // Top roles by spend — surfaces which jobs are eating budget and which
      // are near / over their per-role cap.
      admin
        .from("job_budget_state")
        .select("job_id, organisation_id, spend_inr_paise, call_count, cap_inr_paise, blocked_at")
        .order("spend_inr_paise", { ascending: false })
        .limit(20),
    ]);

    const dayRow = (budgetRes.data ?? []).find(
      (r) => (r as { window_kind?: string }).window_kind === "day",
    ) as { spend_inr_paise?: number; call_count?: number; warn_alert_sent_at?: string } | undefined;
    const monthRow = (budgetRes.data ?? []).find(
      (r) => (r as { window_kind?: string }).window_kind === "month",
    ) as { spend_inr_paise?: number; call_count?: number; warn_alert_sent_at?: string } | undefined;

    const daySpendInr = (Number(dayRow?.spend_inr_paise ?? 0) || 0) / 100;
    const monthSpendInr = (Number(monthRow?.spend_inr_paise ?? 0) || 0) / 100;

    const layerCounts7d: Record<string, number> = {};
    const layerCounts24h: Record<string, number> = {};
    for (const row of (layerMixRes.data ?? []) as Array<{
      layer_resolved: string;
      created_at: string;
    }>) {
      layerCounts7d[row.layer_resolved] = (layerCounts7d[row.layer_resolved] ?? 0) + 1;
      if (row.created_at >= dayAgoIso) {
        layerCounts24h[row.layer_resolved] = (layerCounts24h[row.layer_resolved] ?? 0) + 1;
      }
    }

    const cacheHits = (cacheRes.data ?? []).filter(
      (r) => (r as { cache_hit?: boolean }).cache_hit,
    ).length;
    const cacheTotal = (cacheRes.data ?? []).length;
    const cacheHitPct = cacheTotal > 0 ? +((cacheHits / cacheTotal) * 100).toFixed(1) : 0;

    const knockoutTally: Record<string, number> = {};
    for (const row of (knockoutsRes.data ?? []) as Array<{ knockout_reason: string | null }>) {
      if (!row.knockout_reason) continue;
      // Bucket reasons by leading keyword so similar reasons collapse.
      const bucket = row.knockout_reason.split(":")[0]?.trim() ?? row.knockout_reason;
      knockoutTally[bucket] = (knockoutTally[bucket] ?? 0) + 1;
    }
    const topKnockouts = Object.entries(knockoutTally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));

    const costByLayer: Record<string, { count: number; inrTotal: number }> = {};
    for (const row of (costByLayerRes.data ?? []) as Array<{
      layer_resolved: string;
      cost_inr_paise: number;
    }>) {
      const k = row.layer_resolved;
      if (!costByLayer[k]) costByLayer[k] = { count: 0, inrTotal: 0 };
      costByLayer[k].count += 1;
      costByLayer[k].inrTotal += (Number(row.cost_inr_paise) || 0) / 100;
    }

    const recentSpend = (
      (recentSpendRes.data ?? []) as Array<{
        window_start_utc: string;
        spend_inr_paise: number;
        call_count: number;
      }>
    ).map((r) => ({
      day: r.window_start_utc,
      spendInr: +(Number(r.spend_inr_paise) / 100).toFixed(2),
      callCount: Number(r.call_count) || 0,
    }));

    const topRoles = (
      (topRolesRes.data ?? []) as Array<{
        job_id: string;
        organisation_id: string | null;
        spend_inr_paise: number;
        call_count: number;
        cap_inr_paise: number | null;
        blocked_at: string | null;
      }>
    ).map((r) => {
      const spendInr = (Number(r.spend_inr_paise) || 0) / 100;
      const capInr = r.cap_inr_paise != null ? Number(r.cap_inr_paise) / 100 : roleCapInr;
      return {
        job_id: r.job_id,
        organisation_id: r.organisation_id,
        spend_inr: +spendInr.toFixed(2),
        cap_inr: capInr,
        pct_used: capInr > 0 ? +((spendInr / capInr) * 100).toFixed(1) : 0,
        calls: Number(r.call_count) || 0,
        blocked: Boolean(r.blocked_at),
      };
    });

    return jsonSuccess({
      generated_at: now.toISOString(),
      fx_usd_to_inr: fx,
      caps: {
        role_cap_inr: roleCapInr,
        daily_cap_inr: dailyCapInr,
        monthly_cap_inr: monthlyCapInr,
        global_cap_disabled: globalCapDisabled,
        primary_unit: "role",
      },
      per_role: {
        top_by_spend: topRoles,
        roles_near_cap: topRoles.filter((r) => r.pct_used >= warnAtPct && !r.blocked),
        roles_blocked: topRoles.filter((r) => r.blocked),
      },
      budget: {
        day: {
          spent_inr: +daySpendInr.toFixed(2),
          cap_inr: dailyCapInr,
          pct_used: +((daySpendInr / dailyCapInr) * 100).toFixed(1),
          calls: Number(dayRow?.call_count ?? 0),
          warn_alerted: Boolean(dayRow?.warn_alert_sent_at),
          warn_at_pct: warnAtPct,
        },
        month: {
          spent_inr: +monthSpendInr.toFixed(2),
          cap_inr: monthlyCapInr,
          pct_used: +((monthSpendInr / monthlyCapInr) * 100).toFixed(1),
          calls: Number(monthRow?.call_count ?? 0),
          warn_alerted: Boolean(monthRow?.warn_alert_sent_at),
          warn_at_pct: warnAtPct,
        },
      },
      layer_mix: {
        last_24h: layerCounts24h,
        last_7d: layerCounts7d,
      },
      cache: {
        hits_24h: cacheHits,
        total_24h: cacheTotal,
        hit_pct: cacheHitPct,
      },
      top_layer_0_knockouts_7d: topKnockouts,
      cost_by_layer_24h: costByLayer,
      recent_daily_spend_14d: recentSpend,
    });
  } catch (err) {
    return handleApiError(err, "Failed to build cascade report", {
      route: "GET /api/admin/cascade/report",
    });
  }
}
