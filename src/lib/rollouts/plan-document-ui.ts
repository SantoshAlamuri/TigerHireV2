import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";

/**
 * Client bundle: aligned with `isPlanDocumentNavActive()` (server `FF_PLAN_DOCUMENT` or
 * `NEXT_PUBLIC_FF_PLAN_DOCUMENT`).
 */
export function isPlanDocumentUiEnabled(): boolean {
  return isPlanDocumentNavActive();
}

/** Client: stage-entry automation (comms, screening, slot picker). Requires plan document flag. */
export function isPlanAutoExecuteUiEnabled(): boolean {
  if (!isPlanDocumentUiEnabled()) return false;
  const pub = process.env.NEXT_PUBLIC_FF_PLAN_AUTO_EXECUTE;
  if (process.env.NODE_ENV === "production") {
    return pub === "true";
  }
  return pub === "true";
}
