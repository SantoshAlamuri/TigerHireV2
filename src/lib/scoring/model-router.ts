import { MODELS } from "@/lib/config/models";
import { isCtcTieringEnabled } from "@/lib/feature-flags/cascade";
import { getFitscoreHybridHaikuModel, getFitscoreHybridModel } from "@/lib/config/models";

export type ScoringTier = "cheap" | "standard" | "premium";

export type ModelRouterInput = {
  organisationId?: string | null;
  ctcBand?: string | null;
  highStakes?: boolean;
};

function tierFromCtcBand(ctcBand?: string | null): ScoringTier {
  const band = (ctcBand ?? "").toLowerCase();
  if (band.includes("premium") || band.includes("lead") || band.includes("director")) {
    return "premium";
  }
  if (band.includes("junior") || band.includes("entry") || band.includes("intern")) {
    return "cheap";
  }
  return "standard";
}

/** Resolve scoring tier and primary extraction model when ff_ctc_tiering is enabled. */
export async function resolveScoringRoute(
  input: ModelRouterInput,
): Promise<{ tier: ScoringTier; model: string }> {
  const tieringOn = await isCtcTieringEnabled(input.organisationId);
  const tier: ScoringTier = input.highStakes
    ? "premium"
    : tieringOn
      ? tierFromCtcBand(input.ctcBand)
      : "standard";

  if (!tieringOn) {
    return { tier: "standard", model: getFitscoreHybridModel() };
  }

  switch (tier) {
    case "cheap":
      return { tier, model: getFitscoreHybridHaikuModel() };
    case "premium":
      return { tier, model: MODELS.SONNET };
    default:
      return { tier, model: getFitscoreHybridModel() };
  }
}
