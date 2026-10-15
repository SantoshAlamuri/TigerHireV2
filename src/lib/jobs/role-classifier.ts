import { MODELS } from "@/lib/config/models";
import { callClaude, extractJsonArray } from "@/lib/services/anthropic";
import type { NormalizedJob, RoleCategory } from "./types";

export const ROLE_KEYWORDS: Record<RoleCategory, string[]> = {
  backend: [
    "backend engineer",
    "backend developer",
    "java developer",
    "python developer",
    "node.js developer",
    "golang",
    "sde backend",
    "server engineer",
  ],
  frontend: [
    "frontend",
    "react developer",
    "next.js",
    "ui developer",
    "javascript developer",
    "angular developer",
    "vue developer",
  ],
  data_ml: [
    "data engineer",
    "machine learning",
    "ml engineer",
    "data scientist",
    "ai engineer",
    "mlops",
    "analytics engineer",
  ],
  product: [
    "product manager",
    "product owner",
    "group product manager",
    "gpm",
    "apm",
    "associate product manager",
  ],
  devops: [
    "devops",
    "sre",
    "site reliability",
    "platform engineer",
    "infrastructure engineer",
    "cloud engineer",
    "kubernetes engineer",
  ],
  design: [
    "product designer",
    "ux designer",
    "ui designer",
    "ux/ui designer",
    "visual designer",
    "interaction designer",
  ],
  sales: [
    "sales executive",
    "account executive",
    "sdr",
    "sales development",
    "business development",
    "inside sales",
    "enterprise sales",
  ],
  finance: [
    "financial analyst",
    "finance manager",
    "accountant",
    "controller",
    "fp&a",
    "financial controller",
    "revenue analyst",
  ],
};

const ROLE_VALUES = Object.keys(ROLE_KEYWORDS) as RoleCategory[];

export function classifyRoleKeywordFirst(title: string, description: string): RoleCategory | null {
  const titleNorm = normalizeText(title);
  const descNorm = normalizeText(description).slice(0, 500);

  let bestRole: RoleCategory | null = null;
  let bestScore = 0;

  for (const role of ROLE_VALUES) {
    const keywords = ROLE_KEYWORDS[role];
    let score = 0;
    for (const keyword of keywords) {
      const needle = normalizeText(keyword);
      if (!needle) continue;
      if (titleNorm.includes(needle)) score += 2;
      if (descNorm.includes(needle)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRole = role;
    }
  }

  return bestScore >= 2 ? bestRole : null;
}

export async function classifyWithLlmFallback(
  jobs: NormalizedJob[],
  maxCalls: number,
): Promise<Map<string, RoleCategory | null>> {
  const result = new Map<string, RoleCategory | null>();
  if (jobs.length === 0 || maxCalls <= 0) return result;

  const batchSize = 10;
  const maxJobs = Math.min(jobs.length, maxCalls * batchSize);
  const targetJobs = jobs.slice(0, maxJobs);
  for (let i = 0; i < targetJobs.length; i += batchSize) {
    const batch = targetJobs.slice(i, i + batchSize);
    const promptPayload = batch.map((job, index) => ({
      idx: index,
      title: job.title,
      description: job.description.slice(0, 600),
    }));

    const response = await callClaude({
      model: MODELS.HAIKU,
      max_tokens: 600,
      temperature: 0,
      label: "jobs-role-classifier-v2",
      messages: [
        {
          role: "user",
          content: `Classify each job into exactly one role category or null.
Allowed values: backend, frontend, data_ml, product, devops, design, sales, finance, null.
Return only a JSON array of ${batch.length} items, in the same order as inputs.
Input:
${JSON.stringify(promptPayload)}`,
        },
      ],
    });

    const parsed = extractJsonArray(response.text, "jobs-role-classifier-v2");
    for (let idx = 0; idx < batch.length; idx++) {
      const raw = parsed[idx];
      const role =
        typeof raw === "string" && ROLE_VALUES.includes(raw as RoleCategory) ? raw : null;
      const key = buildLlmKey(batch[idx].source, batch[idx].source_job_id);
      result.set(key, (role as RoleCategory | null) ?? null);
    }
  }

  return result;
}

export function buildLlmKey(source: string, sourceJobId: string): string {
  return `${source}:${sourceJobId}`;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
