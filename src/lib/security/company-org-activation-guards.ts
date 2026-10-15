import type { UserRole } from "@/types/database";

/** Full-screen notice until TigerHire approves the company organisation. */
export const COMPANY_PENDING_ACTIVATION_PATH = "/company/pending-activation";

/** Dashboard HTML routes blocked until activation (pending page itself is excluded). */
export function companyActivationShouldBlockDashboardPath(
  role: UserRole | null,
  pathname: string,
): boolean {
  if (!role || role === "super_admin") return false;
  if (
    pathname === COMPANY_PENDING_ACTIVATION_PATH ||
    pathname.startsWith(`${COMPANY_PENDING_ACTIVATION_PATH}/`)
  ) {
    return false;
  }
  const gatedPrefixes = [
    "/home",
    "/setup",
    "/company",
    "/recruit",
    "/employee",
    "/profile",
    "/messages",
    "/notifications",
    "/support-requests",
    "/dashboard/referrer",
  ];
  return gatedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** API routes that remain allowed while activation is pending. */
export function companyActivationApiPathAllowed(pathname: string): boolean {
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}
