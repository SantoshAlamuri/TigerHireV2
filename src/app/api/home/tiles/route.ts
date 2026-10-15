import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, hasRole, jsonError, jsonSuccess, requireAuth } from "@/lib/api-helpers";
import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";
import { listActionableTasksForUser } from "@/lib/tasks/list-actionable-tasks-for-user";
import { logger } from "@/lib/observability/logger";

/** Offer states that are still moving — the only ones a finance queue can act on. */
const OFFERS_IN_FLIGHT = ["draft", "pending_admin", "pending_finance", "approved", "sent"] as const;

/**
 * GET /api/home/tiles?tile=<id>
 * Role-scoped metrics for dashboard home tiles (Brief 1). Each tile returns a small JSON payload;
 * tiles treat zero counts as empty state in the UI.
 */
export async function GET(request: NextRequest) {
  const tile = request.nextUrl.searchParams.get("tile");
  if (!tile) return jsonError("Missing tile", 400);

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organisationId;

  try {
    switch (tile) {
      case "lh-open-roles": {
        if (!hasRole(ctx, "leadership")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ openRoles: 0, empty: true });
        const { count, error } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", orgId)
          .eq("status", "open");
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ openRoles: n, empty: n === 0 });
      }
      case "lh-pipeline-7d": {
        if (!hasRole(ctx, "leadership")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ moves: 0, empty: true });
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id")
          .eq("organisation_id", orgId);
        const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
        if (jobIds.length === 0) return jsonSuccess({ moves: 0, empty: true });
        const { count, error } = await supabase
          .from("pipeline_candidates")
          .select("id", { count: "exact", head: true })
          .in("job_id", jobIds)
          .gte("created_at", since);
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ moves: n, empty: n === 0 });
      }
      case "lh-offers-30d": {
        if (!hasRole(ctx, "leadership")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ sent: 0, accepted: 0, empty: true });
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        // offers rows are org-scoped (application_id → job); there is no offers.job_id column.
        const { data: offers, error } = await supabase
          .from("offers")
          .select("status, created_at")
          .eq("organisation_id", orgId)
          .gte("created_at", since);
        if (error) throw error;
        const rows = offers ?? [];
        const sent = rows.length;
        const accepted = rows.filter(
          (o: { status: string | null }) => (o.status ?? "").toLowerCase() === "accepted",
        ).length;
        return jsonSuccess({ sent, accepted, empty: sent === 0 });
      }
      case "lh-referral-leaders": {
        if (!hasRole(ctx, "leadership")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ leaders: [], empty: true });
        const { data: refs, error: rErr } = await supabase
          .from("referrals")
          .select("referrer_id")
          .limit(500);
        if (rErr) throw rErr;
        const referrerIds = [
          ...new Set(
            (refs ?? []).map((r: { referrer_id: string }) => r.referrer_id).filter(Boolean),
          ),
        ];
        if (referrerIds.length === 0) return jsonSuccess({ leaders: [], empty: true });
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("organisation_id", orgId)
          .in("id", referrerIds);
        if (pErr) throw pErr;
        const allowed = new Set((profs ?? []).map((p: { id: string }) => p.id));
        const counts = new Map<string, number>();
        for (const row of refs ?? []) {
          const uid = (row as { referrer_id: string }).referrer_id;
          if (!allowed.has(uid)) continue;
          counts.set(uid, (counts.get(uid) ?? 0) + 1);
        }
        const leaders = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([referrer_id, count]) => ({ referrer_id, count }));
        return jsonSuccess({ leaders, empty: leaders.length === 0 });
      }
      case "rc-applications-today": {
        if (!hasRole(ctx, "recruiter")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ count: 0, empty: true });
        const start = new Date();
        start.setUTCHours(0, 0, 0, 0);
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id")
          .eq("organisation_id", orgId);
        const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
        if (jobIds.length === 0) return jsonSuccess({ count: 0, empty: true });
        const { count, error } = await supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .in("job_id", jobIds)
          .gte("created_at", start.toISOString());
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "rc-pipeline-rows": {
        if (!hasRole(ctx, "recruiter")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ count: 0, empty: true });
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id")
          .eq("organisation_id", orgId);
        const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
        if (jobIds.length === 0) return jsonSuccess({ count: 0, empty: true });
        const { count, error } = await supabase
          .from("pipeline_candidates")
          .select("id", { count: "exact", head: true })
          .in("job_id", jobIds);
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "rc-jobs-open": {
        if (!hasRole(ctx, "recruiter")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ count: 0, empty: true });
        const { count, error } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", orgId)
          .eq("status", "open");
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "rc-stale-pipeline": {
        if (!hasRole(ctx, "recruiter")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ count: 0, empty: true });
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id")
          .eq("organisation_id", orgId);
        const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
        if (jobIds.length === 0) return jsonSuccess({ count: 0, empty: true });
        // Hired/rejected rows are resolved, not stale — only count candidates
        // still sitting in an active stage.
        const { count, error } = await supabase
          .from("pipeline_candidates")
          .select("id", { count: "exact", head: true })
          .in("job_id", jobIds)
          .lte("created_at", cutoff)
          .not("status", "in", "(hired,rejected)");
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "hm-owned-jobs": {
        if (!hasRole(ctx, "hiring_manager")) return jsonError("Forbidden", 403);
        let ownedQ = supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("hiring_manager_id", ctx.userId);
        if (orgId) ownedQ = ownedQ.eq("organisation_id", orgId);
        const { count, error } = await ownedQ;
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "hm-pipeline-awaiting": {
        if (!hasRole(ctx, "hiring_manager")) return jsonError("Forbidden", 403);
        let jobsForHm = supabase.from("jobs").select("id").eq("hiring_manager_id", ctx.userId);
        if (orgId) jobsForHm = jobsForHm.eq("organisation_id", orgId);
        const { data: jobs } = await jobsForHm;
        const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
        if (jobIds.length === 0) return jsonSuccess({ count: 0, empty: true });
        const { count, error } = await supabase
          .from("pipeline_candidates")
          .select("id", { count: "exact", head: true })
          .in("job_id", jobIds)
          .neq("status", "rejected");
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "hm-hiring-requests": {
        if (!hasRole(ctx, "hiring_manager")) return jsonError("Forbidden", 403);
        let hrQ = supabase
          .from("hiring_requests")
          .select("id", { count: "exact", head: true })
          .eq("created_by", ctx.userId);
        if (orgId) hrQ = hrQ.eq("organisation_id", orgId);
        const { count, error } = await hrQ;
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "iv-upcoming": {
        if (!hasRole(ctx, "interviewer")) return jsonError("Forbidden", 403);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email?.trim().toLowerCase();
        if (!email) return jsonSuccess({ count: 0, empty: true });
        const horizon = new Date(Date.now() + 7 * 86400000).toISOString();
        const { data: stages, error: stErr } = await supabase
          .from("pipeline_stages")
          .select("id")
          .ilike("interviewer_email", email);
        if (stErr) throw stErr;
        const stageIds = (stages ?? []).map((s: { id: string }) => s.id);
        if (stageIds.length === 0) return jsonSuccess({ count: 0, empty: true });
        const { count, error } = await supabase
          .from("pipeline_candidates")
          .select("id", { count: "exact", head: true })
          .in("stage_id", stageIds)
          .not("interview_scheduled_at", "is", null)
          .lte("interview_scheduled_at", horizon);
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "fn-offers-queue": {
        if (!hasRole(ctx, "finance")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ count: 0, empty: true });
        // "In flight" means still moving. This counted every offer the org had
        // ever made — accepted, declined and expired included — so the finance
        // seat's headline number only ever went up, and never described a queue
        // anybody could work.
        const { count, error } = await supabase
          .from("offers")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", orgId)
          .in("status", OFFERS_IN_FLIGHT);
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "fn-open-jobs": {
        if (!hasRole(ctx, "finance")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ count: 0, empty: true });
        const { count, error } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", orgId)
          .eq("status", "open");
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "em-referrals": {
        if (!hasRole(ctx, "employee")) return jsonError("Forbidden", 403);
        const { count, error } = await supabase
          .from("employee_referrals")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", ctx.userId);
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "em-open-roles": {
        if (!hasRole(ctx, "employee")) return jsonError("Forbidden", 403);
        if (!orgId) return jsonSuccess({ count: 0, empty: true });
        const { count, error } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", orgId)
          .eq("status", "open");
        if (error) throw error;
        const n = count ?? 0;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "pd-hiring-velocity": {
        if (!isPlanDocumentNavActive()) return jsonError("Not enabled", 404);
        if (!hasRole(ctx, "leadership", "recruiter", "hiring_manager")) {
          return jsonError("Forbidden", 403);
        }
        if (!orgId) return jsonSuccess({ avgDays: null, planCount: 0 });
        const { data: plans } = await supabase
          .from("recruitment_plans")
          .select("activated_at")
          .eq("organisation_id", orgId)
          .eq("status", "active")
          .not("activated_at", "is", null);
        const rows = plans ?? [];
        if (rows.length === 0) return jsonSuccess({ avgDays: null, planCount: 0 });
        const now = Date.now();
        const totalDays = rows.reduce((sum, p) => {
          const t = new Date((p as { activated_at: string }).activated_at).getTime();
          return sum + (now - t) / 86400000;
        }, 0);
        return jsonSuccess({
          avgDays: totalDays / rows.length,
          planCount: rows.length,
        });
      }
      case "pd-pipeline-health": {
        if (!isPlanDocumentNavActive()) return jsonError("Not enabled", 404);
        if (!hasRole(ctx, "leadership", "recruiter", "hiring_manager")) {
          return jsonError("Forbidden", 403);
        }
        if (!orgId) return jsonSuccess({ stages: [], empty: true });
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id")
          .eq("organisation_id", orgId);
        const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
        if (jobIds.length === 0) return jsonSuccess({ stages: [], empty: true });
        const { data: rows } = await supabase
          .from("pipeline_candidates")
          .select("pipeline_stages(stage_name)")
          .in("job_id", jobIds)
          .neq("status", "rejected");
        const counts = new Map<string, number>();
        for (const row of rows ?? []) {
          const stage = (row as { pipeline_stages: { stage_name?: string } | null })
            .pipeline_stages;
          const name = stage?.stage_name ?? "Unknown";
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        const stages = [...counts.entries()]
          .map(([stage, count]) => ({ stage, count }))
          .sort((a, b) => b.count - a.count);
        return jsonSuccess({ stages, empty: stages.length === 0 });
      }
      case "pd-pending-actions": {
        if (!isPlanDocumentNavActive()) return jsonError("Not enabled", 404);
        if (!hasRole(ctx, "leadership", "recruiter", "hiring_manager")) {
          return jsonError("Forbidden", 403);
        }
        if (!orgId) return jsonSuccess({ count: 0, empty: true });
        const admin = createSupabaseAdmin();
        const { tasks, meta } = await listActionableTasksForUser(supabase, admin, ctx, {
          organisationId: orgId,
          userId: ctx.userId,
          role: ctx.role,
        });
        const n = meta.total;
        return jsonSuccess({ count: n, empty: n === 0 });
      }
      case "pd-time-to-hire": {
        if (!isPlanDocumentNavActive()) return jsonError("Not enabled", 404);
        if (!hasRole(ctx, "leadership", "recruiter", "hiring_manager")) {
          return jsonError("Forbidden", 403);
        }
        if (!orgId) return jsonSuccess({ weeks: [], empty: true });
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id")
          .eq("organisation_id", orgId);
        const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
        const weeks: Array<{ label: string; days: number | null }> = [];
        for (let i = 3; i >= 0; i--) {
          const end = new Date();
          end.setDate(end.getDate() - i * 7);
          const start = new Date(end);
          start.setDate(start.getDate() - 7);
          let label = `W${4 - i}`;
          if (jobIds.length === 0) {
            weeks.push({ label, days: null });
            continue;
          }
          // pipeline_candidates has no `updated_at`. Naming it made PostgREST
          // reject the select, so this tile has been computing time-to-hire
          // from an empty result set. `hired_at` is not a rename — it is the
          // column that actually means "when the hire happened", which is what
          // both the window filter and the elapsed-days figure want.
          const { data: hired } = await supabase
            .from("pipeline_candidates")
            .select("created_at, hired_at")
            .in("job_id", jobIds)
            .eq("status", "hired")
            .gte("hired_at", start.toISOString())
            .lt("hired_at", end.toISOString());
          const rows = hired ?? [];
          if (rows.length === 0) {
            weeks.push({ label, days: null });
            continue;
          }
          const avg =
            rows.reduce((sum, r) => {
              const created = new Date((r as { created_at: string }).created_at).getTime();
              const hiredAt = new Date((r as { hired_at: string }).hired_at).getTime();
              return sum + (hiredAt - created) / 86400000;
            }, 0) / rows.length;
          weeks.push({ label, days: Math.round(avg) });
        }
        return jsonSuccess({
          weeks,
          empty: weeks.every((w) => w.days == null),
        });
      }
      default:
        return jsonError("Unknown tile", 404);
    }
  } catch (err) {
    logger.error("home tiles error", { tile, error: String(err), userId: ctx.userId });
    return jsonError("Failed to load tile", 500);
  }
}
