import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_FITSCORE_V5 } from "./constants";

/**
 * Server-side gate for v5 "outcomes-weighted" scoring. Shadow-first: this only controls whether
 * the v5 score is computed into the shadow slot for comparison — it never changes the live score.
 * Enable via `FF_FITSCORE_V5=true` (env, all orgs) or the per-org `fitscore_v5` feature flag.
 */
export async function isFitScoreV5Enabled(organisationId?: string | null): Promise<boolean> {
  if (process.env.FF_FITSCORE_V5 === "true") return true;
  if (organisationId) {
    return isEnabled(FEATURE_FLAG_FITSCORE_V5, organisationId);
  }
  return false;
}
