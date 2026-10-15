import { describe, it, expect } from "vitest";
import { mapDbJobToPosting } from "@/lib/mappers";

describe("mapDbJobToPosting", () => {
  it("maps matched_count to matchedCandidatesCount", () => {
    const row = {
      id: "job-1",
      organisation_id: "org-1",
      title: "Engineer",
      description: "Build things",
      role_function: "Engineering",
      seniority_level: "Mid",
      location: "Remote",
      remote_allowed: true,
      skills_required: [],
      skills_preferred: [],
      compensation_min: 0,
      compensation_max: 0,
      status: "open",
      urgency_score: 50,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      matched_count: 12,
    };
    const view = mapDbJobToPosting(row);
    expect(view.matchedCandidatesCount).toBe(12);
  });

  it("defaults matchedCandidatesCount when matched_count is missing", () => {
    const row = {
      id: "job-2",
      organisation_id: "org-1",
      title: "Designer",
      description: "Design things here with enough words in the description field",
      role_function: "Design",
      seniority_level: "Mid",
      location: "Remote",
      remote_allowed: false,
      skills_required: [],
      skills_preferred: [],
      compensation_min: 0,
      compensation_max: 0,
      status: "open",
      urgency_score: 40,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    const view = mapDbJobToPosting(row);
    expect(view.matchedCandidatesCount).toBe(0);
  });
});
