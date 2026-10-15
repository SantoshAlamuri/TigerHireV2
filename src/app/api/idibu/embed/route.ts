import { NextRequest } from "next/server";
import { getAuthContext, requireAuth, hasRole, jsonError, handleApiError } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getIdibuCredentials, isIdibuPostingReady } from "@/lib/integrations/idibu/credentials";
import {
  buildIdibuPostFrameFields,
  renderIdibuAutoSubmitHtml,
} from "@/lib/integrations/idibu/post-frame";

/**
 * GET /api/idibu/embed?jobId=
 * Returns an auto-submit HTML form POSTing to idibu (secret stays server-side).
 * Loaded inside an iframe on the job detail page.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "recruiter", "leadership", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const jobId = request.nextUrl.searchParams.get("jobId")?.trim();
    if (!jobId) {
      return jsonError("jobId is required", 400);
    }

    const admin = createSupabaseAdmin();
    const { data: job } = await admin
      .from("jobs")
      .select("id, organisation_id")
      .eq("id", jobId)
      .maybeSingle();

    if (!job) return jsonError("Job not found", 404);

    const organisationId = job.organisation_id as string;
    const idibuCreds = await getIdibuCredentials(organisationId);
    if (!isIdibuPostingReady(idibuCreds)) {
      return jsonError("Idibu not configured for this organisation", 501);
    }

    if (hasRole(ctx, "recruiter", "leadership", "hiring_manager")) {
      if (ctx.organisationId !== job.organisation_id) {
        return jsonError("Forbidden", 403);
      }
    }

    if (hasRole(ctx, "agency")) {
      const { data: links } = await supabase
        .from("agency_clients")
        .select("client_organisation_id")
        .eq("agency_organisation_id", ctx.organisationId);
      const clientIds = (links ?? []).map(
        (r: { client_organisation_id: string }) => r.client_organisation_id,
      );
      if (!clientIds.includes(job.organisation_id as string)) {
        return jsonError("Forbidden", 403);
      }
    }

    const { data: authUser } = await supabase.auth.getUser();
    const recruiterEmail = authUser.user?.email?.trim();
    if (!recruiterEmail) {
      return jsonError("Recruiter email required", 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();

    const fields = await buildIdibuPostFrameFields(
      admin,
      {
        jobId,
        recruiterUserId: ctx.userId,
        recruiterEmail,
        recruiterFullName: (profile?.full_name as string | null) ?? null,
      },
      idibuCreds!,
    );

    const html = renderIdibuAutoSubmitHtml(fields, idibuCreds!.integration_name);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "jd_base_not_approved") {
        return jsonError("Ideal Profile must be approved before posting to job boards", 428);
      }
      if (err.message === "job_not_found") {
        return jsonError("Job not found", 404);
      }
      if (err.message === "idibu_not_configured") {
        return jsonError("Idibu not configured", 501);
      }
    }
    return handleApiError(err, "Idibu embed failed", { route: "GET /api/idibu/embed" });
  }
}
