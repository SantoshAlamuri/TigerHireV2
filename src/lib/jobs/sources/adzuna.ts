import { env } from "@/lib/config/env";
import { buildNormalizedJob } from "./normalize";
import { throttleDomain } from "./shared-rate-limit";
import { JOB_CITIES, JOB_ROLE_CATEGORIES } from "@/lib/jobs/types";
import type { SourceFetchItem, SourceFetchResult } from "@/lib/jobs/types";

const ADZUNA_DOMAIN = "api.adzuna.com";

interface AdzunaJob {
  id: string;
  redirect_url: string;
  title: string;
  company?: { display_name?: string };
  description?: string;
  location?: { display_name?: string };
  created?: string;
}

export async function fetchAdzunaJobs(): Promise<SourceFetchResult> {
  const appId = env.adzunaAppId;
  const appKey = env.adzunaAppKey;
  if (!appId || !appKey) {
    return { source: "adzuna", items: [], fetched: 0, failed: 0 };
  }

  const items: SourceFetchItem[] = [];
  let failed = 0;
  for (const role of JOB_ROLE_CATEGORIES) {
    for (const city of JOB_CITIES) {
      try {
        await throttleDomain(ADZUNA_DOMAIN, 2000);
        const url = new URL(`https://${ADZUNA_DOMAIN}/v1/api/jobs/in/search/1`);
        url.searchParams.set("app_id", appId);
        url.searchParams.set("app_key", appKey);
        url.searchParams.set("what", role.replace("_", " "));
        url.searchParams.set("where", city === "delhi_ncr" ? "Delhi NCR" : city);
        url.searchParams.set("results_per_page", "20");

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Adzuna failed ${role}/${city}: ${response.status}`);
        const body = (await response.json()) as { results?: AdzunaJob[] };
        for (const job of body.results ?? []) {
          const normalized = buildNormalizedJob({
            source: "adzuna",
            source_job_id: job.id,
            source_url: job.redirect_url,
            title: job.title,
            company: job.company?.display_name ?? "Unknown company",
            description: job.description ?? "",
            location: job.location?.display_name ?? "",
            posted_at: job.created ?? null,
            raw: job,
          });
          items.push({ raw: job, normalized });
        }
      } catch {
        failed += 1;
      }
    }
  }

  return {
    source: "adzuna",
    items,
    fetched: items.length,
    failed,
  };
}
