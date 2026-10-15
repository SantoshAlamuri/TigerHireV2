import { describe, it, expect } from "vitest";
import { passedScreeningAnswer } from "@/lib/screening/fetch-application-screening-display";

describe("passedScreeningAnswer", () => {
  it("fail on yes: no passes, yes fails", () => {
    expect(passedScreeningAnswer(true, false)).toBe(true);
    expect(passedScreeningAnswer(true, true)).toBe(false);
  });

  it("fail on no: yes passes, no fails", () => {
    expect(passedScreeningAnswer(false, true)).toBe(true);
    expect(passedScreeningAnswer(false, false)).toBe(false);
  });
});
