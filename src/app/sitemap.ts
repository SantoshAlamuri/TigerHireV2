import type { MetadataRoute } from "next";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";

const SITE_URL = "https://tigerhire.io";

/** Hard cap on total sitemap entries (Google's own per-file limit is 50k). */
const MAX_SITEMAP_ENTRIES = 5000;

const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/agencies",
  "/blog",
  "/candidates",
  "/companies",
  "/contact",
  "/dpa",
  "/jobs",
  "/pricing",
  "/privacy",
  "/product",
  "/refer",
  "/terms",
  "/waitlist",
] as const;

/**
 * Blog posts are a hardcoded catalogue in `src/app/(public)/blog/[slug]/page.tsx`
 * (BLOG_POSTS). Keep this list in sync when posts are added there.
 */
const BLOG_SLUGS = [
  "why-ai-scoring-is-the-next-evolution-of-talent-acquisition",
  "how-we-reduced-time-to-fill-by-12-days",
  "what-your-cv-scores-against-a-typical-startup-jd",
] as const;

type JobSitemapRow = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  posted_at: string | null;
};

/**
 * Publicly listed, TigerHire-owned jobs for the sitemap.
 *
 * Visibility mirrors GET /api/jobs/public (status='open',
 * list_on_public_job_board=true, is_active=true, hidden demo orgs excluded);
 * ownership mirrors `isOwnedJob` in /jobs/[id] (source='tigerhire' or null —
 * aggregated/scraped jobs are excluded so we never sitemap-list third-party
 * postings). Never throws: on any failure it logs and returns [] so the
 * sitemap still serves the static routes.
 */
async function fetchPublicJobEntries(limit: number): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createSupabaseAdmin();

    const hiddenOrgSlugs = env.hiddenPublicJobOrgSlugs;
    let hiddenOrgIds: string[] = [];
    if (hiddenOrgSlugs.length > 0) {
      const { data: hiddenOrgs, error: hiddenOrgError } = await supabase
        .from("organisations")
        .select("id")
        .in("slug", hiddenOrgSlugs);
      if (hiddenOrgError) throw hiddenOrgError;
      hiddenOrgIds = (hiddenOrgs ?? []).map((o) => o.id as string).filter(Boolean);
    }

    let query = supabase
      .from("jobs")
      .select("id, created_at, updated_at, posted_at")
      .eq("status", "open")
      .eq("list_on_public_job_board", true)
      .eq("is_active", true)
      .or("source.eq.tigerhire,source.is.null")
      .limit(limit);

    if (hiddenOrgIds.length > 0) {
      query = query.not("organisation_id", "in", `(${hiddenOrgIds.join(",")})`);
    }

    const { data: rows, error } = await query.order("posted_at", {
      ascending: false,
      nullsFirst: false,
    });
    if (error) throw error;

    return ((rows ?? []) as JobSitemapRow[]).map((row) => ({
      url: `${SITE_URL}/jobs/${row.id}`,
      lastModified: new Date(row.updated_at ?? row.posted_at ?? row.created_at ?? Date.now()),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    logger.warn("sitemap_public_jobs_query_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  const blogEntries: MetadataRoute.Sitemap = BLOG_SLUGS.map((slug) => ({
    url: `${SITE_URL}/blog/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const jobBudget = MAX_SITEMAP_ENTRIES - staticEntries.length - blogEntries.length;
  const jobEntries = await fetchPublicJobEntries(jobBudget);

  return [...staticEntries, ...blogEntries, ...jobEntries].slice(0, MAX_SITEMAP_ENTRIES);
}
