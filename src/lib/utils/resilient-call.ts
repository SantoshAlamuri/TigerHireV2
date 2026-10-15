import { getCircuitBreaker } from "./circuit-breaker";
import { withRetry } from "./retry";
import { logger } from "@/lib/observability/logger";

interface ResilientCallOptions {
  service: string;
  failureThreshold?: number;
  openMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Wraps an async function with circuit breaker, retry, and timeout.
 * Use for all external service calls (Stripe, Resend, Apify, etc.).
 */
export function createResilientCall(options: ResilientCallOptions) {
  const breaker = getCircuitBreaker(options.service, {
    failureThreshold: options.failureThreshold ?? 5,
    openMs: options.openMs ?? 30_000,
  });

  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = options.maxRetries ?? 2;

  return async function resilientCall<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    label?: string,
  ): Promise<T> {
    return breaker.run(() =>
      withRetry(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            return await fn(controller.signal);
          } catch (err) {
            logger.error(`${options.service} call failed`, {
              error: err instanceof Error ? err.message : String(err),
              message: label,
            });
            throw err;
          } finally {
            clearTimeout(timer);
          }
        },
        { maxRetries },
      ),
    );
  };
}
