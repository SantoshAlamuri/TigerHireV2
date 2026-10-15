import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeSections, toLegacyView } from "@/lib/jobs/normalize-sections";

const BASE_URL = "https://tigerhire.io";

/**
 * GET /api/jobs/feed.xml
 * Public XML job feed — no auth. Returns all active (open) jobs for aggregators.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, title, description, location, compensation_min, compensation_max, created_at, show_salary, jd_sections, organisation_id, organisations!jobs_organisation_id_fkey(name, slug)",
    )
    .eq("status", "open")
    .eq("list_on_public_job_board", true)
    .order("created_at", { ascending: false });

  if (error) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><jobs><error>${escapeXml(String(error.message))}</error></jobs>`,
      {
        status: 500,
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  }

  const rows = (jobs ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    compensation_min: number | null;
    compensation_max: number | null;
    created_at: string;
    show_salary: boolean | null;
    jd_sections: Record<string, unknown> | null;
    organisation_id: string;
    organisations: { name?: string; slug?: string } | null;
  }>;

  const jobNodes = rows.map((job) => {
    const org = job.organisations;
    const orgName = (org && typeof org === "object" && "name" in org ? org.name : "") ?? "";
    const orgSlug = (org && typeof org === "object" && "slug" in org ? org.slug : "") ?? "";
    const legacy = job.jd_sections ? toLegacyView(normalizeSections(job.jd_sections)) : {};
    const description =
      (typeof legacy.summary === "string" ? legacy.summary : job.description) ?? "";
    const location = (typeof legacy.location === "string" ? legacy.location : job.location) ?? "";
    const employmentType = typeof legacy.employmentType === "string" ? legacy.employmentType : "";
    const experienceRange =
      typeof legacy.experienceRange === "string" ? legacy.experienceRange : "";
    const applyUrl = orgSlug
      ? `${BASE_URL}/apply/${orgSlug}?job=${job.id}`
      : `${BASE_URL}/apply?job=${job.id}`;
    const showSalary = job.show_salary === true;

    let xml = `<job>
    <id>${escapeXml(String(job.id))}</id>
    <title>${escapeXml(job.title)}</title>
    <company>${escapeXml(orgName)}</company>
    <location>${escapeXml(location)}</location>
    <job_type>${escapeXml(employmentType)}</job_type>
    <experience>${escapeXml(experienceRange)}</experience>
    <description><![CDATA[${description}]]></description>
    <apply_url>${escapeXml(applyUrl)}</apply_url>
    <posted_at>${escapeXml(job.created_at)}</posted_at>`;
    if (showSalary) {
      const min = job.compensation_min != null ? String(job.compensation_min) : "";
      const max = job.compensation_max != null ? String(job.compensation_max) : "";
      xml += `\n    <salary_min>${escapeXml(min)}</salary_min>
    <salary_max>${escapeXml(max)}</salary_max>`;
    }
    xml += `\n  </job>`;
    return xml;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<jobs>
${jobNodes.map((n) => "  " + n).join("\n")}
</jobs>`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
