import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";
import { getAuthContext, hasRole } from "@/lib/api-helpers";

type JobRow = {
  id: string;
  title: string;
  organisation_id: string;
  location: string | null;
  created_at: string;
  list_on_public_job_board: boolean;
  list_for_internal_referrals: boolean;
  organisations: { name: string; slug: string } | { name: string; slug: string }[] | null;
  job_referral_config:
    | { direct_bonus_amount: number | string; parent_bonus_amount: number | string }
    | { direct_bonus_amount: number | string; parent_bonus_amount: number | string }[]
    | null;
};

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * GET /api/refer/jobs/open — open roles for referral link pickers.
 * - Logged-in users tied to an organisation (employee, leadership, recruiter, etc.):
 *   only that organisation's open jobs — never other companies' roles.
 * - Agency users: public job board only (org-wide client jobs are not exposed here).
 * - Anonymous / no org context: only jobs allowed on the public job board.
 */
export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit({
    key: `refer-jobs-open:${ip}`,
    limit: 60,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const supabase = createSupabaseAdmin();
  const ctx = await getAuthContext();

  /** Any product role with an org id should never see another tenant's jobs (campaigns, admin UI, etc.). */
  const organisationScopedCatalog =
    !!ctx?.organisationId &&
    !hasRole(ctx, "agency") &&
    (hasRole(ctx, "employee") ||
      hasRole(ctx, "leadership") ||
      hasRole(ctx, "recruiter") ||
      hasRole(ctx, "hiring_manager") ||
      hasRole(ctx, "finance") ||
      hasRole(ctx, "interviewer") ||
      hasRole(ctx, "super_admin"));

  const hiddenOrgSlugs = env.hiddenPublicJobOrgSlugs;
  let hiddenOrgIds: string[] = [];
  if (hiddenOrgSlugs.length > 0) {
    const { data: hiddenOrgs } = await supabase
      .from("organisations")
      .select("id")
      .in("slug", hiddenOrgSlugs);
    hiddenOrgIds = (hiddenOrgs ?? []).map((o) => o.id as string).filter(Boolean);
  }

  let jobsQuery = supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      organisation_id,
      location,
      created_at,
      list_on_public_job_board,
      list_for_internal_referrals,
      organisations!jobs_organisation_id_fkey ( name, slug ),
      job_referral_config ( direct_bonus_amount, parent_bonus_amount )
    `,
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  if (organisationScopedCatalog) {
    jobsQuery = jobsQuery.eq("organisation_id", ctx!.organisationId as string);
  } else {
    jobsQuery = jobsQuery.eq("list_on_public_job_board", true);
  }

  const { data: raw, error } = await jobsQuery;

  const visibleRaw = organisationScopedCatalog
    ? hasRole(ctx!, "employee")
      ? (raw ?? []).filter((row) => {
          const r = row as {
            list_on_public_job_board?: boolean | null;
            list_for_internal_referrals?: boolean | null;
          };
          const pub = r.list_on_public_job_board !== false;
          const intr = r.list_for_internal_referrals !== false;
          // Internal-only (IJP) roles should not appear in referral-share pickers.
          return !(intr && !pub);
        })
      : (raw ?? [])
    : hiddenOrgIds.length > 0
      ? (raw ?? []).filter((row) => {
          const r = row as { organisation_id?: string | null };
          return !r.organisation_id || !hiddenOrgIds.includes(r.organisation_id);
        })
      : (raw ?? []);

  if (error) {
    return NextResponse.json({ error: "Could not load jobs." }, { status: 500 });
  }

  const jobs = visibleRaw.map((row: JobRow) => {
    const org = unwrapOne(row.organisations);
    const cfg = unwrapOne(row.job_referral_config);
    const directBonusRaw = cfg?.direct_bonus_amount;
    const parentBonusRaw = cfg?.parent_bonus_amount;
    const direct_bonus_amount =
      directBonusRaw === null || directBonusRaw === undefined
        ? 0
        : typeof directBonusRaw === "string"
          ? Number(directBonusRaw)
          : directBonusRaw;
    const parent_bonus_amount =
      parentBonusRaw === null || parentBonusRaw === undefined
        ? 0
        : typeof parentBonusRaw === "string"
          ? Number(parentBonusRaw)
          : parentBonusRaw;
    return {
      id: row.id,
      title: row.title,
      organisation_name: org?.name ?? "Employer",
      organisation_slug: org?.slug ?? "",
      location: row.location,
      direct_bonus_amount: Number.isFinite(direct_bonus_amount) ? direct_bonus_amount : 0,
      parent_bonus_amount: Number.isFinite(parent_bonus_amount) ? parent_bonus_amount : 0,
    };
  });

  return NextResponse.json(
    { jobs },
    {
      headers: {
        "Cache-Control": organisationScopedCatalog ? "private, max-age=30" : "public, max-age=60",
        Vary: "Cookie",
      },
    },
  );
}
