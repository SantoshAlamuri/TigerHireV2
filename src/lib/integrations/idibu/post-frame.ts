import type { SupabaseClient } from "@supabase/supabase-js";
import { getJdBaseByJobId } from "@/lib/fitscore/hybrid/jd-base";
import { buildJdText } from "@/lib/fitscore/job-text";
import type { IdibuCredentials } from "@/lib/integrations/idibu/credentials";
import { isIdibuPostingReady } from "@/lib/integrations/idibu/credentials";
import { mapRoleCategoryToIdibuSector } from "./sector-map";

export type IdibuPostFrameFields = Record<string, string>;

/** @deprecated Use isIdibuPostingReady(creds) after loading org credentials. */
export function isIdibuPostingConfigured(creds?: IdibuCredentials | null): boolean {
  return isIdibuPostingReady(creds ?? null);
}

function splitFullName(fullName: string | null | undefined): { fname: string; lname: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { fname: "Recruiter", lname: "User" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { fname: parts[0]!, lname: "" };
  return { fname: parts[0]!, lname: parts.slice(1).join(" ") };
}

function mapEmploymentTypeToIdibuType(employmentType: string | null | undefined): "1" | "2" {
  const t = (employmentType ?? "").toLowerCase();
  if (t.includes("contract") || t.includes("temp")) return "2";
  return "1";
}

async function buildJobDescription(
  supabase: SupabaseClient,
  job: {
    title: string;
    description: string;
    location?: string | null;
    compensation_min?: number | null;
    compensation_max?: number | null;
    skills_required?: string[] | null;
  },
  jobId: string,
): Promise<string> {
  const jdBase = await getJdBaseByJobId(supabase, jobId);
  if (jdBase?.approvedBy) {
    const parts = [
      jdBase.roleTitle,
      jdBase.company ? `Company: ${jdBase.company}` : null,
      jdBase.context,
    ].filter(Boolean);
    return parts.join("\n\n").trim() || buildJdText(job);
  }
  return buildJdText(job);
}

export async function buildIdibuPostFrameFields(
  supabase: SupabaseClient,
  params: {
    jobId: string;
    recruiterUserId: string;
    recruiterEmail: string;
    recruiterFullName: string | null;
  },
  credentials: IdibuCredentials,
): Promise<IdibuPostFrameFields> {
  if (!isIdibuPostingReady(credentials)) {
    throw new Error("idibu_not_configured");
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      // employment_type is not a column on jobs — it is captured on the
      // hiring request the job was raised from. Naming it on jobs rejected the
      // whole select, so idibu posting could never build a frame at all.
      "id, title, description, location, compensation_min, compensation_max, skills_required, role_category, hiring_requests!jobs_hiring_request_id_fkey(employment_type)",
    )
    .eq("id", params.jobId)
    .maybeSingle();

  if (jobErr || !job) {
    throw new Error("job_not_found");
  }

  const jdBase = await getJdBaseByJobId(supabase, params.jobId);
  if (!jdBase?.approvedBy) {
    throw new Error("jd_base_not_approved");
  }

  const description = await buildJobDescription(supabase, job, params.jobId);
  const { fname, lname } = splitFullName(params.recruiterFullName);
  const defaultSector = credentials.default_sector.trim() || "1";

  const fields: IdibuPostFrameFields = {
    id: credentials.app_id.trim(),
    secret: credentials.app_secret.trim(),
    vacancy: params.jobId,
    title: String(job.title ?? ""),
    description,
    userid: params.recruiterUserId,
    email: params.recruiterEmail,
    fname,
    lname,
    country: "IN",
    type: mapEmploymentTypeToIdibuType(
      (job.hiring_requests as { employment_type?: string | null } | null)?.employment_type ?? null,
    ),
    sector: mapRoleCategoryToIdibuSector(job.role_category as string | null, defaultSector),
    currency: "INR",
    kws: String(job.title ?? ""),
  };

  const minSalary = job.compensation_min as number | null;
  const maxSalary = job.compensation_max as number | null;
  if (minSalary != null && Number.isFinite(minSalary)) {
    fields.minsalary = String(Math.round(minSalary));
  }
  if (maxSalary != null && Number.isFinite(maxSalary)) {
    fields.maxsalary = String(Math.round(maxSalary));
  }

  return fields;
}

export function idibuIntegrationEndpoint(integrationName: string): string {
  const name = integrationName.trim();
  return `https://v3.idibu.com/c/integration/${encodeURIComponent(name)}`;
}

export function renderIdibuAutoSubmitHtml(
  fields: IdibuPostFrameFields,
  integrationName: string,
): string {
  const action = idibuIntegrationEndpoint(integrationName);
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtmlAttr(name)}" value="${escapeHtmlAttr(value)}" />`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Loading idibu…</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; color: #444; }
  </style>
</head>
<body>
  <p>Loading job boards…</p>
  <form id="idibu-form" method="POST" action="${escapeHtmlAttr(action)}">
    ${inputs}
  </form>
  <script>document.getElementById("idibu-form").submit();</script>
</body>
</html>`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
