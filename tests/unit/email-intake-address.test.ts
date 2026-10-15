import { describe, it, expect } from "vitest";
import { buildJobIntakeAddress, EMAIL_INTAKE_DOMAIN } from "@/lib/config/email-intake";

// Mirrors ADDRESS_JOB_PATTERN in src/app/api/intake/email/route.ts — the address the
// recruiter UI surfaces MUST be parseable by the intake route, or CVs won't route.
const ADDRESS_JOB_PATTERN = /jobs\+([0-9a-f-]{36})@/i;

describe("buildJobIntakeAddress", () => {
  const jobId = "11111111-2222-4333-8444-555555555555";

  it("builds jobs+<id>@<intake-domain>", () => {
    expect(buildJobIntakeAddress(jobId)).toBe(`jobs+${jobId}@${EMAIL_INTAKE_DOMAIN}`);
  });

  it("returns null for missing/blank ids", () => {
    expect(buildJobIntakeAddress(null)).toBeNull();
    expect(buildJobIntakeAddress(undefined)).toBeNull();
    expect(buildJobIntakeAddress("   ")).toBeNull();
  });

  it("round-trips: the intake route pattern extracts the same job id back", () => {
    const address = buildJobIntakeAddress(jobId)!;
    const match = address.match(ADDRESS_JOB_PATTERN);
    expect(match?.[1]).toBe(jobId);
  });
});
