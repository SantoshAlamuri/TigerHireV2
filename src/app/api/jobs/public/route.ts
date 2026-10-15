import { NextRequest, NextResponse } from "next/server";
import { jsonError, handleZodError, handleApiError } from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { publicJobListQuerySchema } from "@/lib/validations/jobs";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { withCorrelation } from "@/lib/observability/with-correlation";
import { withRouteSpan } from "@/lib/observability/route-span";
import { env } from "@/lib/config/env";
import type { JobTier, RoleCategory } from "@/lib/jobs/types";

/**
 * GET /api/jobs/public
 * Open roles only, no auth — powers the public job board and SEO-friendly browsing.
 */
export const GET = withCorrelation(async (request: NextRequest) =>
  withRouteSpan("GET /api/jobs/public", async () => {
    try {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const rl = await checkRateLimit({
        key: `jobs:public-list:${ip}`,
        limit: 60,
        windowSecs: 60,
      });
      if (!rl.allowed) {
        return jsonError("Too many requests, please try again shortly", 429);
      }

      const params = Object.fromEntries(request.nextUrl.searchParams);
      const parsed = publicJobListQuerySchema.safeParse(params);
      if (!parsed.success) return handleZodError(parsed.error);

      const { role, city, tier, cursor, limit } = parsed.data;
      // Public job board is intentionally unauthenticated; use service-role so RLS policies
      // that depend on authenticated context do not block anonymous visitors.
      // Response is still constrained to explicitly public listings only.
      const supabase = createSupabaseAdmin();
      const hiddenOrgSlugs = env.hiddenPublicJobOrgSlugs;
      let hiddenOrgIds: string[] = [];
      if (hiddenOrgSlugs.length > 0) {
        const { data: hiddenOrgs } = await supabase
          .from("organisations")
          .select("id")
          .in("slug", hiddenOrgSlugs);
        hiddenOrgIds = (hiddenOrgs ?? []).map((o) => o.id as string).filter(Boolean);
      }

      let query = supabase
        .from("jobs")
        .select(
          "id, title, description, location, status, compensation_min, compensation_max, created_at, updated_at, organisation_id, show_salary, role_function, seniority_level, skills_required, skills_preferred, remote_allowed, jd_sections, organisations!jobs_organisation_id_fkey(name, slug), source, source_url, source_job_id, tier, role_category, city, posted_at, is_active",
        )
        .eq("status", "open")
        .eq("list_on_public_job_board", true)
        .eq("is_active", true)
        .limit(400);

      if (hiddenOrgIds.length > 0) {
        query = query.not("organisation_id", "in", `(${hiddenOrgIds.join(",")})`);
      }

      const { data: rows, error } = await query.order("posted_at", {
        ascending: false,
        nullsFirst: false,
      });

      if (error) throw error;

      const mapped = (rows ?? []).map((row) => mapPublicJob(row as Record<string, unknown>));
      const roleCityFiltered = mapped.filter((job) => {
        const roleMatch = role === "all" ? true : job.role_category === role;
        const cityMatch = city === "all" ? true : job.city === city;
        return roleMatch && cityMatch;
      });

      const counts = {
        native: roleCityFiltered.filter((job) => job.tier === "native").length,
        aggregated: roleCityFiltered.filter((job) => job.tier === "aggregated").length,
      };

      let filtered = roleCityFiltered;
      if (tier === "native") {
        filtered = filtered.filter((job) => job.tier === "native");
      }

      filtered.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier === "native" ? -1 : 1;
        return (
          new Date(b.posted_at ?? b.created_at).getTime() -
          new Date(a.posted_at ?? a.created_at).getTime()
        );
      });

      if (cursor) {
        const cursorTime = new Date(cursor).getTime();
        if (!Number.isNaN(cursorTime)) {
          filtered = filtered.filter((job) => {
            const rowTime = new Date(job.posted_at ?? job.created_at).getTime();
            return rowTime < cursorTime;
          });
        }
      }

      const jobs = filtered.slice(0, limit);
      const nextCursor =
        filtered.length > limit ? (jobs[jobs.length - 1]?.posted_at ?? null) : null;

      const body = {
        jobs,
        nextCursor,
        counts,
      };

      return NextResponse.json(body, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      });
    } catch (err) {
      return handleApiError(err, "Failed to fetch jobs", {
        route: "GET /api/jobs/public",
      });
    }
  }),
);

function mapPublicJob(row: Record<string, unknown>) {
  const tier = ((row.tier as JobTier | undefined) ?? "native") as JobTier;
  const roleCategory = resolveRoleCategory(row);
  const city = resolveCity(row.location as string | null, row.city as string | null);
  const orgObj = Array.isArray(row.organisations)
    ? (row.organisations[0] as Record<string, unknown> | undefined)
    : ((row.organisations as Record<string, unknown> | undefined) ?? undefined);
  const jd = (row.jd_sections as Record<string, unknown> | null) ?? null;
  const externalCompany =
    jd && typeof jd.external_company === "string" ? (jd.external_company as string) : null;

  return {
    id: row.id as string,
    title: (row.title as string) ?? "",
    company:
      tier === "aggregated"
        ? (externalCompany ?? "External employer")
        : ((orgObj?.name as string) ?? "Company"),
    city,
    tier,
    source: ((row.source as string) ?? "tigerhire") as string,
    source_url: (row.source_url as string | null) ?? null,
    posted_at: (row.posted_at as string | null) ?? (row.created_at as string | null),
    created_at: (row.created_at as string | null) ?? new Date().toISOString(),
    description: (row.description as string) ?? "",
    location: (row.location as string | null) ?? null,
    compensation_min: (row.compensation_min as number | null) ?? null,
    compensation_max: (row.compensation_max as number | null) ?? null,
    show_salary: row.show_salary === true,
    role_category: roleCategory,
    fit_score_mode: tier === "aggregated" ? "unavailable" : "native",
  };
}

function resolveRoleCategory(row: Record<string, unknown>): RoleCategory | null {
  const category = row.role_category;
  if (
    category === "backend" ||
    category === "frontend" ||
    category === "data_ml" ||
    category === "product" ||
    category === "devops" ||
    category === "design" ||
    category === "sales" ||
    category === "finance"
  ) {
    return category;
  }
  const roleFunction = String(row.role_function ?? "").toLowerCase();
  if (roleFunction.includes("engineer")) return "backend";
  if (roleFunction.includes("product")) return "product";
  if (roleFunction.includes("design")) return "design";
  if (roleFunction.includes("sales")) return "sales";
  if (roleFunction.includes("finance")) return "finance";
  return null;
}

function resolveCity(location: string | null, rowCity: string | null): string | null {
  if (rowCity) return rowCity;
  if (!location) return null;
  const value = location.toLowerCase();
  if (value.includes("bangalore") || value.includes("bengaluru")) return "bangalore";
  if (value.includes("delhi") || value.includes("gurgaon") || value.includes("noida"))
    return "delhi_ncr";
  if (value.includes("mumbai")) return "mumbai";
  if (value.includes("hyderabad")) return "hyderabad";
  if (value.includes("chennai")) return "chennai";
  if (value.includes("pune")) return "pune";
  if (value.includes("remote")) return "remote";
  return null;
}
