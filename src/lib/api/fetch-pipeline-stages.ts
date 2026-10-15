/**
 * Deduplicates concurrent pipeline-stage fetches per job and caches briefly
 * so multiple cards opening "Request interview" for the same job share one request.
 */

export interface PipelineStage {
  id: string;
  stage_name: string;
  stage_order: number;
  stage_type?: string;
  sla_days?: number | null;
  is_locked?: boolean;
  notify_candidate?: boolean;
  color?: string | null;
  interviewer_user_id?: string | null;
  interviewer_email?: string | null;
  interviewer_name?: string | null;
  interviewer?: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

const cache = new Map<string, { stages: PipelineStage[]; at: number }>();
const inflight = new Map<string, Promise<PipelineStage[]>>();
const TTL_MS = 60_000;

export async function fetchPipelineStages(
  jobId: string,
  options?: { forceFresh?: boolean },
): Promise<PipelineStage[]> {
  if (options?.forceFresh) {
    cache.delete(jobId);
    inflight.delete(jobId);
  }
  const now = Date.now();
  const hit = cache.get(jobId);
  if (hit && now - hit.at < TTL_MS) {
    return hit.stages;
  }

  let p = inflight.get(jobId);
  if (!p) {
    p = fetch(`/api/jobs/${jobId}/pipeline-stages`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (r): Promise<PipelineStage[]> => {
        if (!r.ok) throw new Error(`Failed to fetch stages (${r.status})`);
        const data = (await r.json()) as { stages?: PipelineStage[] };
        return data.stages ?? [];
      })
      .catch(() => [] as PipelineStage[])
      .finally(() => {
        inflight.delete(jobId);
      });
    inflight.set(jobId, p);
  }

  const stages = await p;
  if (stages.length > 0 || options?.forceFresh) {
    cache.set(jobId, { stages, at: Date.now() });
  }
  return stages;
}
