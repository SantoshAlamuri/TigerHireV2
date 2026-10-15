import { describe, it, expect } from "vitest";
import { resolveDirectReferrerAmount } from "@/lib/agents/payout-trigger";

/**
 * Which rate a direct referrer is paid at.
 *
 * job_referral_config carries three rates for the direct slot — generic,
 * employee, and candidate-as-referrer — because three kinds of person can
 * refer. Only two were ever read, so a job with a candidate-referral rate
 * configured quietly paid the generic rate and the setting did nothing.
 */
const base = {
  directAmount: 15000,
  employeeAmount: 25000,
  candidateReferrerAmount: 8000,
  isOrgVerified: false,
  isCandidate: false,
  candidateReferralsEnabled: true,
};

describe("resolveDirectReferrerAmount", () => {
  it("pays the candidate rate when a candidate made the referral", () => {
    expect(resolveDirectReferrerAmount({ ...base, isCandidate: true })).toBe(8000);
  });

  it("pays the generic rate for an ordinary referrer", () => {
    expect(resolveDirectReferrerAmount(base)).toBe(15000);
  });

  it("prefers the employee rate — staff referrals are a different scheme", () => {
    expect(resolveDirectReferrerAmount({ ...base, isOrgVerified: true, isCandidate: true })).toBe(
      25000,
    );
  });

  it("falls back to generic when candidate referrals are switched off for the job", () => {
    expect(
      resolveDirectReferrerAmount({
        ...base,
        isCandidate: true,
        candidateReferralsEnabled: false,
      }),
    ).toBe(15000);
  });

  it("treats a zero candidate rate as unset rather than paying nothing", () => {
    // "Configured as 0" and "never configured" are indistinguishable in this
    // table, and paying a referrer nothing is the worse of the two readings.
    expect(
      resolveDirectReferrerAmount({ ...base, isCandidate: true, candidateReferrerAmount: 0 }),
    ).toBe(15000);
  });

  it("survives a NaN rate from a null column", () => {
    expect(
      resolveDirectReferrerAmount({ ...base, isCandidate: true, candidateReferrerAmount: NaN }),
    ).toBe(15000);
    expect(resolveDirectReferrerAmount({ ...base, isOrgVerified: true, employeeAmount: NaN })).toBe(
      15000,
    );
  });
});

describe("milestones the engine can actually fire", () => {
  it("still refuses to derive day 90 from a status change", async () => {
    // Unchanged invariant, for a changed reason. Day 90 now pays — but not from
    // here. No status transition means "still employed ninety days later", and
    // mapping one to it is what made the option pay nobody for five months.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const engine = readFileSync(join(process.cwd(), "src/lib/agents/payout-trigger.ts"), "utf8");
    expect(engine).toMatch(/"shortlisted" \| "offer_accepted"/);
    expect(engine).not.toMatch(/norm === "day_90"/);
  });

  it("pays day 90 from a dated sweep, anchored on the joining date", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sweep = readFileSync(join(process.cwd(), "src/lib/referrals/day90-sweep.ts"), "utf8");

    // The anchor is the recorded first day, not the moment the hire was marked.
    // Scoped to findDueDay90Hires — the function that decides who gets paid —
    // rather than the whole file: countAwaitingJoinDate legitimately bounds its
    // "stalled for want of a start date" warning by hired_at, and a file-wide
    // regex cannot tell a payout decision from a diagnostic count. Asserting on
    // the deciding function protects the invariant more tightly, not less.
    const dueFn = sweep
      .slice(
        sweep.indexOf("export async function findDueDay90Hires"),
        sweep.indexOf("async function countAwaitingJoinDate"),
      )
      // Code only. The next function's doc comment discusses hired_at in prose,
      // and prose is not what decides who gets paid.
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n");
    expect(dueFn.length).toBeGreaterThan(0);
    expect(dueFn).toMatch(/\.lte\("joined_at"/);
    expect(dueFn).not.toMatch(/hired_at/);
    expect(sweep).toMatch(/triggerEvent: "day_90"/);

    // And the form no longer warns that it pays nobody.
    const form = readFileSync(
      join(process.cwd(), "src/components/dashboard/JobReferralBonusFormFields.tsx"),
      "utf8",
    );
    expect(form).toMatch(/value: "day_90"[\s\S]{0,140}live: true/);
  });
});
