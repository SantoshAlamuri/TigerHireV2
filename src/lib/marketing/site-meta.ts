/**
 * Canonical marketing copy for SEO (meta, Open Graph, Twitter), PWA text, and shared taglines.
 * Aligns with positioning: global hiring intelligence platform — verdicts, not just match %.
 */
export const SITE_MARKETING = {
  brand: "TigerHire",
  /** Primary positioning (sentence case) */
  tagline: "Global hiring intelligence platform",
  /** Default meta description */
  description:
    "TigerHire helps teams hire with evidence: the JD Intelligence agent turns job descriptions into approved rubrics, FitScore explains every candidate against that bar, and verdicts combine score, ideal match, and market context — plus pipeline and WhatsApp where candidates already are.",
  /** Tighter blurbs (CTAs, manifest, root fallback) */
  descriptionShort:
    "Faster, defensible hiring — explainable, role-specific scoring for global teams.",
  /** Social / OG secondary line */
  ogDescription:
    "JD Intelligence rubrics, HM-approved FitScore, clear verdicts, full ATS — candidates on WhatsApp, your team on the web.",
  /** Under wordmark in footer (uppercase tracking in UI) */
  logoTagline: "KNOW WHO TO HIRE",
  /** Default title for root layout */
  defaultTitle: "TigerHire | Global Hiring Intelligence Platform",
} as const;

export const SITE_KEYWORDS = [
  "global hiring intelligence platform",
  "talent intelligence",
  "explainable hiring",
  "role-specific scoring",
  "hiring verdict",
  "whatsapp hiring",
  "recruitment agencies worldwide",
] as const;
