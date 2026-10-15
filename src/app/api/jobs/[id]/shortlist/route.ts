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
import { createNotificationBatch } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/jobs/[id]/shortlist
 * Returns FitScore-ranked candidates for a specific job.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job: accessedJob } = await assertJobAccess(supabase, ctx, jobId);
    if (!accessedJob) return jsonError("Job not found", 404);

    const { searchParams } = request.nextUrl;
    const minScore = parseInt(searchParams.get("minScore") ?? "0", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "25", 10), 100);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const verifiedOnly = searchParams.get("verifiedOnly") === "true";
    const offset = (page - 1) * limit;

    const { data: job } = await supabase
      .from("jobs")
      .select("id, organisation_id, hiring_manager_id, title, shortlist_delivered_at")
      .eq("id", jobId)
      .single();

    if (!job) return jsonError("Job not found", 404);

    if (!job.shortlist_delivered_at && page === 1) {
      await supabase
        .from("jobs")
        .update({
          shortlist_delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      // Notify HM + recruiters that shortlist is ready
      const notifyIds: string[] = [];
      if (job.hiring_manager_id) notifyIds.push(job.hiring_manager_id);
      const { data: orgRecruiters } = await supabase
        .from("profiles")
        .select("id")
        .eq("organisation_id", job.organisation_id)
        .in("role", ["recruiter", "leadership"]);
      if (orgRecruiters) {
        for (const r of orgRecruiters) {
          if (!notifyIds.includes(r.id) && r.id !== ctx.userId) notifyIds.push(r.id);
        }
      }
      await createNotificationBatch(notifyIds, {
        type: "shortlist_ready",
        title: `Shortlist ready: ${job.title}`,
        body: "FitScore-ranked candidates are now available for review.",
        link: `/company/jobs/${jobId}`,
      });
    }

    if (hasRole(ctx, "hiring_manager")) {
      if (job.hiring_manager_id !== ctx.userId) return jsonError("Forbidden", 403);
    } else if (!hasRole(ctx, "super_admin") && job.organisation_id !== ctx.organisationId) {
      return jsonError("Forbidden", 403);
    }

    let query = supabase
      .from("fit_scores")
      .select("*, candidates(id, name, skills, experience_years, location, intent_score)", {
        count: "exact",
      })
      .eq("job_id", jobId)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .is("superseded_at", null)
      .gte("overall_score", minScore)
      .order("overall_score", { ascending: false })
      .range(offset, offset + limit - 1);

    if (verifiedOnly) {
      // Fetch verified candidate ids only among those with fit_scores for this job (avoids scanning all verifications)
      const { data: jobCandidateIds } = await supabase
        .from("fit_scores")
        .select("candidate_id")
        .eq("job_id", jobId)
        .or("is_test_run.eq.false,is_test_run.is.null")
        .is("superseded_at", null);
      const cids = [...new Set((jobCandidateIds ?? []).map((r) => r.candidate_id))];
      if (cids.length === 0) {
        return jsonSuccess({
          job: { id: job.id, title: job.title },
          shortlist: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        });
      }
      const { data: verifiedRows } = await supabase
        .from("verifications")
        .select("candidate_id")
        .in("candidate_id", cids)
        .in("badge", ["gold", "silver"]);
      const verifiedIds = [...new Set((verifiedRows ?? []).map((r) => r.candidate_id))];
      if (verifiedIds.length === 0) {
        return jsonSuccess({
          job: { id: job.id, title: job.title },
          shortlist: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        });
      }
      query = query.in("candidate_id", verifiedIds);
    }

    const { data: scores, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch shortlist", { error: String(error) });
      return jsonError("Failed to fetch shortlist", 500);
    }

    // Check which candidates are unlocked
    const candidateIds = scores?.map((s) => s.candidate_id) ?? [];
    const { data: unlocks } = await supabase
      .from("candidate_unlocks")
      .select("candidate_id")
      .eq("organisation_id", ctx.organisationId!)
      .in("candidate_id", candidateIds);

    const unlockedSet = new Set(unlocks?.map((u) => u.candidate_id) ?? []);

    const shortlist = scores?.map((score) => {
      const isUnlocked = unlockedSet.has(score.candidate_id);
      const candidate = score.candidates as Record<string, unknown> | null;

      if (candidate && !isUnlocked) {
        const name = candidate.name as string | null;
        if (name) {
          const parts = name.split(" ");
          candidate.name = parts[0] + (parts.length > 1 ? ` ${parts[1][0]}.` : "");
        }
      }

      return {
        ...score,
        candidates: candidate,
        isUnlocked,
      };
    });

    return jsonSuccess({
      job: { id: job.id, title: job.title },
      shortlist,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch shortlist", {
      route: "GET /api/jobs/[id]/shortlist",
    });
  }
}
