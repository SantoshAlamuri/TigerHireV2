import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit } from "./rate-limit";

/**
 * Validates cron request using CRON_SECRET or CRON_SECRET_HASH.
 * Prefer CRON_SECRET_HASH in production so the raw secret never appears in env or logs.
 * Set CRON_SECRET_HASH to the SHA-256 hex digest of your cron secret, e.g.:
 *   node -e "console.log(require('crypto').createHash('sha256').update('your-secret').digest('hex'))"
 *
 * Security features:
 * - Rate limiting on failed auth attempts (by IP)
 * - Security logging for failed attempts
 * - Production environment warnings
 * - Timing-safe comparison for hash validation
 */
export async function validateCronSecret(request: Request): Promise<boolean> {
  // Production environment check: warn if using plain secret
  if (
    process.env.NODE_ENV === "production" &&
    process.env.CRON_SECRET &&
    !process.env.CRON_SECRET_HASH
  ) {
    logger.warn(
      "SECURITY: Using CRON_SECRET in production. Prefer CRON_SECRET_HASH to avoid exposing secret in env/logs.",
      {
        route: "cron-auth",
      },
    );
  }

  // Extract IP for rate limiting
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";

  // Rate limit failed auth attempts: 5 attempts per 15 minutes per IP
  const rateLimitKey = `cron-auth-fail:${ip}`;
  const rateLimit = await checkRateLimit({
    key: rateLimitKey,
    limit: 5,
    windowSecs: 900, // 15 minutes
  });

  if (!rateLimit.allowed) {
    logger.error("Cron auth rate limit exceeded - potential brute force attack", {
      ip,
      route: "cron-auth",
      remaining: rateLimit.remaining,
      resetAt: rateLimit.resetAt.toISOString(),
    });
    return false;
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const hashEnv = process.env.CRON_SECRET_HASH;
  let isValid = false;

  if (hashEnv) {
    if (!bearer) {
      logFailedAttempt(ip, "missing_bearer_token");
      return false;
    }
    const hash = createHash("sha256").update(bearer).digest("hex");
    if (hash.length !== hashEnv.length) {
      logFailedAttempt(ip, "hash_length_mismatch");
      return false;
    }
    try {
      isValid = timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hashEnv, "hex"));
      if (!isValid) {
        logFailedAttempt(ip, "hash_mismatch");
      }
    } catch {
      logFailedAttempt(ip, "hash_comparison_error");
      return false;
    }
  } else {
    const rawSecret = process.env.CRON_SECRET;
    if (!rawSecret) {
      logFailedAttempt(ip, "no_secret_configured");
      return false;
    }
    isValid = bearer === rawSecret;
    if (!isValid) {
      logFailedAttempt(ip, "secret_mismatch");
    }
  }

  if (isValid) {
    logger.info("Cron auth successful", {
      ip,
      route: "cron-auth",
      method: hashEnv ? "hash" : "plain",
    });
  }

  return isValid;
}

/**
 * Log failed cron auth attempts for security monitoring.
 * Does not log the actual secret/bearer token to avoid leaking credentials.
 */
function logFailedAttempt(ip: string, reason: string): void {
  logger.warn("Cron auth failed", {
    ip,
    reason,
    route: "cron-auth",
    timestamp: new Date().toISOString(),
  });
}
