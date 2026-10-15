/**
 * Adzuna job board connector. Pushes/removes jobs via Adzuna partner API.
 * Supports per-organisation credentials with tenant isolation.
 * Falls back to global env vars (ADZUNA_APP_ID, ADZUNA_APP_KEY) if no org credentials.
 */

import { getAdzunaCredentials, type AdzunaCredentials } from "../credentials";
import { normalizeSections, toLegacyView } from "@/lib/jobs/normalize-sections";

const ADZUNA_BASE = "https://api.adzuna.com/v1/api";

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
 * Push a job to Adzuna. Uses partner API when credentials are set.
 * @param organisationId - Organisation ID for tenant-isolated credentials
 */
export async function pushJobToAdzuna(
  job: JobForDistribution,
  organisationName: string,
  organisationSlug?: string | null,
  organisationId?: string | null,
): Promise<PushResult> {
  const credentials = await getAdzunaCredentials(organisationId);
  if (!credentials || !credentials.app_id || !credentials.app_key) {
    return { success: false };
  }

  const auth = {
    app_id: credentials.app_id,
    app_key: credentials.app_key,
  };

  const applyUrl = organisationSlug
    ? `https://tigerhire.io/apply/${organisationSlug}?job=${job.id}`
    : `https://tigerhire.io/apply?job=${job.id}`;

  const legacy = job.jd_sections ? toLegacyView(normalizeSections(job.jd_sections)) : {};
  const body: Record<string, unknown> = {
    title: job.title,
    description: job.description ?? (legacy.summary as string) ?? "",
    location: (legacy.location as string) ?? job.location ?? "",
    company: organisationName,
    apply_url: applyUrl,
    contract_type: (legacy.employmentType as string) ?? "permanent",
    category: "it-jobs",
  };

  if (job.show_salary === true) {
    if (job.compensation_min != null) body.salary_min = job.compensation_min;
    if (job.compensation_max != null) body.salary_max = job.compensation_max;
  }

  if (credentials.advertiser_id) {
    body.advertiser_id = credentials.advertiser_id;
  }

  const qs = new URLSearchParams(auth).toString();
  const url = `${ADZUNA_BASE}/jobs?${qs}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Adzuna push failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { id?: string; external_id?: string };
    const externalId = data.external_id ?? data.id ?? undefined;
    return { success: true, externalId };
  } catch (err) {
    throw err;
  }
}

/**
 * Remove a job from Adzuna by external ID.
 * @param organisationId - Organisation ID for tenant-isolated credentials
 */
export async function deleteJobFromAdzuna(
  externalId: string,
  organisationId?: string | null,
): Promise<DeleteResult> {
  const credentials = await getAdzunaCredentials(organisationId);
  if (!credentials || !credentials.app_id || !credentials.app_key) {
    return { success: false };
  }

  const auth = {
    app_id: credentials.app_id,
    app_key: credentials.app_key,
  };

  const qs = new URLSearchParams(auth).toString();
  const url = `${ADZUNA_BASE}/jobs/${encodeURIComponent(externalId)}?${qs}`;

  try {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`Adzuna delete failed ${res.status}: ${text}`);
    }
    return { success: true };
  } catch (err) {
    throw err;
  }
}
