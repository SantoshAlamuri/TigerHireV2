import { env } from "@/lib/config/env";
import { buildNormalizedJob } from "./normalize";
import { throttleDomain } from "./shared-rate-limit";
import { JOB_CITIES, JOB_ROLE_CATEGORIES } from "@/lib/jobs/types";
import type { SourceFetchItem, SourceFetchResult } from "@/lib/jobs/types";

const JSEARCH_DOMAIN = "jsearch.p.rapidapi.com";

interface JSearchJob {
  job_id: string;
  job_apply_link: string;
  job_title: string;
  employer_name: string;
  job_description?: string;
  job_city?: string;
  job_country?: string;
  job_posted_at_datetime_utc?: string;
}

export async function fetchJSearchJobs(): Promise<SourceFetchResult> {
  const rapidApiKey = env.rapidApiKey;
  if (!rapidApiKey) return { source: "jsearch", items: [], fetched: 0, failed: 0 };

  const items: SourceFetchItem[] = [];
  let failed = 0;

  for (const role of JOB_ROLE_CATEGORIES) {
    for (const city of JOB_CITIES) {
      try {
        await throttleDomain(JSEARCH_DOMAIN, 2000);
        const query = `${role.replace("_", " ")} jobs in ${city === "delhi_ncr" ? "Delhi NCR" : city} India`;
        const url = new URL(`https://${JSEARCH_DOMAIN}/search`);
        url.searchParams.set("query", query);
        url.searchParams.set("num_pages", "1");

        const response = await fetch(url.toString(), {
          headers: {
            "x-rapidapi-host": JSEARCH_DOMAIN,
            "x-rapidapi-key": rapidApiKey,
          },
        });
        if (!response.ok) throw new Error(`JSearch failed ${role}/${city}: ${response.status}`);
        const body = (await response.json()) as { data?: JSearchJob[] };
        for (const job of body.data ?? []) {
          const normalized = buildNormalizedJob({
            source: "jsearch",
            source_job_id: job.job_id,
            source_url: job.job_apply_link,
            title: job.job_title,
            company: job.employer_name,
            description: job.job_description ?? "",
            location: `${job.job_city ?? ""}, ${job.job_country ?? ""}`,
            posted_at: job.job_posted_at_datetime_utc ?? null,
            raw: job,
          });
          items.push({ raw: job, normalized });
        }
      } catch {
        failed += 1;
      }
    }
  }

  return { source: "jsearch", items, fetched: items.length, failed };
}
