import type { APIRequestContext, APIResponse } from "@playwright/test";
import { pilotBaseUrl } from "./pilot-env";
import { readPilotSeedCache } from "./pilot-seed-cache";

export function pilotApiHeaders(): Record<string, string> {
  return { Origin: pilotBaseUrl() };
}

export type PipelineStage = { id: string; stage_name?: string; name?: string };
export type PipelineCandidate = {
  id: string;
  candidate_id?: string;
  pipeline_stage_id?: string | null;
  stage_id?: string | null;
};

function unwrap<T>(json: Record<string, unknown>, key: string): T | undefined {
  const data = json.data as Record<string, unknown> | undefined;
  if (data && key in data) return data[key] as T;
  if (key in json) return json[key] as T;
  return undefined;
}

export async function getPipelineStages(
  request: APIRequestContext,
  jobId: string,
): Promise<PipelineStage[]> {
  const res = await request.get(`/api/jobs/${jobId}/pipeline-stages`);
  if (!res.ok()) return [];
  const json = (await res.json()) as Record<string, unknown>;
  return unwrap<PipelineStage[]>(json, "stages") ?? [];
}

export async function getPipelineCandidates(
  request: APIRequestContext,
  jobId: string,
  limit = 10,
): Promise<PipelineCandidate[]> {
  const res = await request.get(`/api/jobs/${jobId}/pipeline/candidates?limit=${limit}`);
  if (!res.ok()) return [];
  const json = (await res.json()) as Record<string, unknown>;
  return unwrap<PipelineCandidate[]>(json, "candidates") ?? [];
}

/** Prefer seeded lifecycle gate candidate when `npm run pilot:seed` has run. */
export async function getLifecycleGateCandidate(
  request: APIRequestContext,
  jobId: string,
): Promise<PipelineCandidate | null> {
  const cache = readPilotSeedCache();
  if (cache?.jobId === jobId && cache.gatePipelineCandidateId) {
    const all = await getPipelineCandidates(request, jobId, 50);
    const hit = all.find((c) => c.id === cache.gatePipelineCandidateId);
    if (hit) return hit;
    return {
      id: cache.gatePipelineCandidateId,
      candidate_id: cache.gateCandidateId,
    };
  }
  return (await getPipelineCandidates(request, jobId, 10))[0] ?? null;
}

export function getGatedPipelineStageIdFromCache(jobId: string): string | null {
  const cache = readPilotSeedCache();
  if (cache?.jobId === jobId) return cache.gatedPipelineStageId;
  return null;
}

export async function patchPipelineCandidateStage(
  request: APIRequestContext,
  jobId: string,
  pcId: string,
  stageId: string,
): Promise<APIResponse> {
  return request.patch(`/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
    data: { stage_id: stageId },
    headers: pilotApiHeaders(),
  });
}

export async function approveHiringRequest(
  request: APIRequestContext,
  requestId: string,
): Promise<APIResponse> {
  return request.patch(`/api/hiring-requests/${requestId}`, {
    data: { status: "approved" },
    headers: pilotApiHeaders(),
  });
}

export async function getRecruitmentPlanStages(
  request: APIRequestContext,
  jobId: string,
): Promise<
  Array<{
    id: string;
    pipeline_stage_id: string | null;
    approval_gate: string;
    display_name: string;
  }>
> {
  const res = await request.get(`/api/jobs/${jobId}/recruitment-plan`);
  if (!res.ok()) return [];
  const json = (await res.json()) as Record<string, unknown>;
  const data = json.data as { stages?: Array<unknown> } | undefined;
  return (data?.stages ?? []) as Array<{
    id: string;
    pipeline_stage_id: string | null;
    approval_gate: string;
    display_name: string;
  }>;
}

export async function listHiringRequests(
  request: APIRequestContext,
  status?: string,
): Promise<Array<Record<string, unknown>>> {
  const url = status
    ? `/api/hiring-requests?status=${encodeURIComponent(status)}`
    : "/api/hiring-requests";
  const res = await request.get(url, { headers: pilotApiHeaders() });
  if (!res.ok()) return [];
  const json = (await res.json()) as Record<string, unknown>;
  const data = json.data as { requests?: Array<Record<string, unknown>> } | undefined;
  if (data?.requests) return data.requests;
  if (Array.isArray(json.requests)) return json.requests as Array<Record<string, unknown>>;
  return [];
}
