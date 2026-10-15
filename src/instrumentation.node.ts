/**
 * Node-only shutdown handlers. Loaded dynamically from instrumentation.ts
 * so the main instrumentation file stays Edge-compatible (no process.on).
 */
export function registerNodeShutdownHandlers(): void {
  const onShutdown = (signal: string) => () => {
    console.warn(`[instrumentation] ${signal} received — shutting down gracefully`);
  };

  process.on("SIGTERM", onShutdown("SIGTERM"));
  process.on("SIGINT", onShutdown("SIGINT"));
}
