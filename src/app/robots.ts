import type { MetadataRoute } from "next";

const SITE_URL = "https://tigerhire.io";

/**
 * Paths crawlers must never touch: authenticated app surfaces, APIs, and
 * tokenised links (offers carry compensation figures; claim/invite/assessment/
 * schedule tokens are single-use credentials). `/apply/` is intentionally
 * ABSENT — it is the public per-company application form and stays crawlable.
 */
const DISALLOWED_PATHS = [
  "/api/",
  "/admin/",
  "/company/",
  "/recruit/",
  "/agency/",
  "/employee/",
  "/candidate/",
  "/claim/",
  "/assessments/",
  "/schedule/",
  "/invite/",
  "/offers/",
  "/refer/auth",
  "/refer/login",
  "/refer/dashboard",
];

/**
 * AI-search crawlers get an explicit allow group (the operator wants TigerHire
 * citable in AI answers), but with the exact same sensitive-path disallows.
 */
const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOWED_PATHS,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
