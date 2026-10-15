import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsJdBaseApproved = vi.fn();

vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  isJdBaseApproved: (...args: unknown[]) => mockIsJdBaseApproved(...args),
  JD_BASE_NOT_APPROVED_MESSAGE: "JD not approved",
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/redis/cache", () => ({
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/redis/keys", () => ({
  myPipelineKey: (id: string) => `pipeline:${id}`,
}));

describe("reprocessAgencyCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsJdBaseApproved.mockResolvedValue(true);
  });

  it("returns not found when candidate missing", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "candidates") {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({}) }),
          };
        }
        if (table === "pipeline_candidates") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [] }),
            }),
          };
        }
        if (table === "jobs") {
          return {
            select: () => ({
              eq: () => ({
                in: () => Promise.resolve({ data: [] }),
              }),
              in: () => ({
                limit: () => Promise.resolve({ data: [] }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [] }) }) }) };
      }),
    };

    const { reprocessAgencyCandidate } = await import("@/lib/agency/reprocess-candidate");
    const result = await reprocessAgencyCandidate(admin as never, {
      candidateId: "missing",
      agencyOrganisationId: "agency-1",
      clientOrgIds: ["client-1"],
    });

    expect(result).toEqual({
      candidateId: "missing",
      success: false,
      error: "Not found",
    });
  });
});
