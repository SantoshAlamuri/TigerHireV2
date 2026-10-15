import { NextRequest } from "next/server";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/config/env";

/**
 * GET /api/jobs/[id]/public
 * Returns job details for open jobs only. No auth required — used for shareable JD links.
 *
 * Only PUBLIC-SAFE columns are selected: internal fields (cost_center, budget,
 * band_id, skills_rubric, assigned recruiter / hiring manager, urgency, created_by)
 * must never leak to anonymous callers. Compensation is nulled unless `show_salary`.
 */
const PUBLIC_JOB_COLUMNS =
  "id, title, description, location, status, role_function, seniority_level, remote_allowed, skills_required, skills_preferred, jd_sections, source, source_url, source_job_id, created_at, updated_at, organisation_id, show_salary, compensation_min, compensation_max, tier, role_category, city, posted_at, organisations!jobs_organisation_id_fkey(name, slug), hiring_requests!jobs_hiring_request_id_fkey(must_haves, nice_to_haves)";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Anonymous visitors have no JWT; service role + explicit public filters mirror GET /api/jobs/public.
    const supabase = createSupabaseAdmin();

    const { data: job, error } = await supabase
      .from("jobs")
      .select(PUBLIC_JOB_COLUMNS)
      .eq("id", id)
      .eq("status", "open")
      .eq("list_on_public_job_board", true)
      .eq("is_active", true)
      .single();

    if (error || !job) return jsonError("Job not found", 404);

    const hiddenOrgSlugs = env.hiddenPublicJobOrgSlugs;
    if (hiddenOrgSlugs.length > 0) {
      const orgObj = Array.isArray((job as Record<string, unknown>).organisations)
        ? ((job as Record<string, unknown>).organisations as Record<string, unknown>[])[0]
        : ((job as Record<string, unknown>).organisations as Record<string, unknown> | undefined);
      const slug = typeof orgObj?.slug === "string" ? orgObj.slug : null;
      if (slug && hiddenOrgSlugs.includes(slug)) {
        return jsonError("Job not found", 404);
      }
    }

    // Honor the recruiter's salary-visibility choice on the public link.
    const publicJob = job as Record<string, unknown>;
    if (publicJob.show_salary !== true) {
      publicJob.compensation_min = null;
      publicJob.compensation_max = null;
    }

    return jsonSuccess({ job: publicJob });
  } catch (err) {
    return handleApiError(err, "Failed to fetch job", {
      route: "GET /api/jobs/[id]/public",
    });
  }
}
