import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/anthropic")>();
  return { ...actual, callClaude: vi.fn() };
});

import { callClaude } from "@/lib/services/anthropic";
import { draftScorecard } from "@/lib/feedback/scorecard-draft";
import type { ScorecardField } from "@/lib/feedback/scorecard";

const fields: ScorecardField[] = [
  { label: "Problem solving", type: "rating", scale: ["Strong No", "No", "Yes", "Strong Yes"] },
  { label: "Strengths", type: "text" },
  { label: "Pairwise", type: "rating", scale: ["A", "B"] },
];

function mockClaude(json: unknown) {
  vi.mocked(callClaude).mockResolvedValue({
    text: JSON.stringify(json),
    usage: { input_tokens: 1, output_tokens: 1 },
  } as never);
}

describe("draftScorecard", () => {
  beforeEach(() => vi.mocked(callClaude).mockReset());

  it("maps a rating label to its 1-based scale index and keeps evidence", async () => {
    mockClaude({
      fields: [
        { label: "Problem solving", value: "Yes", evidence: "walked through the approach" },
        { label: "Strengths", value: "Clear communicator" },
      ],
      recommendation: "hire",
      notes: "Solid.",
    });
    const draft = await draftScorecard({ roleTitle: "Engineer", fields, transcript: "..." });
    const ps = draft.fields.find((f) => f.label === "Problem solving");
    expect(ps?.value).toBe(3); // "Yes" is index 2 → 3
    expect(ps?.evidence).toBe("walked through the approach");
    expect(draft.fields.find((f) => f.label === "Strengths")?.value).toBe("Clear communicator");
    expect(draft.recommendation).toBe("hire");
    expect(draft.overall_rating).toBe(4); // hire → 4
  });

  it("skips empty (not-assessed), off-scale, and unknown-label items", async () => {
    mockClaude({
      fields: [
        { label: "Problem solving", value: "" }, // not assessed
        { label: "Pairwise", value: "Z" }, // off-scale
        { label: "Not in template", value: "x" }, // unknown
      ],
    });
    const draft = await draftScorecard({ roleTitle: "Engineer", fields, transcript: "..." });
    expect(draft.fields).toHaveLength(0);
  });
});
