/**
 * Single source of truth for Google for Jobs (schema.org/JobPosting) structured data.
 *
 * Builds the JSON-LD payload AND validates the underlying job so the publish/distribution
 * path can block combinations Google rejects. The most common rejection is a fully remote
 * role that omits `jobLocationType: "TELECOMMUTE"` + `applicantLocationRequirements`; the
 * builder here always emits those together, and the validator guards the required inputs.
 *
 * Used by the public job page (JSON-LD injection) and the distribution engine (pre-publish
 * gate) so both stay consistent.
 *
 * Geography is derived from job data with India-first defaults (IN / INR / India) — the
 * defaults are deliberate for an India-first product, but call sites must pass the job's
 * real country/currency when present so agency-posted Gulf/remote-global roles don't get
 * mis-labelled. (A competitor audit found `Chennai => US` shipped in production markup;
 * Google for Jobs filters on addressCountry, so a wrong country mis-surfaces or drops
 * the listing.)
 */

import { logger } from "@/lib/observability/logger";

import {
  DEFAULT_APPLICANT_COUNTRY,
  ISO2_RE,
  ISO_CURRENCY_RE,
  DEFAULT_COUNTRY,
  DEFAULT_CURRENCY,
  DEFAULT_VALID_DAYS,
  isRemoteJob,
  normalizeCountry,
  normalizeCurrency,
  normalizeEmploymentType,
  placeFromCity,
  placeFromCountry,
  type JobPostingInput,
} from "./job-posting-fields";

/**
 * Re-exported so existing importers of this module keep working; the definitions
 * now live in ./job-posting-fields.
 */
export {
  DEFAULT_APPLICANT_COUNTRY,
  DEFAULT_COUNTRY,
  DEFAULT_CURRENCY,
  isRemoteJob,
  normalizeEmploymentType,
  type JobPostingInput,
};

export function buildJobPostingPayload(input: JobPostingInput): Record<string, unknown> {
  const created = input.createdAt ?? new Date().toISOString();
  const validThrough = new Date(
    new Date(created).getTime() + DEFAULT_VALID_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const remote = isRemoteJob(input);
  const country = normalizeCountry(input);

  const payload: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: input.title,
    description: input.description ?? "",
    identifier: {
      "@type": "PropertyValue",
      name: "TigerHire",
      value: input.id,
    },
    datePosted: created,
    validThrough,
    employmentType: normalizeEmploymentType(input.employmentType),
    hiringOrganization: {
      "@type": "Organization",
      name: input.companyName,
      sameAs: "https://tigerhire.io",
    },
    directApply: true,
    url: `https://tigerhire.io/jobs/${input.id}`,
  };

  const city = (input.location ?? "").toString().trim();
  const hasRealCity = city !== "" && city.toLowerCase() !== "remote";

  if (remote) {
    // Google for Jobs: fully remote roles MUST declare TELECOMMUTE + applicant location.
    payload.jobLocationType = "TELECOMMUTE";
    const applicantCountry = (input.applicantCountry ?? "").toString().trim();
    payload.applicantLocationRequirements = {
      "@type": "Country",
      name: applicantCountry !== "" ? applicantCountry : DEFAULT_APPLICANT_COUNTRY,
    };
    // A physical jobLocation is optional-but-allowed for remote/hybrid; include a real city.
    if (hasRealCity) {
      payload.jobLocation = placeFromCity(city, country);
    }
  } else if (hasRealCity) {
    // On-site/hybrid: a physical jobLocation is required.
    payload.jobLocation = placeFromCity(city, country);
  } else {
    // Degraded path: validateJobPostingInput blocks publishing this combination, so this
    // only fires for legacy/unvalidated rows. Emit a country-only address instead of the
    // old `addressLocality: "India"` (a country in a city field is invalid markup).
    logger.warn("JobPosting non-remote job has no city; emitting country-only address", {
      job_id: input.id,
      country,
    });
    payload.jobLocation = placeFromCountry(country);
  }

  if (input.showSalary && ((input.compensationMin ?? 0) > 0 || (input.compensationMax ?? 0) > 0)) {
    payload.baseSalary = {
      "@type": "MonetaryAmount",
      currency: normalizeCurrency(input),
      value: {
        "@type": "QuantitativeValue",
        minValue: input.compensationMin ?? 0,
        maxValue: input.compensationMax ?? 0,
        unitText: "YEAR",
      },
    };
  }

  return payload;
}

export function buildJobPostingJsonLd(input: JobPostingInput): string {
  return JSON.stringify(buildJobPostingPayload(input));
}

export interface JobPostingValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Strict pre-publish validation. Mirrors Google for Jobs' hard requirements so a recruiter
 * cannot publish a job that would be rejected from (or mis-indexed by) the jobs index.
 * The builder guarantees a valid *shape*; this guards the required *inputs* the builder
 * cannot invent (title, description, company, and a location for non-remote roles).
 */
export function validateJobPostingInput(input: JobPostingInput): JobPostingValidationResult {
  const errors: string[] = [];

  if (!input.title || !input.title.toString().trim()) {
    errors.push("Job title is required.");
  }
  if (!input.description || !input.description.toString().trim()) {
    errors.push("A job description is required for Google for Jobs indexing.");
  }
  if (!input.companyName || !input.companyName.toString().trim()) {
    errors.push("Hiring organization name is required.");
  }

  const remote = isRemoteJob(input);
  const city = (input.location ?? "").toString().trim();
  const hasRealCity = city !== "" && city.toLowerCase() !== "remote";
  if (!remote && !hasRealCity) {
    errors.push(
      "On-site/hybrid roles must specify a location, or the role must be marked remote (TELECOMMUTE).",
    );
  }

  // Geo shape checks (mirrors the builder's normalization so a value the builder would
  // refuse to emit cannot pass the publish gate either).
  const countryRaw = (input.country ?? "").toString().trim();
  if (countryRaw !== "" && !ISO2_RE.test(countryRaw)) {
    errors.push("Country must be a 2-letter ISO 3166-1 code (e.g. IN, AE, US).");
  }
  const currencyRaw = (input.currency ?? "").toString().trim();
  if (currencyRaw !== "" && !ISO_CURRENCY_RE.test(currencyRaw)) {
    errors.push("Salary currency must be a 3-letter ISO 4217 code (e.g. INR, AED, USD).");
  }

  if (input.showSalary) {
    const min = input.compensationMin ?? 0;
    const max = input.compensationMax ?? 0;
    if (min > 0 && max > 0 && min > max) {
      errors.push("Salary minimum cannot exceed the maximum.");
    }
  }

  return { valid: errors.length === 0, errors };
}
