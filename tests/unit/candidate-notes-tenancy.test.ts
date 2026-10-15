import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guardrail for the 2026-07-28 audit finding: `/api/candidates/[id]/notes` uses the
 * service-role client (RLS bypassed), and `candidate_notes` carries org identity only
 * through `job_id`. Without an explicit job filter, org A could read org B's private
 * notes on any candidate who applied to both, and inject notes into org B's jobs.
 *
 * Source-level assertions (the route's own logic is not unit-testable without a live
 * DB), mirroring the pattern in llm-schema-guardrails.test.ts.
 */
const ROUTE = path.join(process.cwd(), "src/app/api/candidates/[id]/notes/route.ts");

function routeSource(): string {
  return fs.readFileSync(ROUTE, "utf-8");
}

describe("candidate notes tenancy guardrails", () => {
  it("derives accessible job ids from the caller's organisations", () => {
    const src = routeSource();
    expect(src).toContain("async function getAccessibleJobIds");
    expect(src).toMatch(/from\("jobs"\)[\s\S]{0,120}\.in\("organisation_id", orgIds\)/);
  });

  it("rejects an explicit job_id the caller's orgs do not own", () => {
    const src = routeSource();
    expect(src).toMatch(
      /jobId && ctx\.role !== "super_admin" && !accessibleJobIds\.includes\(jobId\)/,
    );
  });

  it("constrains untagged-note reads to the caller's own notes", () => {
    const src = routeSource();
    expect(src).toContain("job_id.is.null,author_id.eq.");
  });

  it("verifies job ownership before inserting a job-tagged note", () => {
    const src = routeSource();
    const postSection = src.slice(src.indexOf("export async function POST"));
    expect(postSection).toContain("getAccessibleJobIds");
    expect(postSection).toMatch(/!accessibleJobIds\.includes\(parsed\.data\.jobId\)/);
  });

  it("honours agency_clients.is_active when expanding agency org access", () => {
    const src = routeSource();
    expect(src).toMatch(/agency_clients[\s\S]{0,200}\.eq\("is_active", true\)/);
  });
});

describe("otp generators use a CSPRNG", () => {
  it("referrer + offer OTPs do not use Math.random", () => {
    for (const rel of ["src/lib/services/referrer-otp.ts", "src/lib/offers/offer-public-link.ts"]) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
      // Match the call, not prose — the fix comments name Math.random deliberately.
      expect(src, `${rel} must not generate OTPs with Math.random()`).not.toMatch(
        /Math\.random\s*\(/,
      );
      expect(src).toContain("crypto.randomInt");
    }
  });
});
