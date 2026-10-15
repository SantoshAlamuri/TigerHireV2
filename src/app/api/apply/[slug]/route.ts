import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { OrganisationRepository } from "@/lib/repositories/OrganisationRepository";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { fetchActiveScreeningQuestions, toPublicQuestions } from "@/lib/screening/job-screening";
import { getPublicReapplyPolicyPayload } from "@/lib/applications/cooling-off";

type ApplyOrg = Awaited<ReturnType<typeof OrganisationRepository.getBySlug>>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit({
    key: `apply-slug:${ip}`,
    limit: 60,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const { slug } = await params;
  const jobId = new URL(request.url).searchParams.get("job");
  const supabase = createSupabaseAdmin();

  let org: ApplyOrg = await OrganisationRepository.getBySlug(supabase, slug);
  if (!org && jobId) {
    const { data: jobOrg } = await supabase
      .from("jobs")
      .select(
        "organisation_id, organisations!jobs_organisation_id_fkey(id, type, name, slug, approval, company_plan, stripe_customer_id, created_at, updated_at)",
      )
      .eq("id", jobId)
      .eq("status", "open")
      .eq("list_on_public_job_board", true)
      .eq("is_active", true)
      .maybeSingle();
    const linkedOrg = Array.isArray((jobOrg as { organisations?: unknown } | null)?.organisations)
      ? ((jobOrg as { organisations?: Record<string, unknown>[] } | null)?.organisations?.[0] ??
        null)
      : ((jobOrg as { organisations?: Record<string, unknown> | null } | null)?.organisations ??
        null);
    if (linkedOrg && typeof linkedOrg.slug === "string" && linkedOrg.slug === slug) {
      org = linkedOrg as NonNullable<ApplyOrg>;
    }
  }
  if (!org) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, location, show_salary, compensation_min, compensation_max, created_at")
    .eq("organisation_id", org.id)
    .eq("status", "open")
    .eq("list_on_public_job_board", true)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(50);

  let screeningQuestions: ReturnType<typeof toPublicQuestions> = [];
  if (jobId) {
    const inList = (jobs ?? []).some((j) => (j as { id: string }).id === jobId);
    if (inList) {
      try {
        const rows = await fetchActiveScreeningQuestions(supabase, jobId, org.id);
        screeningQuestions = toPublicQuestions(rows);
      } catch {
        screeningQuestions = [];
      }
    }
  }

  return NextResponse.json({
    organisation: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
    jobs: (jobs ?? []).map(({ show_salary, ...job }) => ({
      ...job,
      compensation_min: show_salary === true ? job.compensation_min : null,
      compensation_max: show_salary === true ? job.compensation_max : null,
    })),
    screeningQuestions,
    reapplyPolicy: getPublicReapplyPolicyPayload(),
  });
}
