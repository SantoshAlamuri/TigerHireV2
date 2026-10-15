import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildNormalizedJob } from "./normalize";
import { throttleDomain } from "./shared-rate-limit";
import type { SourceFetchItem, SourceFetchResult } from "@/lib/jobs/types";

const LEVER_DOMAIN = "api.lever.co";

interface LeverJob {
  id: string;
  hostedUrl: string;
  text: string;
  categories?: { location?: string };
  descriptionPlain?: string;
  description?: string;
  createdAt?: number;
}

export async function fetchLeverJobs(): Promise<SourceFetchResult> {
  const slugs = await readSeed("lever_companies.json");
  const items: SourceFetchItem[] = [];
  let failed = 0;

  for (const slug of slugs) {
    try {
      await throttleDomain(LEVER_DOMAIN, 2000);
      const url = `https://${LEVER_DOMAIN}/v0/postings/${slug}?mode=json`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Lever ${slug} failed: ${response.status}`);
      const body = (await response.json()) as LeverJob[];
      for (const job of body ?? []) {
        const normalized = buildNormalizedJob({
          source: "lever",
          source_job_id: job.id,
          source_url: job.hostedUrl,
          title: job.text,
          company: slug,
          description: job.descriptionPlain ?? job.description ?? "",
          location: job.categories?.location ?? "",
          posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : null,
          raw: job,
        });
        items.push({ raw: job, normalized });
      }
    } catch {
      failed += 1;
    }
  }

  return {
    source: "lever",
    items,
    fetched: items.length,
    failed,
  };
}

async function readSeed(fileName: string): Promise<string[]> {
  const path = join(process.cwd(), "data", fileName);
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((value) => String(value).trim()).filter(Boolean);
}
