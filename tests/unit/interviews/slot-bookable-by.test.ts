import { describe, expect, it } from "vitest";
import { isCandidatePickerBookable, isSelfServeBookable } from "@/lib/interviews/slot-bookable-by";

describe("slot-bookable-by", () => {
  it("treats null/undefined as both for self-serve", () => {
    expect(isSelfServeBookable(null)).toBe(true);
    expect(isSelfServeBookable(undefined)).toBe(true);
  });

  it("filters interviewer-only slots from candidate surfaces", () => {
    expect(isSelfServeBookable("interviewer")).toBe(false);
    expect(isCandidatePickerBookable("interviewer")).toBe(false);
    expect(isSelfServeBookable("candidate")).toBe(true);
    expect(isSelfServeBookable("both")).toBe(true);
  });
});
