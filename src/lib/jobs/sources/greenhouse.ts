import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildNormalizedJob } from "./normalize";
import { throttleDomain } from "./shared-rate-limit";
import type { SourceFetchItem, SourceFetchResult } from "@/lib/jobs/types";

const GREENHOUSE_DOMAIN = "boards-api.greenhouse.io";

interface GreenhouseJob {
  id: number;
  absolute_url: string;
  title: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
}

export async function fetchGreenhouseJobs(): Promise<SourceFetchResult> {
  const slugs = await readSeed("greenhouse_companies.json");
  const items: SourceFetchItem[] = [];
  let failed = 0;

  for (const slug of slugs) {
    try {
      await throttleDomain(GREENHOUSE_DOMAIN, 2000);
      const url = `https://${GREENHOUSE_DOMAIN}/v1/boards/${slug}/jobs?content=true`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Greenhouse ${slug} failed: ${response.status}`);
      const body = (await response.json()) as { jobs?: GreenhouseJob[] };
      for (const job of body.jobs ?? []) {
        const normalized = buildNormalizedJob({
          source: "greenhouse",
          source_job_id: job.id,
          source_url: job.absolute_url,
          title: job.title,
          company: slug,
          description: job.content ?? "",
          location: job.location?.name ?? "",
          posted_at: job.updated_at ?? null,
          raw: job,
        });
        items.push({ raw: job, normalized });
      }
    } catch {
      failed += 1;
    }
  }

  return {
    source: "greenhouse",
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
