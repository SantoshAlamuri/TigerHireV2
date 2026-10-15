import { isEnabled } from "@/lib/feature-flags";

/** V3 scoring cascade feature flag keys (seeded in feature_flags; default OFF). */
export const CASCADE_FLAG_KEYS = {
  pathUnification: "ff_path_unification",
  haikuExtraction: "ff_haiku_extraction",
  structuredJd: "ff_structured_jd",
  whatsappGate: "ff_whatsapp_gate",
  cascadeRerank: "ff_cascade_rerank",
  ctcTiering: "ff_ctc_tiering",
} as const;

export type CascadeFlagKey = (typeof CASCADE_FLAG_KEYS)[keyof typeof CASCADE_FLAG_KEYS];

export async function isPathUnificationEnabled(organisationId?: string | null): Promise<boolean> {
  return isEnabled(CASCADE_FLAG_KEYS.pathUnification, organisationId);
}

export async function isHaikuExtractionEnabled(organisationId?: string | null): Promise<boolean> {
  return isEnabled(CASCADE_FLAG_KEYS.haikuExtraction, organisationId);
}

export async function isStructuredJdEnabled(organisationId?: string | null): Promise<boolean> {
  return isEnabled(CASCADE_FLAG_KEYS.structuredJd, organisationId);
}

export async function isWhatsappGateEnabled(organisationId?: string | null): Promise<boolean> {
  return isEnabled(CASCADE_FLAG_KEYS.whatsappGate, organisationId);
}

export async function isCascadeRerankEnabled(organisationId?: string | null): Promise<boolean> {
  return isEnabled(CASCADE_FLAG_KEYS.cascadeRerank, organisationId);
}

export async function isCtcTieringEnabled(organisationId?: string | null): Promise<boolean> {
  return isEnabled(CASCADE_FLAG_KEYS.ctcTiering, organisationId);
}
