/**
 * Indeed job board connector. Pushes/removes jobs via Indeed Job Sync API (GraphQL).
 * Supports per-organisation credentials with tenant isolation.
 * Falls back to global env vars (INDEED_ACCESS_TOKEN) if no org credentials.
 *
 * Note: Indeed API access requires signing up as a Publisher at indeed.com/publisher
 * and obtaining OAuth credentials. The access token should be refreshed externally.
 */

import { getIndeedCredentials } from "../credentials";
import { normalizeSections, toLegacyView } from "@/lib/jobs/normalize-sections";

const INDEED_GRAPHQL_ENDPOINT = "https://apis.indeed.com/graphql";

export interface JobForDistribution {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  show_salary: boolean | null;
  slug?: string | null;
  jd_sections?: Record<string, unknown> | null;
}

export interface PushResult {
  success: boolean;
  externalId?: string;
}

export interface DeleteResult {
  success: boolean;
}

/**
 * Parse location string to extract city/region for India.
 * Handles formats like "Bangalore", "Mumbai, Maharashtra", "Delhi NCR", etc.
 */
function parseLocationForIndia(location: string | null): string {
  if (!location) return "India";

  // Remove common suffixes and normalize
  const normalized = location
    .trim()
    .replace(/\s*,\s*India\s*$/i, "")
    .replace(/\s*,\s*IN\s*$/i, "");

  // If it contains a comma, take the first part (city)
  const parts = normalized.split(",");
  const city = parts[0]?.trim() || "India";

  return city || "India";
}

/**
 * Extract benefits from jd_sections (supports both v2 dynamic and legacy formats).
 */
function extractBenefits(jdSections: Record<string, unknown> | null | undefined): string[] {
  if (!jdSections) return [];
  const legacy = toLegacyView(normalizeSections(jdSections));
  const benefits = legacy.benefits;
  if (Array.isArray(benefits)) {
    return benefits.filter((b): b is string => typeof b === "string");
  }
  if (typeof benefits === "string") {
    return [benefits];
  }
  return [];
}

/**
 * Build the apply URL for a job.
 */
function buildApplyUrl(jobId: string, organisationSlug?: string | null): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io";
  if (organisationSlug) {
    return `${baseUrl}/apply/${organisationSlug}?job=${jobId}`;
  }
  return `${baseUrl}/apply?job=${jobId}`;
}

/**
 * Escape strings for GraphQL (replace newlines, quotes, backslashes).
 */
function escapeGraphQL(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/**
 * Push a job to Indeed using Job Sync API (GraphQL).
 * @param organisationId - Organisation ID for tenant-isolated credentials
 */
export async function pushJobToIndeed(
  job: JobForDistribution,
  organisationName: string,
  organisationSlug?: string | null,
  organisationId?: string | null,
): Promise<PushResult> {
  const credentials = await getIndeedCredentials(organisationId);
  if (!credentials || !credentials.access_token) {
    return { success: false };
  }

  const accessToken = credentials.access_token;

  const applyUrl = buildApplyUrl(job.id, organisationSlug);
  const locationStr = parseLocationForIndia(job.location);
  const legacy = job.jd_sections ? toLegacyView(normalizeSections(job.jd_sections)) : {};
  const description =
    job.description ?? (typeof legacy.summary === "string" ? legacy.summary : "") ?? "";

  const benefits = extractBenefits(job.jd_sections);

  // Escape strings for GraphQL
  const titleEscaped = escapeGraphQL(job.title);
  const descriptionEscaped = escapeGraphQL(description);
  const locationEscaped = escapeGraphQL(locationStr);
  const companyNameEscaped = escapeGraphQL(organisationName);
  const jobIdEscaped = escapeGraphQL(job.id);
  const applyUrlEscaped = escapeGraphQL(applyUrl);

  // Build benefits array in GraphQL format
  const benefitsStr =
    benefits.length > 0
      ? `benefits: [${benefits.map((b) => `"${escapeGraphQL(b)}"`).join(", ")}]`
      : "";

  // Build GraphQL mutation
  const mutation = `mutation CreateJobPosting {
  jobsIngest {
    createSourcedJobPostings(
      input: {
        jobPostings: [{
          body: {
            title: "${titleEscaped}"
            description: "${descriptionEscaped}"
            location: {
              country: "IN"
              cityRegionPostal: "${locationEscaped}"
            }
            ${benefitsStr}
          }
          metadata: {
            jobSource: {
              companyName: "${companyNameEscaped}"
              sourceName: "TigerHire"
              sourceType: "Employer"
            }
            jobPostingId: "${jobIdEscaped}"
            datePublished: "${new Date().toISOString()}"
            url: "${applyUrlEscaped}"
          }
        }]
      }
    ) {
      jobPostings {
        id
        externalId
      }
      errors {
        message
        code
      }
    }
  }
}`;

  try {
    const res = await fetch(INDEED_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: mutation }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Indeed push failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      data?: {
        jobsIngest?: {
          createSourcedJobPostings?: {
            jobPostings?: Array<{ id?: string; externalId?: string }>;
            errors?: Array<{ message?: string; code?: string }>;
          };
        };
      };
      errors?: Array<{ message?: string }>;
    };

    // Check for GraphQL errors
    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e) => e.message).join(", ");
      throw new Error(`Indeed GraphQL errors: ${errorMessages}`);
    }

    // Check for mutation-specific errors
    const mutationResult = data.data?.jobsIngest?.createSourcedJobPostings;
    if (mutationResult?.errors && mutationResult.errors.length > 0) {
      const errorMessages = mutationResult.errors
        .map((e) => e.message || e.code || "Unknown error")
        .join(", ");
      throw new Error(`Indeed mutation errors: ${errorMessages}`);
    }

    // Extract external ID
    const jobPosting = mutationResult?.jobPostings?.[0];
    const externalId = jobPosting?.externalId ?? jobPosting?.id ?? undefined;

    return { success: true, externalId };
  } catch (err) {
    throw err;
  }
}

/**
 * Remove a job from Indeed by external ID using GraphQL mutation.
 * @param organisationId - Organisation ID for tenant-isolated credentials
 */
export async function deleteJobFromIndeed(
  externalId: string,
  organisationId?: string | null,
): Promise<DeleteResult> {
  const credentials = await getIndeedCredentials(organisationId);
  if (!credentials || !credentials.access_token) {
    return { success: false };
  }

  const accessToken = credentials.access_token;

  // Escape external ID for GraphQL
  const externalIdEscaped = escapeGraphQL(externalId);

  // Indeed uses expireJobPosting mutation to remove jobs
  const mutation = `mutation ExpireJobPosting {
  jobsIngest {
    expireSourcedJobPostings(
      input: {
        externalIds: ["${externalIdEscaped}"]
      }
    ) {
      success
      errors {
        message
        code
      }
    }
  }
}`;

  try {
    const res = await fetch(INDEED_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: mutation }),
    });

    if (!res.ok) {
      // 404 means job already removed or doesn't exist - treat as success
      if (res.status === 404) {
        return { success: true };
      }
      const text = await res.text();
      throw new Error(`Indeed delete failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      data?: {
        jobsIngest?: {
          expireSourcedJobPostings?: {
            success?: boolean;
            errors?: Array<{ message?: string; code?: string }>;
          };
        };
      };
      errors?: Array<{ message?: string }>;
    };

    // Check for GraphQL errors
    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e) => e.message).join(", ");
      throw new Error(`Indeed GraphQL errors: ${errorMessages}`);
    }

    // Check for mutation-specific errors
    const mutationResult = data.data?.jobsIngest?.expireSourcedJobPostings;
    if (mutationResult?.errors && mutationResult.errors.length > 0) {
      // If error is "not found", treat as success (already removed)
      const notFoundError = mutationResult.errors.find(
        (e) => e.code === "NOT_FOUND" || e.message?.toLowerCase().includes("not found"),
      );
      if (notFoundError) {
        return { success: true };
      }
      const errorMessages = mutationResult.errors
        .map((e) => e.message || e.code || "Unknown error")
        .join(", ");
      throw new Error(`Indeed mutation errors: ${errorMessages}`);
    }

    return { success: mutationResult?.success ?? true };
  } catch (err) {
    throw err;
  }
}
