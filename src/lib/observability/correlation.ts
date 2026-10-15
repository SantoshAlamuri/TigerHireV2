/**
 * Request correlation IDs (AsyncLocalStorage on server only).
 * Safe to import from client components — browser/SSR calls return undefined / run fn directly.
 */
export const CORRELATION_HEADER = "x-correlation-id";

type AsyncLocalStorageType = import("node:async_hooks").AsyncLocalStorage<string>;

let store: AsyncLocalStorageType | null | undefined;

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function getStore(): AsyncLocalStorageType | null {
  if (!isNodeRuntime()) return null;
  if (store !== undefined) return store;
  try {
    // Lazy load so client bundles never evaluate node:async_hooks at module init.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
    store = new AsyncLocalStorage<string>();
  } catch {
    store = null;
  }
  return store;
}

export function getCorrelationId(): string | undefined {
  return getStore()?.getStore();
}

/**
 * Run fn with correlationId in async context. Use for API route handlers so the ID
 * is available across awaits (unlike the previous module-level variable).
 */
export function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const als = getStore();
  if (!als) return fn();
  return als.run(correlationId, fn) as T | Promise<T>;
}

export function generateCorrelationId(): string {
  return crypto.randomUUID();
}
