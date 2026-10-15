import { enqueue } from "@/lib/jobs/queue";
import type { PrescreenLifecyclePayload } from "@/lib/prescreen/lifecycle";

/** Schedule reminder + timeout handlers via Inngest (apply gate and post-shortlist). */
export async function schedulePrescreenLifecycle(
  payload: PrescreenLifecyclePayload,
): Promise<void> {
  await enqueue("prescreen-lifecycle", payload, {
    id: `prescreen-lifecycle:${payload.sessionId}:${payload.questionsSentAtIso}`,
  });
}
