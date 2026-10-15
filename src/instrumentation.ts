import * as Sentry from "@sentry/nextjs";
import { validateEnv } from "@/lib/config/env";

/**
 * Next.js instrumentation: runs once when the server starts (per runtime).
 *
 * Server/edge Sentry init lives in `sentry.server.config.ts` / `sentry.edge.config.ts`,
 * which `@sentry/nextjs` v10 no longer auto-bundles — they must be imported here, or
 * backend errors (API routes, scoring, parsing) go uncaptured. `onRequestError` is the
 * v8+ hook that forwards request/render errors to Sentry.
 *
 * On Vercel (serverless), each invocation is isolated; shutdown is handled by the platform.
 * For `next start` (self-hosted), we register SIGTERM/SIGINT to log graceful shutdown.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "production") validateEnv();

    await import("../sentry.server.config");

    const { registerNodeShutdownHandlers } = await import("./instrumentation.node");
    registerNodeShutdownHandlers();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
