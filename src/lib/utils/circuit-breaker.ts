/**
 * In-memory circuit breaker for external calls. After failureThreshold failures,
 * the circuit opens and rejects immediately for openMs. Then it goes half-open
 * (one trial); success closes the circuit, failure re-opens.
 */
export interface CircuitBreakerOptions {
  /** Failures in a row before opening (default 5). */
  failureThreshold?: number;
  /** Ms to keep circuit open (default 30_000). */
  openMs?: number;
  /** Name for logging. */
  name?: string;
}

const DEFAULT_THRESHOLD = 5;
const DEFAULT_OPEN_MS = 30_000;

type State = "closed" | "open" | "half_open";

export function createCircuitBreaker(options: CircuitBreakerOptions = {}) {
  const failureThreshold = options.failureThreshold ?? DEFAULT_THRESHOLD;
  const openMs = options.openMs ?? DEFAULT_OPEN_MS;
  const name = options.name ?? "default";

  let state: State = "closed";
  let failures = 0;
  let openedAt = 0;

  function clearIfStale() {
    if (state === "open" && Date.now() - openedAt >= openMs) {
      state = "half_open";
    }
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    clearIfStale();
    if (state === "open") {
      throw new Error(`CircuitBreaker[${name}] open`);
    }
    try {
      const result = await fn();
      if (state === "half_open") {
        state = "closed";
        failures = 0;
      } else if (state === "closed") {
        failures = 0;
      }
      return result;
    } catch (err) {
      failures++;
      if (state === "half_open" || failures >= failureThreshold) {
        state = "open";
        openedAt = Date.now();
      }
      throw err;
    }
  }

  function getState(): State {
    clearIfStale();
    return state;
  }

  return { run, getState };
}

const breakers: Record<string, ReturnType<typeof createCircuitBreaker>> = {};

export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions) {
  if (!breakers[name]) {
    breakers[name] = createCircuitBreaker({ ...options, name });
  }
  return breakers[name];
}
