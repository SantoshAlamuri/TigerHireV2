import { describe, it, expect } from "vitest";
import {
  SENIORITY_LEVELS,
  normalizeSeniority,
  inferRoleFunction,
} from "@/lib/candidate/resume-inference";

describe("normalizeSeniority", () => {
  it("snaps common free-text titles to a valid level", () => {
    expect(normalizeSeniority("Sr. Software Engineer")).toBe("Senior");
    expect(normalizeSeniority("SDE II")).toBe("Senior");
    expect(normalizeSeniority("Junior Developer")).toBe("Junior");
    expect(normalizeSeniority("Engineering Manager")).toBe("Manager");
    expect(normalizeSeniority("Staff Engineer")).toBe("Lead");
    expect(normalizeSeniority("VP of Engineering")).toBe("VP");
    expect(normalizeSeniority("CTO")).toBe("C-Suite");
    expect(normalizeSeniority("Intern")).toBe("Intern");
  });

  it("always returns a valid level or null", () => {
    for (const raw of ["Senior", "gibberish xyz", "", null, undefined]) {
      const out = normalizeSeniority(raw);
      expect(
        out === null || SENIORITY_LEVELS.includes(out as (typeof SENIORITY_LEVELS)[number]),
      ).toBe(true);
    }
  });
});

describe("inferRoleFunction", () => {
  it("maps titles to a function", () => {
    expect(inferRoleFunction("Senior Backend Engineer")).toBe("Engineering");
    expect(inferRoleFunction("Product Manager")).toBe("Product");
    expect(inferRoleFunction("UX Designer")).toBe("Design");
    expect(inferRoleFunction("Account Executive")).toBe("Sales");
    expect(inferRoleFunction("Talent Acquisition Partner")).toBe("HR");
    expect(inferRoleFunction("Growth Marketing Lead")).toBe("Marketing");
  });

  it("returns null when nothing matches", () => {
    expect(inferRoleFunction("Astronaut")).toBeNull();
    expect(inferRoleFunction("")).toBeNull();
  });
});
