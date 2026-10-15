import { describe, expect, it } from "vitest";
import { findBestIndiaTemplate } from "@/lib/fitscore/hybrid/jd-india-templates";
import { selectRubric } from "@/lib/fitscore/hybrid/select-rubric";

describe("selectRubric", () => {
  it("matches Backend Engineer job title to a template (not generic fallback)", () => {
    const jdBlob =
      "Backend Engineer\nNode.js, PostgreSQL, REST APIs, system design, microservices.";
    const rubric = selectRubric(jdBlob);
    expect(rubric.fallbackUsed).toBe(false);
    expect(rubric.template).not.toBeNull();
    expect(rubric.matchScore).toBeGreaterThanOrEqual(2);
  });

  it("returns generic fallback when no template matches", () => {
    const rubric = selectRubric("Qwzxlk\n(No role keywords at all.)");
    expect(rubric.fallbackUsed).toBe(true);
    expect(rubric.template).toBeNull();
    expect(rubric.rubricId).toBe("template-generic");
  });

  it("title-line bonus improves findBestIndiaTemplate for exact title", () => {
    const match = findBestIndiaTemplate("Backend Engineer\nNode.js, PostgreSQL, REST APIs");
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThanOrEqual(2);
  });
});
