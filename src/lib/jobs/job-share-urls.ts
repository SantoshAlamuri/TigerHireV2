/** Client-safe base URL for public job / apply links. */
export function getAppBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io";
}

export function buildPublicJobPageUrl(jobId: string, baseUrl = getAppBaseUrl()): string {
  return `${baseUrl}/j/${jobId}`;
}

export function buildPublicApplyUrl(
  jobId: string,
  orgSlug: string,
  baseUrl = getAppBaseUrl(),
): string {
  return `${baseUrl}/apply/${encodeURIComponent(orgSlug)}?job=${encodeURIComponent(jobId)}`;
}

/** Apply URL when org slug exists; otherwise the public job page. */
export function getPreferredJobShareUrl(
  jobId: string,
  orgSlug?: string | null,
  baseUrl = getAppBaseUrl(),
): string {
  const slug = orgSlug?.trim();
  if (slug) return buildPublicApplyUrl(jobId, slug, baseUrl);
  return buildPublicJobPageUrl(jobId, baseUrl);
}

/** Public job page — best for LinkedIn / social previews (role title + full JD). */
export function getSocialJobShareUrl(jobId: string, baseUrl = getAppBaseUrl()): string {
  return buildPublicJobPageUrl(jobId, baseUrl);
}

/** Opens LinkedIn's share dialog for a public job URL (company page posts, DMs, etc.). */
export function buildLinkedInShareUrl(targetUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(targetUrl)}`;
}
