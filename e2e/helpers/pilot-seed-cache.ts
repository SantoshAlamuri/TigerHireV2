import fs from "node:fs";
import path from "node:path";

export type PilotSeedCache = {
  jobId: string;
  gatePipelineCandidateId: string;
  gateCandidateId: string;
  gatedPipelineStageId: string;
  preGatePipelineStageId: string;
  offerPipelineCandidateId?: string;
  offerApplicationId?: string;
  seededAt: string;
};

const CACHE_PATH = path.join(__dirname, "../.pilot-seed-cache.json");

export function readPilotSeedCache(): PilotSeedCache | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as PilotSeedCache;
    if (!parsed?.jobId || !parsed.gatePipelineCandidateId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function pilotSeedCachePath(): string {
  return CACHE_PATH;
}
