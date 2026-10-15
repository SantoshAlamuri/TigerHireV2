/**
 * Client-only: queue background parse+score via POST /api/agency/enqueue-scoring.
 */

export async function requestAgencyEnqueueScoring(
  candidateIds: string[],
): Promise<{ queued: number; total: number; skipped?: number }> {
  const res = await fetch("/api/agency/enqueue-scoring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ candidateIds }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    queued?: number;
    total?: number;
    skipped?: number;
  };
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return {
    queued: json.queued ?? 0,
    total: json.total ?? candidateIds.length,
    skipped: json.skipped,
  };
}
