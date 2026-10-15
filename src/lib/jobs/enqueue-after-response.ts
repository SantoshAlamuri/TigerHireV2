import { after } from "next/server";
import { logger } from "@/lib/observability/logger";
import { enqueue, type JobName, type JobPayload } from "./queue";

/**
 * Enqueue a background job without blocking the response, in a way that
 * actually survives.
 *
 * The pattern this replaces was `enqueue(...).catch(() => {})` — an unawaited
 * promise on a serverless handler. Vercel freezes the instance once the
 * response is sent, so the send could die in flight and the job would simply
 * never exist: no error, no retry, no trace. Jobs lost this way were the
 * customer-visible kind — a role never distributed to the boards, a closed role
 * never taken down, a batch of candidates never scored.
 *
 * `after()` is the runtime's answer to exactly this, and the codebase already
 * uses it for post-response work elsewhere (api/applications, webhooks/recall).
 *
 * The `.catch(() => {})` it also replaces was dead code: enqueue() already
 * catches internally and resolves, logging its own failure at error level. It
 * hid nothing — but it read as if failure were being handled, which is worse
 * than not catching at all.
 *
 * Only call this from a request context (route handlers, server actions).
 * Background callers — Inngest functions, scripts — should await enqueue()
 * directly; `after()` outside a request has nothing to attach to.
 */
export function enqueueAfterResponse(
  name: JobName,
  payload: JobPayload,
  options?: { id?: string },
): void {
  const send = async () => {
    try {
      await enqueue(name, payload, options);
    } catch (error) {
      // enqueue() swallows its own failures, so reaching here means something
      // more unusual — a bad import, a runtime fault. Name it distinctly so it
      // is greppable rather than folded into generic queue noise.
      logger.error("enqueue_after_response_failed", {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  try {
    after(send);
  } catch {
    // after() throws when there is no request context — a script, an Inngest
    // function, or a test importing the route directly. Falling back to a
    // direct send keeps those callers working; it is announced rather than
    // silent, because losing the post-response guarantee is worth knowing
    // about if it ever happens on a real request path.
    logger.warn("enqueue_after_response_no_request_context", { name });
    void send();
  }
}
