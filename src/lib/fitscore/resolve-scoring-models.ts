import { getFitscoreHybridHaikuModel, getFitscoreHybridModel, MODELS } from "@/lib/config/models";
import {
  isCtcTieringEnabled,
  isHaikuExtractionEnabled,
  isPathUnificationEnabled,
} from "@/lib/feature-flags/cascade";
import { isMergedExtractionVerdictEnabled } from "@/lib/fitscore/hybrid/constants";
import type { FitScoreScoringSource } from "@/lib/fitscore/scoring-source";
import { resolveScoringRoute } from "@/lib/scoring/model-router";

/** Whether scoring uses the merged extraction+verdict LLM path. */
export async function resolveUseMergedExtractionPath(params: {
  organisationId?: string | null;
  scoringSource?: FitScoreScoringSource;
}): Promise<boolean> {
  if (params.scoringSource === "tryout") return true;
  if (await isPathUnificationEnabled(params.organisationId)) return true;
  return isMergedExtractionVerdictEnabled();
}

export type ResolvedExtractionModels = {
  model: string;
  scoringTier?: string;
};

/** Model for hybrid extraction / merged verdict (Haiku when ff_haiku_extraction). */
export async function resolveHybridExtractionModel(params: {
  organisationId?: string | null;
  scoringSource?: FitScoreScoringSource;
  ctcBand?: string | null;
}): Promise<string> {
  const resolved = await resolveHybridExtractionModelWithTier(params);
  return resolved.model;
}

export async function resolveHybridExtractionModelWithTier(params: {
  organisationId?: string | null;
  scoringSource?: FitScoreScoringSource;
  ctcBand?: string | null;
}): Promise<ResolvedExtractionModels> {
  if (params.scoringSource === "tryout") {
    return { model: getFitscoreHybridHaikuModel(), scoringTier: "cheap" };
  }
  if (await isCtcTieringEnabled(params.organisationId)) {
    const route = await resolveScoringRoute({
      organisationId: params.organisationId,
      ctcBand: params.ctcBand,
    });
    return { model: route.model, scoringTier: route.tier };
  }
  if (await isHaikuExtractionEnabled(params.organisationId)) {
    return { model: getFitscoreHybridHaikuModel(), scoringTier: "cheap" };
  }
  return { model: getFitscoreHybridModel(), scoringTier: "standard" };
}

/** Model for cv-parser-text when explicitly parsing CV body (Haiku when ff_haiku_extraction). */
export async function resolveCvParseModel(organisationId?: string | null): Promise<string> {
  if (await isHaikuExtractionEnabled(organisationId)) {
    return getFitscoreHybridHaikuModel();
  }
  if (typeof process !== "undefined" && process.env.ANTHROPIC_CV_PARSE_MODEL) {
    return process.env.ANTHROPIC_CV_PARSE_MODEL;
  }
  return MODELS.SONNET;
}
