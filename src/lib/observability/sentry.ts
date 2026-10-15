const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

type SentryLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

interface SentryContext {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
  user?: { id?: string | null };
}

function isServerRuntime(): boolean {
  return typeof window === "undefined";
}

export function sentryEnabled(): boolean {
  return Boolean(SENTRY_DSN) && isServerRuntime();
}

export function captureSentryMessage(
  message: string,
  level: SentryLevel = "warning",
  context?: SentryContext,
): void {
  if (!sentryEnabled()) return;
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context?.tags ?? {})) {
        if (value !== undefined && value !== null) scope.setTag(key, String(value));
      }
      for (const [key, value] of Object.entries(context?.extra ?? {})) {
        scope.setExtra(key, value);
      }
      if (context?.user?.id) scope.setUser({ id: context.user.id });
      Sentry.captureMessage(message, level);
    });
  });
}

export function addSentryBreadcrumb(params: {
  category: string;
  message: string;
  level?: SentryLevel;
  data?: Record<string, unknown>;
}): void {
  if (!sentryEnabled()) return;
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.addBreadcrumb({
      category: params.category,
      message: params.message,
      level: params.level ?? "info",
      data: params.data,
    });
  });
}

export function setSentryRequestContext(context: {
  route?: string;
  userId?: string | null;
  organisationId?: string | null;
  scoringStatus?: string | null;
}): void {
  if (!sentryEnabled()) return;
  void import("@sentry/nextjs").then((Sentry) => {
    if (context.userId) Sentry.setUser({ id: context.userId });
    if (context.route) Sentry.setTag("route", context.route);
    if (context.organisationId) Sentry.setTag("org_id", context.organisationId);
    if (context.scoringStatus) Sentry.setTag("scoring_status", context.scoringStatus);
  });
}

export function captureSentryException(error: unknown, context?: SentryContext): void {
  if (!sentryEnabled()) return;
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context?.tags ?? {})) {
        if (value !== undefined && value !== null) scope.setTag(key, String(value));
      }
      for (const [key, value] of Object.entries(context?.extra ?? {})) {
        scope.setExtra(key, value);
      }
      if (context?.user?.id) scope.setUser({ id: context.user.id });
      Sentry.captureException(error);
    });
  });
}
