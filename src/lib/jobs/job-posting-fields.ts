/**
 * Field normalisation for Google for Jobs (schema.org/JobPosting) markup.
 *
 * Split out of job-posting.ts, which builds and validates the payload. Everything
 * here answers one question — what does this job's raw column actually mean in
 * Google's vocabulary — and the India-first defaults live with the checks that
 * apply them rather than beside the payload assembly that consumes them.
 *
 * The defaults are deliberate for an India-first product, but a present-and-wrong
 * value is treated as a data bug and warned about distinctly rather than shipped:
 * Google for Jobs filters on addressCountry, so `Chennai => US` mis-surfaces or
 * drops the listing entirely.
 */

import { logger } from "@/lib/observability/logger";

export interface JobPostingInput {
  id: string;
  title: string;
  description: string;
  companyName: string;
  /** ISO timestamp the job was posted; defaults to now. */
  createdAt?: string | null;
  /** Free-text employment type; coerced to a Google enum by the builder. */
  employmentType?: string | null;
  /** Free-text city/region, if any. */
  location?: string | null;
  /** 'office' | 'remote' | 'hybrid' (jobs.location_type). */
  locationType?: string | null;
  /** Legacy boolean flag (jobs.remote_allowed). */
  remoteAllowed?: boolean | null;
  /**
   * ISO 3166-1 alpha-2 country for the physical location (jobs.country once the geo
   * migration lands). Null/undefined ⇒ documented default 'IN' (India-first product).
   * Non-ISO-2 values are rejected by the builder (distinct warn + default) so a bad
   * value can never ship in addressCountry.
   */
  country?: string | null;
  showSalary?: boolean;
  compensationMin?: number | null;
  compensationMax?: number | null;
  /**
   * ISO 4217 salary currency (jobs.compensation_currency once the geo migration lands).
   * Null/undefined ⇒ documented default 'INR'.
   */
  currency?: string | null;
  /**
   * Applicant-location requirement for remote roles. Google accepts a country name
   * ("India") or an ISO 3166-1 alpha-2 code ("IN") here, so call sites may pass the
   * job's country code directly. Null/undefined ⇒ documented default 'India'.
   */
  applicantCountry?: string | null;
}

const VALID_EMPLOYMENT_TYPES = new Set([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACTOR",
  "TEMPORARY",
  "INTERN",
  "VOLUNTEER",
  "PER_DIEM",
  "OTHER",
]);

export const DEFAULT_VALID_DAYS = 60;

/** True when the role is fully remote (Google requires TELECOMMUTE for these). */
export function isRemoteJob(input: JobPostingInput): boolean {
  const lt = (input.locationType ?? "").toString().trim().toLowerCase();
  if (lt === "remote") return true;
  if (lt === "hybrid" || lt === "office") return false;
  // No explicit location_type: fall back to the legacy flag / free-text "Remote".
  if (input.remoteAllowed === true) return true;
  const loc = (input.location ?? "").toString().trim().toLowerCase();
  return loc === "remote";
}

/** Coerce free-text employment type to a Google-accepted enum (defaults FULL_TIME). */
export function normalizeEmploymentType(raw?: string | null): string {
  const v = (raw ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return VALID_EMPLOYMENT_TYPES.has(v) ? v : "FULL_TIME";
}

export const ISO2_RE = /^[A-Za-z]{2}$/;
export const ISO_CURRENCY_RE = /^[A-Za-z]{3}$/;

/** Documented India-first defaults; see JobPostingInput field docs. */
export const DEFAULT_COUNTRY = "IN";
export const DEFAULT_CURRENCY = "INR";
export const DEFAULT_APPLICANT_COUNTRY = "India";

/**
 * Normalize the input country to an ISO-2 code. Missing ⇒ default 'IN'. A present but
 * non-ISO-2 value ("India", "USA") is a data bug — warn distinctly and default rather
 * than shipping a value Google can't filter on.
 */
export function normalizeCountry(input: JobPostingInput): string {
  const raw = (input.country ?? "").toString().trim();
  if (raw === "") return DEFAULT_COUNTRY;
  if (!ISO2_RE.test(raw)) {
    logger.warn("JobPosting country is not ISO-2; defaulting", {
      job_id: input.id,
      country_raw: raw,
      fallback: DEFAULT_COUNTRY,
    });
    return DEFAULT_COUNTRY;
  }
  return raw.toUpperCase();
}

/** Normalize the salary currency to ISO 4217. Missing ⇒ 'INR'; malformed ⇒ warn + 'INR'. */
export function normalizeCurrency(input: JobPostingInput): string {
  const raw = (input.currency ?? "").toString().trim();
  if (raw === "") return DEFAULT_CURRENCY;
  if (!ISO_CURRENCY_RE.test(raw)) {
    logger.warn("JobPosting currency is not ISO-4217; defaulting", {
      job_id: input.id,
      currency_raw: raw,
      fallback: DEFAULT_CURRENCY,
    });
    return DEFAULT_CURRENCY;
  }
  return raw.toUpperCase();
}

export function placeFromCity(city: string, country: string): Record<string, unknown> {
  return {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: city,
      addressCountry: country,
    },
  };
}

/**
 * Country-only Place for on-site jobs missing a real city. schema.org allows a
 * PostalAddress without addressLocality; Google prefers a locality but a country-only
 * address beats the old behavior of stuffing "India" (a country) into the city field.
 */
export function placeFromCountry(country: string): Record<string, unknown> {
  return {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressCountry: country,
    },
  };
}
