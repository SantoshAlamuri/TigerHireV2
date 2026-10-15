import { describe, it, expect } from "vitest";
import {
  computeJobReadiness,
  deriveScoringStatus,
  isFullyReady,
  isJdPublished,
  mapRequisitionStatus,
} from "@/lib/jobs/job-readiness";

describe("isJdPublished", () => {
  it("returns published when description is long enough", () => {
    const result = isJdPublished("a".repeat(120), null);
    expect(result.published).toBe(true);
    expect(result.char_count).toBe(120);
  });

  it("returns published when structured sections have content", () => {
    const result = isJdPublished("", {
      version: 2,
      sections: [{ id: "about", label: "About", type: "text", value: "x".repeat(120) }],
    });
    expect(result.published).toBe(true);
  });

  it("returns missing when both are short", () => {
    const result = isJdPublished("short", null);
    expect(result.published).toBe(false);
  });
});

describe("mapRequisitionStatus", () => {
  it("maps converted to approved", () => {
    expect(mapRequisitionStatus("hr-1", "converted")).toBe("approved");
  });

  it("maps missing link to not_linked", () => {
    expect(mapRequisitionStatus(null, null)).toBe("not_linked");
  });

  it("maps submitted to pending", () => {
    expect(mapRequisitionStatus("hr-1", "submitted")).toBe("pending");
  });

  it("maps cancelled to rejected", () => {
    expect(mapRequisitionStatus("hr-1", "cancelled")).toBe("rejected");
  });
});

describe("deriveScoringStatus", () => {
  it("returns legacy_path when hybrid disabled", () => {
    expect(
      deriveScoringStatus({
        hybrid_v2_enabled: false,
        jd_base_status: "not_applicable",
        hybrid_v2_count: 2,
        legacy_count: 0,
        total: 2,
      }),
    ).toBe("legacy_path");
  });

  it("returns inactive when jd base not approved", () => {
    expect(
      deriveScoringStatus({
        hybrid_v2_enabled: true,
        jd_base_status: "not_generated",
        hybrid_v2_count: 0,
        legacy_count: 0,
        total: 0,
      }),
    ).toBe("inactive");
  });

  it("returns needs_rescore when legacy scores remain", () => {
    expect(
      deriveScoringStatus({
        hybrid_v2_enabled: true,
        jd_base_status: "approved",
        hybrid_v2_count: 1,
        legacy_count: 2,
        total: 3,
      }),
    ).toBe("needs_rescore");
  });
});

describe("computeJobReadiness / isFullyReady", () => {
  const base = {
    hybrid_v2_enabled: true,
    hiring_request_id: "hr-1",
    req_status: "converted",
    req_code: "REQ-ENG-2026-001",
    reviewer_name: "Alex",
    on_hold_reason: null,
    description: "x".repeat(150),
    jd_sections: null,
    jd_base_id: "jb-1",
    approved_by: "user-1",
    approved_at: "2026-05-01T00:00:00Z",
    approver_name: "Priya",
    hybrid_v2_count: 3,
    legacy_count: 0,
    pending_scoring_count: 0,
  };

  it("marks fully ready when requisition converted, jd, ideal profile, and v2 scores", () => {
    const readiness = computeJobReadiness(base);
    expect(readiness.scoring.status).toBe("all_v2");
    expect(isFullyReady(readiness)).toBe(true);
  });

  it("is not fully ready when ideal profile missing", () => {
    const readiness = computeJobReadiness({
      ...base,
      jd_base_id: null,
      approved_by: null,
      approver_name: null,
      approved_at: null,
    });
    expect(readiness.jd_base.status).toBe("not_generated");
    expect(readiness.scoring.status).toBe("inactive");
    expect(isFullyReady(readiness)).toBe(false);
  });

  it("allows not_linked requisition in fully ready check", () => {
    const readiness = computeJobReadiness({
      ...base,
      hiring_request_id: null,
      req_status: null,
      req_code: null,
    });
    expect(readiness.requisition.status).toBe("not_linked");
    expect(isFullyReady(readiness)).toBe(true);
  });
});
