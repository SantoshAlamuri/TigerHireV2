function normalizePath(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/$/, "") || pathname;
}

/** True for any route under the dedicated Setup shell (`/setup/*`). */
export function isSetupAppPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return normalized === "/setup" || normalized.startsWith("/setup/");
}

/** Setup hub landing — cards are the primary nav; sidebar is omitted. */
export function isSetupLandingPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return normalized === "/setup";
}
