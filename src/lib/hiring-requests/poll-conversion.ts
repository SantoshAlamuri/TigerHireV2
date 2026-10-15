/**
 * Client-side helper: wait for an approved requisition to be converted into a
 * draft job by the background JD-generation job (Inngest or the after()
 * fallback in PATCH /api/hiring-requests/[id]).
 *
 * Polls the requisition until `assigned_job_id` is set (status "converted") or
 * the timeout elapses. Returns the job id when conversion lands, else null so
 * callers can fall back to "check the Converted tab shortly" messaging.
 */
export async function pollRequisitionConversion(
  requestId: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<{ jobId: string | null }> {
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const intervalMs = opts?.intervalMs ?? 2_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      const res = await fetch(`/api/hiring-requests/${requestId}`, {
        credentials: "include",
      });
      if (!res.ok) continue;
      const json = await res.json();
      const jobId = (json.request?.assigned_job_id as string | null) ?? null;
      if (jobId) return { jobId };
      const status = json.request?.status as string | undefined;
      // Terminal states that will never convert — stop polling early.
      if (status === "rejected" || status === "cancelled") return { jobId: null };
    } catch {
      // Transient network error — keep polling until the deadline.
    }
  }
  return { jobId: null };
}
