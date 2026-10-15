import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildJobPostingPayload,
  isRemoteJob,
  normalizeEmploymentType,
  validateJobPostingInput,
  type JobPostingInput,
} from "@/lib/jobs/job-posting";
import { logger } from "@/lib/observability/logger";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(logger.warn).mockClear();
});

const base: JobPostingInput = {
  id: "job-1",
  title: "Backend Engineer",
  description: "Build APIs.",
  companyName: "Acme",
  createdAt: "2026-07-01T00:00:00.000Z",
  location: "Bengaluru",
};

describe("isRemoteJob", () => {
  it("treats location_type=remote as remote", () => {
    expect(isRemoteJob({ ...base, locationType: "remote" })).toBe(true);
  });
  it("treats hybrid/office as non-remote even with remote_allowed", () => {
    expect(isRemoteJob({ ...base, locationType: "hybrid", remoteAllowed: true })).toBe(false);
    expect(isRemoteJob({ ...base, locationType: "office" })).toBe(false);
  });
  it("falls back to remote_allowed flag and free-text 'Remote'", () => {
    expect(isRemoteJob({ ...base, location: null, remoteAllowed: true })).toBe(true);
    expect(isRemoteJob({ ...base, location: "Remote" })).toBe(true);
    expect(isRemoteJob({ ...base, location: "Bengaluru" })).toBe(false);
  });
});

describe("buildJobPostingPayload", () => {
  it("emits jobLocationType TELECOMMUTE + applicantLocationRequirements for remote roles", () => {
    const p = buildJobPostingPayload({ ...base, location: null, locationType: "remote" });
    expect(p.jobLocationType).toBe("TELECOMMUTE");
    expect(p.applicantLocationRequirements).toMatchObject({ "@type": "Country", name: "India" });
  });

  it("emits a physical jobLocation and no TELECOMMUTE for on-site roles", () => {
    const p = buildJobPostingPayload(base);
    expect(p.jobLocationType).toBeUndefined();
    expect(p.jobLocation).toMatchObject({
      "@type": "Place",
      address: { addressLocality: "Bengaluru", addressCountry: "IN" },
    });
  });

  it("includes a real city as jobLocation even when remote (hybrid case)", () => {
    const p = buildJobPostingPayload({ ...base, location: "Bengaluru", locationType: "remote" });
    expect(p.jobLocationType).toBe("TELECOMMUTE");
    expect(p.jobLocation).toMatchObject({ address: { addressLocality: "Bengaluru" } });
  });

  it("adds baseSalary only when show_salary and a value are present", () => {
    expect(buildJobPostingPayload(base).baseSalary).toBeUndefined();
    const p = buildJobPostingPayload({
      ...base,
      showSalary: true,
      compensationMin: 1500000,
      compensationMax: 2500000,
    });
    expect(p.baseSalary).toMatchObject({ currency: "INR" });
  });

  it("sets validThrough 60 days after datePosted", () => {
    const p = buildJobPostingPayload(base);
    expect(p.datePosted).toBe("2026-07-01T00:00:00.000Z");
    expect(p.validThrough).toBe("2026-08-30T00:00:00.000Z");
  });

  it("passes through job country to addressCountry (uppercased)", () => {
    const p = buildJobPostingPayload({ ...base, location: "Dubai", country: "ae" });
    expect(p.jobLocation).toMatchObject({
      address: { addressLocality: "Dubai", addressCountry: "AE" },
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("defaults country to IN when absent or empty (India-first product)", () => {
    expect(buildJobPostingPayload(base).jobLocation).toMatchObject({
      address: { addressCountry: "IN" },
    });
    expect(buildJobPostingPayload({ ...base, country: "  " }).jobLocation).toMatchObject({
      address: { addressCountry: "IN" },
    });
  });

  it("refuses a non-ISO-2 country: warns distinctly and defaults to IN", () => {
    const p = buildJobPostingPayload({ ...base, country: "India" });
    expect(p.jobLocation).toMatchObject({ address: { addressCountry: "IN" } });
    expect(logger.warn).toHaveBeenCalledWith(
      "JobPosting country is not ISO-2; defaulting",
      expect.objectContaining({ job_id: "job-1", country_raw: "India" }),
    );
  });

  it("passes through salary currency (uppercased) and defaults to INR", () => {
    const withSalary = { ...base, showSalary: true, compensationMin: 100, compensationMax: 200 };
    expect(buildJobPostingPayload({ ...withSalary, currency: "aed" }).baseSalary).toMatchObject({
      currency: "AED",
    });
    expect(buildJobPostingPayload(withSalary).baseSalary).toMatchObject({ currency: "INR" });
  });

  it("refuses a malformed currency: warns distinctly and defaults to INR", () => {
    const p = buildJobPostingPayload({
      ...base,
      showSalary: true,
      compensationMin: 100,
      compensationMax: 200,
      currency: "₹",
    });
    expect(p.baseSalary).toMatchObject({ currency: "INR" });
    expect(logger.warn).toHaveBeenCalledWith(
      "JobPosting currency is not ISO-4217; defaulting",
      expect.objectContaining({ job_id: "job-1", currency_raw: "₹" }),
    );
  });

  it("passes through applicantCountry for remote roles (ISO code accepted)", () => {
    const p = buildJobPostingPayload({
      ...base,
      location: null,
      locationType: "remote",
      applicantCountry: "AE",
    });
    expect(p.applicantLocationRequirements).toMatchObject({ "@type": "Country", name: "AE" });
  });

  it("emits a country-only address (no addressLocality:'India') when a non-remote job has no city", () => {
    const p = buildJobPostingPayload({ ...base, location: null, locationType: "office" });
    const address = (p.jobLocation as { address: Record<string, unknown> }).address;
    expect(address).toEqual({ "@type": "PostalAddress", addressCountry: "IN" });
    expect(address).not.toHaveProperty("addressLocality");
    expect(logger.warn).toHaveBeenCalledWith(
      "JobPosting non-remote job has no city; emitting country-only address",
      expect.objectContaining({ job_id: "job-1", country: "IN" }),
    );
  });

  it("keeps remote TELECOMMUTE behavior unchanged with geo fields present", () => {
    const p = buildJobPostingPayload({
      ...base,
      location: null,
      locationType: "remote",
      country: "AE",
      currency: "AED",
    });
    expect(p.jobLocationType).toBe("TELECOMMUTE");
    expect(p.applicantLocationRequirements).toMatchObject({ "@type": "Country", name: "India" });
    expect(p.jobLocation).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("normalizeEmploymentType", () => {
  it("normalizes free text to a Google enum and defaults to FULL_TIME", () => {
    expect(normalizeEmploymentType("full time")).toBe("FULL_TIME");
    expect(normalizeEmploymentType("Part-Time")).toBe("PART_TIME");
    expect(normalizeEmploymentType("gibberish")).toBe("FULL_TIME");
    expect(normalizeEmploymentType(null)).toBe("FULL_TIME");
  });
});

describe("validateJobPostingInput", () => {
  it("passes a complete on-site job", () => {
    expect(validateJobPostingInput(base)).toEqual({ valid: true, errors: [] });
  });

  it("passes a remote job with no city", () => {
    const r = validateJobPostingInput({ ...base, location: null, locationType: "remote" });
    expect(r.valid).toBe(true);
  });

  it("blocks a non-remote job with no location", () => {
    const r = validateJobPostingInput({ ...base, location: null });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/location/i);
  });

  it("blocks missing title / description / company", () => {
    expect(validateJobPostingInput({ ...base, title: "" }).valid).toBe(false);
    expect(validateJobPostingInput({ ...base, description: "  " }).valid).toBe(false);
    expect(validateJobPostingInput({ ...base, companyName: "" }).valid).toBe(false);
  });

  it("accepts real ISO country/currency codes and blocks malformed ones", () => {
    expect(validateJobPostingInput({ ...base, country: "AE", currency: "AED" }).valid).toBe(true);
    const badCountry = validateJobPostingInput({ ...base, country: "India" });
    expect(badCountry.valid).toBe(false);
    expect(badCountry.errors.join(" ")).toMatch(/ISO 3166/);
    const badCurrency = validateJobPostingInput({ ...base, currency: "Rupees" });
    expect(badCurrency.valid).toBe(false);
    expect(badCurrency.errors.join(" ")).toMatch(/ISO 4217/);
  });

  it("still passes when country/currency are absent (defaults apply)", () => {
    expect(validateJobPostingInput(base)).toEqual({ valid: true, errors: [] });
  });

  it("blocks an inverted salary range when shown", () => {
    const r = validateJobPostingInput({
      ...base,
      showSalary: true,
      compensationMin: 2500000,
      compensationMax: 1500000,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/minimum/i);
  });
});
