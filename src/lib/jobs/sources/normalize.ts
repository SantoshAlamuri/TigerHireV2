import { mapCityFromLocation } from "@/lib/jobs/city-mapper";
import type { JobSource, NormalizedJob } from "@/lib/jobs/types";

interface BuildInput {
  source: JobSource;
  source_job_id: string | number | null | undefined;
  source_url: string | null | undefined;
  title: string | null | undefined;
  company: string | null | undefined;
  description: string | null | undefined;
  location: string | null | undefined;
  posted_at: string | null | undefined;
  raw: unknown;
}

export function buildNormalizedJob(input: BuildInput): NormalizedJob | null {
  const sourceJobId = String(input.source_job_id ?? "").trim();
  const sourceUrl = String(input.source_url ?? "").trim();
  const title = String(input.title ?? "").trim();
  const company = String(input.company ?? "").trim();
  const description = String(input.description ?? "")
    .trim()
    .slice(0, 5000);
  const city = mapCityFromLocation(input.location);
  const postedAt = parseDate(input.posted_at);

  if (!sourceJobId || !sourceUrl || !title || !company || !description || !city) {
    return null;
  }

  return {
    source: input.source,
    source_job_id: sourceJobId,
    source_url: sourceUrl,
    title,
    company,
    description,
    city,
    role_category: null,
    posted_at: postedAt,
    raw: input.raw,
  };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
