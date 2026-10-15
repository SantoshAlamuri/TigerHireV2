import { describe, it, expect } from "vitest";
import { buildEvidencePack, type EvidenceInput } from "@/lib/v2/evidence-pack";

/**
 * The evidence pack is what makes a review decision take fifteen seconds
 * instead of fifteen minutes: quoted lines organised into "for / verify /
 * against", each citing where it came from.
 *
 * Two hard rules come from this codebase's own history:
 *  - never display a quote we cannot attribute (unverified resume quotes were
 *    an explicit correctness convention after the FitScore audit)
 *  - never invent a gap the rubric didn't ask for
 */
function input(over: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    reasons: [],
    flags: [],
    screeningAnswers: [],
    rubricMustHaves: [],
    ...over,
  };
}

describe("buildEvidencePack", () => {
  it("withholds missing-evidence sentinels from columns and counts", () => {
    const p = buildEvidencePack(
      input({
        reasons: [{ text: " NO_DEFENSIBLE_QUOTE ", polarity: "positive", source: "cv" }],
        flags: [{ label: "NO_DEFENSIBLE_QUOTE", tier: "green" }],
      }),
    );
    expect(p.for).toEqual([]);
    expect(p.counts).toEqual({ for: 0, verify: 0, against: 0 });
    expect(p.isEmpty).toBe(true);
  });

  it("returns three empty columns rather than throwing when nothing is scored yet", () => {
    const p = buildEvidencePack(input());
    expect(p.for).toEqual([]);
    expect(p.verify).toEqual([]);
    expect(p.against).toEqual([]);
    expect(p.isEmpty).toBe(true);
  });

  it("puts a positive quoted reason in the 'for' column with its citation", () => {
    const p = buildEvidencePack(
      input({
        reasons: [
          { text: "Led migration of order service to Kafka", polarity: "positive", source: "cv" },
        ],
      }),
    );
    expect(p.for).toHaveLength(1);
    expect(p.for[0].quote).toContain("Kafka");
    expect(p.for[0].citation).toMatch(/cv/i);
  });

  it("drops any item it cannot attribute — never show an unsourced quote", () => {
    const p = buildEvidencePack(
      input({
        reasons: [
          { text: "Seems strong technically", polarity: "positive", source: null },
          { text: "Owned Postgres sharding", polarity: "positive", source: "cv" },
        ],
      }),
    );
    expect(p.for).toHaveLength(1);
    expect(p.for[0].quote).toContain("Postgres");
    expect(p.droppedUnattributed).toBe(1);
  });

  it("routes amber flags to 'verify' so the interview knows what to probe", () => {
    const p = buildEvidencePack(
      input({ flags: [{ label: "Kubernetes claimed, no incident described", tier: "amber" }] }),
    );
    expect(p.verify).toHaveLength(1);
    expect(p.verify[0].quote).toMatch(/Kubernetes/);
  });

  it("routes red flags to 'against'", () => {
    const p = buildEvidencePack(input({ flags: [{ label: "No payments domain", tier: "red" }] }));
    expect(p.against).toHaveLength(1);
  });

  it("treats green flags as supporting evidence", () => {
    const p = buildEvidencePack(input({ flags: [{ label: "On-call ownership", tier: "green" }] }));
    expect(p.for).toHaveLength(1);
  });

  it("includes screening answers as first-class evidence, cited to WhatsApp", () => {
    const p = buildEvidencePack(
      input({
        screeningAnswers: [
          { question: "Comfortable with on-call?", answer: "Yes — ran a weekly rotation" },
        ],
      }),
    );
    expect(p.for[0].citation).toMatch(/screening/i);
    expect(p.for[0].quote).toContain("weekly rotation");
  });

  it("skips blank or unanswered screening questions", () => {
    const p = buildEvidencePack(
      input({
        screeningAnswers: [
          { question: "Notice period?", answer: "" },
          { question: "Location?", answer: "   " },
        ],
      }),
    );
    expect(p.for).toEqual([]);
  });

  it("flags a must-have with no supporting evidence as something to verify", () => {
    const p = buildEvidencePack(
      input({
        rubricMustHaves: ["Distributed systems at scale", "Postgres beyond CRUD"],
        reasons: [{ text: "Sharded a 2TB Postgres order DB", polarity: "positive", source: "cv" }],
      }),
    );
    // Postgres is evidenced; distributed systems is not — that becomes a probe.
    const unevidenced = p.verify.filter((v) => v.kind === "unevidenced-must-have");
    expect(unevidenced).toHaveLength(1);
    expect(unevidenced[0].quote).toMatch(/Distributed systems/);
  });

  it("does not invent gaps the rubric never asked for", () => {
    const p = buildEvidencePack(
      input({ reasons: [{ text: "No Rust experience", polarity: "negative", source: "cv" }] }),
    );
    expect(p.against).toHaveLength(1);
    expect(p.verify.filter((v) => v.kind === "unevidenced-must-have")).toHaveLength(0);
  });

  it("counts every column so the UI can show totals without recounting", () => {
    const p = buildEvidencePack(
      input({
        reasons: [{ text: "Kafka at 40k msg/s", polarity: "positive", source: "cv" }],
        flags: [
          { label: "K8s unproven", tier: "amber" },
          { label: "No payments domain", tier: "red" },
        ],
      }),
    );
    expect(p.counts).toEqual({ for: 1, verify: 1, against: 1 });
    expect(p.isEmpty).toBe(false);
  });

  it("de-duplicates the same point arriving from two sources", () => {
    const p = buildEvidencePack(
      input({
        reasons: [
          { text: "On-call ownership", polarity: "positive", source: "cv" },
          { text: "on-call ownership", polarity: "positive", source: "screening" },
        ],
      }),
    );
    expect(p.for).toHaveLength(1);
  });
});
