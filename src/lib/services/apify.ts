import { env } from "@/lib/config/env";
import { createResilientCall } from "@/lib/utils/resilient-call";
import type { SignalRecord } from "@/lib/agents/types";

const APIFY_API_URL = "https://api.apify.com/v2";

const apifyCall = createResilientCall({
  service: "apify",
  timeoutMs: 300_000,
  maxRetries: 1,
  failureThreshold: 3,
});

interface ApifyRunResult {
  items: Record<string, unknown>[];
  datasetId: string;
}

/**
 * Run an Apify actor and wait for results.
 */
async function runActor(
  actorId: string,
  input: Record<string, unknown>,
  timeoutSecs = 300,
): Promise<ApifyRunResult> {
  if (!env.apifyApiToken) {
    throw new Error("APIFY_API_TOKEN not configured");
  }

  return apifyCall(async () => {
    const runResponse = await fetch(
      `${APIFY_API_URL}/acts/${actorId}/runs?waitForFinish=${timeoutSecs}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.apifyApiToken}`,
        },
        body: JSON.stringify(input),
      },
    );

    if (!runResponse.ok) {
      const text = await runResponse.text();
      throw new Error(`Apify actor start failed: ${runResponse.status} ${text}`);
    }

    const runData = await runResponse.json();
    const datasetId = runData.data?.defaultDatasetId;

    if (!datasetId) {
      throw new Error("Apify run did not produce a dataset");
    }

    const dataResponse = await fetch(`${APIFY_API_URL}/datasets/${datasetId}/items?format=json`, {
      headers: {
        Authorization: `Bearer ${env.apifyApiToken}`,
      },
    });

    if (!dataResponse.ok) {
      throw new Error(`Apify dataset fetch failed: ${dataResponse.status}`);
    }

    const items = await dataResponse.json();
    return { items: items as Record<string, unknown>[], datasetId };
  }, `runActor:${actorId}`);
}

/**
 * Scrape Naukri job listings using the Apify Naukri actor.
 * Returns structured signals for the Talent Scout agent.
 */
export async function scrapeNaukriCandidates(params: {
  keywords: string[];
  location?: string;
  maxResults?: number;
}): Promise<SignalRecord[]> {
  const results = await runActor("curious_coder/naukri-scraper", {
    keywords: params.keywords,
    location: params.location ?? "Bengaluru",
    maxItems: params.maxResults ?? 100,
  });

  return results.items.map((item, index) => ({
    source: "naukri" as const,
    external_id: (item.profileId as string) ?? `naukri_${Date.now()}_${index}`,
    raw_data: item,
  }));
}

/**
 * Scrape Indeed India job listings.
 * Returns structured signals for the Hiring Signal agent.
 */
export async function scrapeIndeedJobs(params: {
  query: string;
  location?: string;
  maxResults?: number;
}): Promise<
  {
    companyName: string;
    jobTitle: string;
    jobDescription: string;
    location?: string;
    sourceUrl?: string;
    source: string;
  }[]
> {
  const results = await runActor("misceres/indeed-scraper", {
    position: params.query,
    country: "IN",
    location: params.location ?? "Bengaluru",
    maxItems: params.maxResults ?? 50,
  });

  return results.items.map((item) => ({
    companyName: (item.company as string) ?? "Unknown",
    jobTitle: (item.positionName as string) ?? (item.title as string) ?? "Untitled",
    jobDescription: (item.description as string) ?? "",
    location: (item.location as string) ?? undefined,
    sourceUrl: (item.url as string) ?? undefined,
    source: "indeed",
  }));
}

/**
 * Scrape company career pages via a generic URL scraper.
 */
export async function scrapeCareerPage(url: string): Promise<{
  jobs: { title: string; description: string; url: string }[];
}> {
  const results = await runActor("apify/website-content-crawler", {
    startUrls: [{ url }],
    maxCrawlPages: 20,
    crawlerType: "cheerio",
  });

  const jobs = results.items
    .filter((item) => {
      const text = ((item.text as string) ?? "").toLowerCase();
      return text.includes("apply") || text.includes("job") || text.includes("opening");
    })
    .map((item) => ({
      title: (item.title as string) ?? "Unknown Position",
      description: (item.text as string) ?? "",
      url: (item.url as string) ?? url,
    }));

  return { jobs };
}

/**
 * Get remaining Apify usage/credits.
 */
export async function getApifyUsage(): Promise<{
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
}> {
  if (!env.apifyApiToken) {
    return { totalCredits: 0, usedCredits: 0, remainingCredits: 0 };
  }

  const response = await fetch(`${APIFY_API_URL}/users/me/usage`, {
    headers: { Authorization: `Bearer ${env.apifyApiToken}` },
  });

  if (!response.ok) {
    return { totalCredits: 0, usedCredits: 0, remainingCredits: 0 };
  }

  const data = await response.json();
  return {
    totalCredits: data.data?.limits?.maxMonthlyUsageUsd ?? 0,
    usedCredits: data.data?.currentMonthUsageUsd ?? 0,
    remainingCredits:
      (data.data?.limits?.maxMonthlyUsageUsd ?? 0) - (data.data?.currentMonthUsageUsd ?? 0),
  };
}
