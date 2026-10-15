import type { Metadata } from "next";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

const OG_IMAGE = "https://tigerhire.io/icons/icon-512.png";

export type PublicJobMetaRow = {
  title: string;
  description: string | null;
  location: string | null;
  city: string | null;
  organisations: { name?: string } | { name?: string }[] | null;
};

/** Open jobs listed publicly — uses service role so crawlers (LinkedIn, etc.) get real previews. */
export async function fetchPublicJobForMetadata(jobId: string): Promise<PublicJobMetaRow | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("jobs")
    .select("title, description, location, city, organisations!jobs_organisation_id_fkey(name)")
    .eq("id", jobId)
    .eq("status", "open")
    .eq("list_on_public_job_board", true)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as PublicJobMetaRow;
}

function organisationName(row: PublicJobMetaRow): string | null {
  const org = row.organisations;
  if (!org) return null;
  if (Array.isArray(org)) return org[0]?.name ?? null;
  return org.name ?? null;
}

function truncateDescription(text: string, max = 200): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function buildPublicJobMetadata(
  jobId: string,
  job: PublicJobMetaRow,
  canonicalPath: `/j/${string}` | `/jobs/${string}`,
): Metadata {
  const company = organisationName(job);
  const locationLabel =
    job.location?.trim() ||
    (job.city ? job.city.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  const title = `${job.title}${locationLabel ? ` · ${locationLabel}` : ""}`;
  const description = job.description?.trim()
    ? truncateDescription(job.description)
    : `Apply for ${job.title}${company ? ` at ${company}` : ""} on ${SITE_MARKETING.brand} — ${SITE_MARKETING.tagline.toLowerCase()}.`;
  const ogTitle = company ? `${job.title} — ${company}` : `${job.title} — TigerHire`;
  const url = `https://tigerhire.io${canonicalPath}`;

  return {
    title,
    description,
    // Every job URL — including the /j/<id> share short-link, which renders the same
    // job — canonicalizes to the primary /jobs/<id> page so Google indexes one URL
    // instead of splitting signals across duplicates. Resolved against the (public)
    // layout's metadataBase (https://tigerhire.io).
    alternates: { canonical: `/jobs/${jobId}` },
    openGraph: {
      title: ogTitle,
      description,
      url,
      siteName: "TigerHire",
      type: "website",
      images: [{ url: OG_IMAGE, width: 512, height: 512, alt: ogTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}

export async function getPublicJobPageMetadata(
  jobId: string,
  canonicalPath: `/j/${string}` | `/jobs/${string}`,
): Promise<Metadata> {
  const job = await fetchPublicJobForMetadata(jobId);
  if (!job) {
    // Closed/unlisted/unknown job: noindex so crawlers drop the URL instead of
    // indexing an error shell (the client page renders its own not-found state).
    return { title: "Job not found", robots: { index: false, follow: false } };
  }
  return buildPublicJobMetadata(jobId, job, canonicalPath);
}
