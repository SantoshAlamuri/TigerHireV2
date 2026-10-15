/**
 * Retry a promise-returning function with exponential backoff and jitter.
 * Max 3 retries by default. Only retries on transient errors (network, 5xx, timeout).
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_MS = 500;
const DEFAULT_MAX_MS = 10_000;

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("network"))
      return true;
    if (msg.includes("timeout") || msg.includes("aborted")) return true;
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests"))
      return true;
    if (msg.includes("503") || msg.includes("502") || msg.includes("504")) return true;
  }
  return false;
}

function parseRetryAfterMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const msg = error.message.toLowerCase();
  // Match "retry-after: 3" style
  const headerMatch = msg.match(/retry-?after[:=\s]+(\d{1,4})/i);
  if (headerMatch) return Number(headerMatch[1]) * 1000;
  // Match "retry after 2s" style
  const humanMatch = msg.match(/retry\s+after\s+(\d{1,4})\s*s/i);
  if (humanMatch) return Number(humanMatch[1]) * 1000;
  return null;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialMs?: number;
    maxMs?: number;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialMs = options.initialMs ?? DEFAULT_INITIAL_MS;
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries || !isRetryable(err)) throw err;
      const retryAfterMs = parseRetryAfterMs(err);
      const exponentialMs = initialMs * Math.pow(2, attempt);
      const jitterMs = Math.random() * 200;
      const computedDelay =
        retryAfterMs != null ? Math.max(retryAfterMs, exponentialMs) : exponentialMs;
      const delay = Math.min(computedDelay + jitterMs, maxMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
