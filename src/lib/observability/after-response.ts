import { after } from "next/server";
import { logger } from "@/lib/observability/logger";

/**
 * Run post-response work that must survive the serverless instance freezing
 * after the response is sent, without dropping it silently.
 *
 * Mirrors `enqueueAfterResponse` but for arbitrary async side effects (DB writes,
 * analytics upserts, plan dispatch) rather than queued jobs. In a request scope
 * it defers to `after()`; outside one (scripts, Inngest, unit tests calling a
 * route handler directly) it falls back to running the callback immediately so
 * those callers keep working.
 */
export function runAfterResponse(label: string, cb: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await cb();
    } catch (error) {
      logger.error("after_response_failed", {
        label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
