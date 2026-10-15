import { logger } from "./logger";
import { captureSentryException } from "./sentry";

/**
 * Report an error to the logger and to Sentry (if configured).
 * Call from API route catch blocks and other error handlers.
 */
export function reportError(
  err: unknown,
  context?: { route?: string; userId?: string; [key: string]: unknown },
): void {
  const message = err instanceof Error ? err.message : String(err);

  // Better error serialization for logging
  let errorDetails: string | Record<string, unknown>;
  if (err instanceof Error) {
    const errorObj: Record<string, unknown> = {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
    if (err.cause !== undefined) {
      errorObj.cause = err.cause;
    }
    errorDetails = errorObj;
  } else if (typeof err === "object" && err !== null) {
    // Try to serialize object errors (e.g., Supabase errors)
    try {
      errorDetails = JSON.stringify(err, Object.getOwnPropertyNames(err));
    } catch {
      errorDetails = String(err);
    }
  } else {
    errorDetails = String(err);
  }

  logger.error(message, {
    error: typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails),
    ...context,
  });

  if (typeof window !== "undefined") return;

  captureSentryException(err, {
    user: { id: typeof context?.userId === "string" ? context.userId : null },
    extra: context,
  });
}
