/**
 * Monitoring and alerting for tenant isolation violations
 */

import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { ForbiddenError } from "./tenant-scoped-client";

/**
 * Track tenant isolation violations for monitoring
 */
export function trackTenantViolation(context: {
  userId: string;
  organisationId: string | null;
  role: string;
  resourceType: string;
  resourceId: string;
  attemptedOrgId?: string;
}) {
  logger.warn("Tenant isolation violation attempted", {
    ...context,
    severity: "high",
    category: "security",
  });

  // Report to error tracking (Sentry, etc.)
  reportError(new Error("Tenant isolation violation"), {
    ...context,
    tags: {
      category: "security",
      type: "tenant_isolation",
    },
  });
}

/**
 * Track successful tenant access for audit logging
 */
export function trackTenantAccess(context: {
  userId: string;
  organisationId: string | null;
  role: string;
  resourceType: string;
  resourceId: string;
}) {
  // Only log in development or if explicitly enabled
  if (process.env.NODE_ENV === "development" || process.env.LOG_TENANT_ACCESS === "true") {
    logger.debug("Tenant access", {
      ...context,
      category: "audit",
    });
  }
}

/**
 * Handle ForbiddenError with monitoring
 */
export function handleTenantError(
  error: unknown,
  context: {
    userId: string;
    organisationId: string | null;
    role: string;
    resourceType: string;
    resourceId: string;
  },
): { isForbidden: boolean; message: string } {
  if (error instanceof ForbiddenError) {
    trackTenantViolation({
      ...context,
      attemptedOrgId: undefined, // Could be enhanced to extract from error
    });
    return { isForbidden: true, message: error.message };
  }
  return { isForbidden: false, message: "" };
}

/**
 * Middleware helper to wrap tenant-scoped operations with monitoring
 */
export async function withTenantMonitoring<T>(
  operation: () => Promise<T>,
  context: {
    userId: string;
    organisationId: string | null;
    role: string;
    resourceType: string;
    resourceId?: string;
  },
): Promise<T> {
  try {
    const result = await operation();

    if (context.resourceId) {
      trackTenantAccess({
        ...context,
        resourceId: context.resourceId,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof ForbiddenError && context.resourceId) {
      trackTenantViolation({
        ...context,
        resourceId: context.resourceId,
      });
    }
    throw error;
  }
}
