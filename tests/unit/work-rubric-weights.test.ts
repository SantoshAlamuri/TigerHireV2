import { describe, expect, it } from "vitest";
import {
  fromDisplayWeights,
  rubricLabel,
  toDisplayWeights,
  weightTotal,
} from "@/lib/work/rubric-weights";

describe("rubric weights", () => {
  it("shows weights stored out of 100 as they are", () => {
    const d = toDisplayWeights({ core_language: 20, testing_quality: 10, system_design: 70 });
    expect(d.scale).toBe(1);
    expect(weightTotal(d.values)).toBe(100);
  });

  it("shows fractional weights as whole numbers and writes them back as fractions", () => {
    const d = toDisplayWeights({ a: 0.25, b: 0.75 });
    expect(d.values).toEqual({ a: 25, b: 75 });
    expect(fromDisplayWeights({ a: 30, b: 70 }, d.scale)).toEqual({ a: 0.3, b: 0.7 });
  });

  it("drops weights that are not usable numbers", () => {
    expect(toDisplayWeights({ a: 50, b: Number.NaN, c: -1, d: 50 }).values).toEqual({
      a: 50,
      d: 50,
    });
  });

  it("names criteria in plain words", () => {
    expect(rubricLabel("devops_cicd")).toBe("DevOps CI/CD");
    expect(rubricLabel("years_experience_level")).toBe("Years experience level");
    expect(rubricLabel("problemSolving")).toBe("Problem solving");
  });
});
