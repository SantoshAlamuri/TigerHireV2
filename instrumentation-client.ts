import * as Sentry from "@sentry/nextjs";

/**
 * Client-side Sentry initialization.
 *
 * Sentry moved client config from `sentry.client.config.ts` to this file in
 * `@sentry/nextjs` v8+. By v10 the older file is no longer auto-bundled, so
 * the browser SDK only initializes if this file exists. Keep `sentry.client.config.ts`
 * untouched for now to avoid disturbing any local tooling that still references it;
 * the SDK ignores it at build time.
 *
 * The DSN must come from `NEXT_PUBLIC_SENTRY_DSN` because Next.js only inlines
 * `NEXT_PUBLIC_*` env vars into client bundles. A bare `SENTRY_DSN` fallback
 * would be stripped to `undefined` in the browser and is omitted here.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NODE_ENV,
  });
}
