import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockGetCostByJob = vi.fn();
const mockGetUnattributed = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role?: string }, role: string) => ctx?.role === role,
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: (_err: unknown, message: string) =>
    Response.json({ error: message }, { status: 500 }),
}));

vi.mock("@/lib/costs/query", () => ({
  getCostByJob: (...args: unknown[]) => mockGetCostByJob(...args),
  getAnthropicCostWithoutJobAttribution: (...args: unknown[]) => mockGetUnattributed(...args),
  getRangeFromDays: (raw: string | null, fallback = 30) => {
    const days = raw ? Number.parseInt(raw, 10) : fallback;
    const to = new Date("2026-05-07T00:00:00Z");
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  },
}));

function makeRequest(search = "") {
  return new NextRequest(
    `http://localhost:3000/api/admin/costs/by-job${search ? `?${search}` : ""}`,
  );
}

describe("GET /api/admin/costs/by-job", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetCostByJob.mockReset();
    mockGetUnattributed.mockReset();
    mockGetUnattributed.mockResolvedValue({ totalUsd: 0, eventsCount: 0 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/costs/by-job/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "recruiter" });
    const { GET } = await import("@/app/api/admin/costs/by-job/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns aggregated jobs with total for super_admin", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "super_admin" });
    mockGetCostByJob.mockResolvedValue([
      {
        jobId: "job-1",
        jobTitle: "Senior PM",
        organisationId: "org-1",
        totalUsd: 1.5,
        estimatedUsd: 1.5,
        invoicedUsd: 0,
        manualUsd: 0,
        eventsCount: 12,
        candidateCount: 4,
        lastActivityAt: "2026-05-07T10:00:00Z",
        byLabel: [{ label: "fitscore-hybrid-extraction", usd: 1.0, events: 8 }],
      },
      {
        jobId: "job-2",
        jobTitle: null,
        organisationId: "org-1",
        totalUsd: 0.25,
        estimatedUsd: 0.25,
        invoicedUsd: 0,
        manualUsd: 0,
        eventsCount: 3,
        candidateCount: 1,
        lastActivityAt: "2026-05-06T10:00:00Z",
        byLabel: [],
      },
    ]);

    const { GET } = await import("@/app/api/admin/costs/by-job/route");
    const res = await GET(makeRequest("rangeDays=30&limit=10"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      jobs: Array<{ jobId: string; totalUsd: number }>;
      totalUsd: number;
      totalJobs: number;
      unattributedAnthropic: { totalUsd: number; eventsCount: number };
    };
    expect(json.jobs).toHaveLength(2);
    expect(json.totalJobs).toBe(2);
    expect(json.totalUsd).toBeCloseTo(1.75, 4);
    expect(json.unattributedAnthropic).toEqual({ totalUsd: 0, eventsCount: 0 });
    expect(mockGetCostByJob).toHaveBeenCalledWith(
      expect.objectContaining({ fromIso: expect.any(String), toIso: expect.any(String) }),
      10,
    );
  });

  it("clamps limit to safe bounds", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "super_admin" });
    mockGetCostByJob.mockResolvedValue([]);
    const { GET } = await import("@/app/api/admin/costs/by-job/route");
    await GET(makeRequest("limit=99999"));
    expect(mockGetCostByJob).toHaveBeenCalledWith(expect.anything(), 200);
    await GET(makeRequest("limit=0"));
    expect(mockGetCostByJob).toHaveBeenLastCalledWith(expect.anything(), 1);
  });
});
