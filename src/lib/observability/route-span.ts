const SENTRY_DSN = process.env.SENTRY_DSN;

/**
 * Wraps an API route handler with a Sentry span for RED (rate, error, duration) observability.
 * Use for key routes: /api/health, /api/jobs, /api/apply, etc.
 * Instrumented routes: GET /api/health, GET /api/jobs (see docs/REMEDIATION_ACTIONS_LIST.md).
 */
export async function withRouteSpan<T>(routeName: string, handler: () => Promise<T>): Promise<T> {
  if (!SENTRY_DSN) return handler();

  const Sentry = await import("@sentry/nextjs");
  return Sentry.startSpan(
    {
      name: routeName,
      op: "http.server",
      attributes: {
        "http.route": routeName,
      },
    },
    async () => handler(),
  );
}
