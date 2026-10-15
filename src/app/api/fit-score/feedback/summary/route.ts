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
import { assertJobAccess } from "@/lib/job-access";
import { FEEDBACK_SIGNAL_THRESHOLD } from "@/lib/fitscore/constants";

const ALLOWED_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "hiring_manager",
  "agency",
] as const;

function parseDate(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ALLOWED_ROLES)) return jsonError("Forbidden", 403);

    const jobId = request.nextUrl.searchParams.get("jobId");
    const from = parseDate(request.nextUrl.searchParams.get("from"));
    const to = parseDate(request.nextUrl.searchParams.get("to"));
    if (
      (request.nextUrl.searchParams.get("from") && !from) ||
      (request.nextUrl.searchParams.get("to") && !to)
    ) {
      return jsonError("Invalid from/to datetime format", 400);
    }

    const supabase = await createSupabaseServerClient();
    if (jobId) {
      const { job } = await assertJobAccess(supabase, ctx, jobId);
      if (!job) return jsonError("Job not found", 404);
    }

    let outcomesQ = supabase
      .from("hiring_outcomes")
      .select(
        "outcome, accuracy_signal, scoring_version, fit_score_value, feedback_reason, created_at, recorded_at, jobs!inner(role_function)",
      );
    let actionsQ = supabase
      .from("pipeline_action_signals")
      .select("action, scoring_version, fit_score_value, created_at, jobs!inner(role_function)");

    if (!hasRole(ctx, "super_admin")) {
      outcomesQ = outcomesQ.eq("organisation_id", ctx.organisationId!);
      actionsQ = actionsQ.eq("organisation_id", ctx.organisationId!);
    } else if (ctx.organisationId) {
      outcomesQ = outcomesQ.eq("organisation_id", ctx.organisationId);
      actionsQ = actionsQ.eq("organisation_id", ctx.organisationId);
    }
    if (jobId) {
      outcomesQ = outcomesQ.eq("job_id", jobId);
      actionsQ = actionsQ.eq("job_id", jobId);
    }
    if (from) {
      outcomesQ = outcomesQ.gte("created_at", from);
      actionsQ = actionsQ.gte("created_at", from);
    }
    if (to) {
      outcomesQ = outcomesQ.lte("created_at", to);
      actionsQ = actionsQ.lte("created_at", to);
    }

    const [{ data: outcomes }, { data: actions }] = await Promise.all([outcomesQ, actionsQ]);

    type FamilyBucket = {
      feedbackCount: number;
      accuracy: { accurate: number; too_high: number; too_low: number };
      reasons: Record<string, number>;
      hiredScores: number[];
      rejectedScores: number[];
      scoringVersionBreakdown: Record<string, number>;
    };
    const families = new Map<string, FamilyBucket>();
    const getFamily = (roleFamily: string): FamilyBucket => {
      const existing = families.get(roleFamily);
      if (existing) return existing;
      const created: FamilyBucket = {
        feedbackCount: 0,
        accuracy: { accurate: 0, too_high: 0, too_low: 0 },
        reasons: {},
        hiredScores: [],
        rejectedScores: [],
        scoringVersionBreakdown: {},
      };
      families.set(roleFamily, created);
      return created;
    };

    for (const row of outcomes ?? []) {
      const roleFamily =
        ((row.jobs as { role_function?: string } | null)?.role_function ?? "unknown").trim() ||
        "unknown";
      const family = getFamily(roleFamily);
      const scoringVersion = String(Number(row.scoring_version ?? 1));
      family.scoringVersionBreakdown[scoringVersion] =
        (family.scoringVersionBreakdown[scoringVersion] ?? 0) + 1;

      const accuracy = String(row.accuracy_signal ?? "");
      if (accuracy === "accurate" || accuracy === "too_high" || accuracy === "too_low") {
        family.feedbackCount += 1;
        family.accuracy[accuracy] += 1;
      }
      const reason = String(row.feedback_reason ?? "");
      if (reason) family.reasons[reason] = (family.reasons[reason] ?? 0) + 1;

      const score =
        row.fit_score_value != null && Number.isFinite(Number(row.fit_score_value))
          ? Number(row.fit_score_value)
          : null;
      const outcome = String(row.outcome ?? "");
      if (score != null && outcome === "hired") family.hiredScores.push(score);
      if (score != null && outcome === "rejected") family.rejectedScores.push(score);
    }

    for (const row of actions ?? []) {
      const roleFamily =
        ((row.jobs as { role_function?: string } | null)?.role_function ?? "unknown").trim() ||
        "unknown";
      const family = getFamily(roleFamily);
      const scoringVersion = String(Number(row.scoring_version ?? 1));
      family.scoringVersionBreakdown[scoringVersion] =
        (family.scoringVersionBreakdown[scoringVersion] ?? 0) + 1;
    }

    const roleFamilies = [...families.entries()]
      .map(([role_family, family]) => {
        if (family.feedbackCount < FEEDBACK_SIGNAL_THRESHOLD) {
          return {
            role_family,
            status: "accumulating" as const,
            feedback_count: family.feedbackCount,
            threshold: FEEDBACK_SIGNAL_THRESHOLD,
            message: "Insufficient signals for reliable accuracy data",
          };
        }

        const accuracyRate = family.feedbackCount
          ? family.accuracy.accurate / family.feedbackCount
          : 0;
        const tooHighRate = family.feedbackCount
          ? family.accuracy.too_high / family.feedbackCount
          : 0;
        const tooLowRate = family.feedbackCount
          ? family.accuracy.too_low / family.feedbackCount
          : 0;
        const top_reasons = Object.entries(family.reasons)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([reason]) => reason);
        const avg = (arr: number[]) =>
          arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;

        return {
          role_family,
          status: "active" as const,
          feedback_count: family.feedbackCount,
          accuracy_rate: Number(accuracyRate.toFixed(4)),
          too_high_rate: Number(tooHighRate.toFixed(4)),
          too_low_rate: Number(tooLowRate.toFixed(4)),
          top_reasons,
          avg_score_hired: avg(family.hiredScores),
          avg_score_rejected: avg(family.rejectedScores),
          scoring_version_breakdown: family.scoringVersionBreakdown,
        };
      })
      .sort((a, b) => a.role_family.localeCompare(b.role_family));

    return jsonSuccess({
      threshold: FEEDBACK_SIGNAL_THRESHOLD,
      role_families: roleFamilies,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load hiring outcomes feedback summary", {
      route: "GET /api/fit-score/feedback/summary",
    });
  }
}
