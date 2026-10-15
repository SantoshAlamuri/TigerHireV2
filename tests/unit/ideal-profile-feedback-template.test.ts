import { describe, expect, it } from "vitest";
import {
  IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME,
  buildFeedbackFieldsFromIdealProfile,
} from "@/lib/feedback/ideal-profile-feedback-template";

describe("buildFeedbackFieldsFromIdealProfile", () => {
  it("creates rating rows for benchmarks and must-haves plus narrative fields", () => {
    const fields = buildFeedbackFieldsFromIdealProfile({
      summary: "Senior IC with ownership.",
      must_haves: ["Go production experience", "Distributed systems"],
      nice_to_haves: ["Mentorship"],
      years_range: "5-9 years",
      benchmarks: {
        system_design: "Can design fault-tolerant services with clear tradeoffs.",
      },
    });

    expect(fields.some((f) => f.label === "System Design" && f.type === "rating")).toBe(true);
    expect(fields.some((f) => f.label.includes("Go production") && f.required)).toBe(true);
    expect(fields.some((f) => f.label === "Mentorship" && f.type === "rating" && !f.required)).toBe(
      true,
    );
    expect(fields.some((f) => f.label === "Experience vs role expectation")).toBe(true);
    expect(fields.some((f) => f.label === "Strengths vs ideal profile" && f.type === "text")).toBe(
      true,
    );
    expect(fields.some((f) => f.label === "Gaps or risks vs ideal profile")).toBe(true);
  });

  it("dedupes duplicate labels", () => {
    const fields = buildFeedbackFieldsFromIdealProfile({
      summary: "X",
      must_haves: ["Same", "Same"],
      nice_to_haves: [],
      years_range: "",
      benchmarks: {},
    });
    const sameLabels = fields.filter((f) => f.label.startsWith("Same"));
    expect(sameLabels).toHaveLength(2);
    expect(sameLabels[0].label).toBe("Same");
    expect(sameLabels[1].label).toMatch(/^Same \(\d+\)$/);
  });
});

describe("IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME", () => {
  it("is stable for UI defaulting", () => {
    expect(IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME.length).toBeGreaterThan(5);
  });
});
