import { describe, it, expect } from "vitest";
import {
  buildPoolRows,
  countByReason,
  fitFor,
  reasonDetail,
  reasonLabel,
  whenLabel,
  type OpenJob,
  type PoolCandidate,
} from "@/lib/v2/talent-pool";

function candidate(over: Partial<PoolCandidate> = {}): PoolCandidate {
  return {
    applicationId: "app-1",
    candidateId: "cand-1",
    name: "Rohit E.",
    jobTitle: "Backend Engineer II",
    score: 81,
    rejectionReason: "compensation",
    expectedCtcLpa: 40,
    location: "Bengaluru",
    rejectedAt: "2026-05-14T10:00:00.000Z",
    ...over,
  };
}

/** Bands are stored in absolute rupees: ₹28–34L. */
const sbe: OpenJob = {
  id: "job-sbe",
  title: "Senior Backend Engineer",
  compensationMin: 2_800_000,
  compensationMax: 4_200_000,
  location: "Bengaluru",
};

describe("talent pool — reason vocabulary", () => {
  it("maps a reason id to its recruiter-facing label", () => {
    expect(reasonLabel("compensation")).toBe("Compensation fit");
  });

  it("never presents a missing reason as a reason in its own right", () => {
    expect(reasonLabel(null)).toBe("No reason recorded");
    expect(reasonLabel("  ")).toBe("No reason recorded");
  });

  it("puts the number that caused the rejection in the detail", () => {
    expect(reasonDetail(candidate())).toBe("Asked ₹40L");
  });

  it("does not invent a figure that was never captured", () => {
    expect(reasonDetail(candidate({ expectedCtcLpa: null }))).toBe("Compensation fit");
  });
});

/**
 * The units trap this module exists for: jobs store rupees, applications store
 * lakhs. Comparing them raw reads ₹40L as ₹40 and marks every band as fitting,
 * which would send recruiters after candidates who are still out of range.
 */
describe("talent pool — fit for", () => {
  it("matches a compensation rejection against a band that now covers the ask", () => {
    expect(fitFor(candidate({ expectedCtcLpa: 40 }), [sbe])).toEqual({
      label: "Senior Backend Engineer — band fits",
      tone: "fits",
    });
  });

  it("does not treat lakhs as rupees", () => {
    // ₹80L against a ₹28–42L band is not a fit, and is not a stretch either.
    expect(fitFor(candidate({ expectedCtcLpa: 80 }), [sbe]).tone).toBe("none");
  });

  it("calls just-above-band a stretch rather than a match", () => {
    // ₹45L against a top of ₹42L — within a tenth, so a conversation.
    expect(fitFor(candidate({ expectedCtcLpa: 45 }), [sbe])).toEqual({
      label: "Senior Backend Engineer — stretch",
      tone: "stretch",
    });
  });

  it("ignores a job with no real band", () => {
    const unbanded: OpenJob = { ...sbe, compensationMin: 0, compensationMax: 0 };
    expect(fitFor(candidate(), [unbanded]).tone).toBe("none");
  });

  it("matches a location rejection on city, ignoring the rest of the string", () => {
    const row = candidate({ rejectionReason: "location", location: "Bengaluru, Karnataka" });
    expect(fitFor(row, [sbe])).toEqual({
      label: "Senior Backend Engineer — location matches",
      tone: "fits",
    });
  });

  it("offers nothing for a rejection that another open job cannot cure", () => {
    // Missing must-have skills does not become a fit because a role is open.
    expect(fitFor(candidate({ rejectionReason: "skills" }), [sbe]).tone).toBe("none");
    expect(fitFor(candidate({ rejectionReason: null }), [sbe]).tone).toBe("none");
  });

  it("returns no match when nothing is open", () => {
    expect(fitFor(candidate(), []).tone).toBe("none");
  });
});

describe("talent pool — rows", () => {
  it("labels the month of the decision and null when it is missing", () => {
    expect(whenLabel("2026-05-14T10:00:00.000Z")).toBe("May");
    expect(whenLabel(null)).toBeNull();
    expect(whenLabel("not-a-date")).toBeNull();
  });

  it("builds every displayed column in one pass", () => {
    const [row] = buildPoolRows([candidate()], [sbe]);
    expect(row).toMatchObject({
      name: "Rohit E.",
      score: 81,
      jobTitle: "Backend Engineer II",
      reasonDetail: "Asked ₹40L",
      when: "May",
      fitFor: { label: "Senior Backend Engineer — band fits", tone: "fits" },
    });
  });

  it("counts by reason, keeping unrecorded reasons separate", () => {
    expect(
      countByReason([
        candidate(),
        candidate({ rejectionReason: "location" }),
        candidate({ rejectionReason: null }),
      ]),
    ).toEqual({ compensation: 1, location: 1, unspecified: 1 });
  });
});
