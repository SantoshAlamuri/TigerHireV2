import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_FITSCORE_BLEND_V2 } from "./constants";

/** Server-side: env var or org feature flag. */
export async function isFitScoreBlendV2Enabled(organisationId?: string | null): Promise<boolean> {
  if (process.env.FF_FITSCORE_BLEND_V2 === "true") return true;
  if (organisationId) {
    return isEnabled(FEATURE_FLAG_FITSCORE_BLEND_V2, organisationId);
  }
  return false;
}

/** Client bundles: public env only. */
export function isFitScoreBlendV2EnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_FF_FITSCORE_BLEND_V2 === "true";
}
