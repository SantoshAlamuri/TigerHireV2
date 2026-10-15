import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockValidateOrigin = vi.fn(() => null);
const mockListCampaigns = vi.fn();
const mockReplaceCampaignJobs = vi.fn();
const mockGetCampaignDetail = vi.fn();
const mockGetCampaignById = vi.fn();
const mockUpsertCampaignRecipients = vi.fn();
const mockCreateCampaignEvent = vi.fn();
const mockBuildCampaignMetrics = vi.fn();
const mockEnqueue = vi.fn();

const mockCampaignsTable = {
  insert: vi.fn(),
  update: vi.fn(),
};

const mockFrom = vi.fn((table: string) => {
  if (table === "referral_campaigns") return mockCampaignsTable;
  return {
    update: vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    })),
  };
});

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (payload: unknown, status = 200) => Response.json(payload, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
  handleZodError: () => Response.json({ error: "Validation error" }, { status: 422 }),
  parseJsonBody: async (request: Request) => {
    try {
      return { body: await request.json(), errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (req: Request) => mockValidateOrigin(req),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("@/lib/referrers/campaigns", () => ({
  assertCanManageReferralCampaigns: (role: string) =>
    role === "leadership" || role === "recruiter" || role === "super_admin",
  listCampaigns: (...args: unknown[]) => mockListCampaigns(...args),
  replaceCampaignJobs: (...args: unknown[]) => mockReplaceCampaignJobs(...args),
  getCampaignDetail: (...args: unknown[]) => mockGetCampaignDetail(...args),
  getCampaignById: (...args: unknown[]) => mockGetCampaignById(...args),
  upsertCampaignRecipients: (...args: unknown[]) => mockUpsertCampaignRecipients(...args),
  createCampaignEvent: (...args: unknown[]) => mockCreateCampaignEvent(...args),
  buildCampaignMetrics: (...args: unknown[]) => mockBuildCampaignMetrics(...args),
}));

describe("referral campaigns routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaignsTable.insert.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: { id: "camp-1", name: "April sprint", status: "draft" },
            error: null,
          }),
      }),
    });
    mockCampaignsTable.update.mockReturnValue({
      eq: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { id: "camp-1", name: "Updated", status: "active" },
                error: null,
              }),
          }),
        }),
      }),
    });
  });

  it("GET /api/referral-campaigns returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/referral-campaigns/route");
    const response = await GET(new Request("http://localhost:3000/api/referral-campaigns"));
    expect(response.status).toBe(401);
  });

  it("POST /api/referral-campaigns creates campaign and links jobs", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "leadership",
      organisationId: "org-1",
    });
    const { POST } = await import("@/app/api/referral-campaigns/route");
    const request = new Request("http://localhost:3000/api/referral-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Q2 referral push",
        objective: "more_referrals",
        audienceFilter: "all_referrers",
        startsAt: null,
        endsAt: null,
        jobIds: ["11111111-1111-4111-8111-111111111111"],
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockReplaceCampaignJobs).toHaveBeenCalled();
  });

  it("POST /api/referral-campaigns/[id]/launch returns 409 for ended campaign", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "leadership",
      organisationId: "org-1",
    });
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      status: "ended",
      audience_filter: "all_referrers",
      launched_at: null,
    });
    const { POST } = await import("@/app/api/referral-campaigns/[id]/launch/route");
    const request = new Request("http://localhost:3000/api/referral-campaigns/camp-1/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize: 25 }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "camp-1" }),
    });
    expect(response.status).toBe(409);
  });

  it("POST /api/referral-campaigns/[id]/launch can be called repeatedly", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "leadership",
      organisationId: "org-1",
    });
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      status: "active",
      audience_filter: "all_referrers",
      launched_at: new Date().toISOString(),
    });
    mockUpsertCampaignRecipients.mockResolvedValue({ inserted: 4, total: 4 });
    mockEnqueue.mockResolvedValue({ id: "evt-1" });

    const { POST } = await import("@/app/api/referral-campaigns/[id]/launch/route");
    const req1 = new Request("http://localhost:3000/api/referral-campaigns/camp-1/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize: 25 }),
    });
    const req2 = new Request("http://localhost:3000/api/referral-campaigns/camp-1/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize: 25 }),
    });

    const first = await POST(req1, { params: Promise.resolve({ id: "camp-1" }) });
    const second = await POST(req2, { params: Promise.resolve({ id: "camp-1" }) });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it("GET /api/referral-campaigns/[id]/metrics returns 404 when missing", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "leadership",
      organisationId: "org-1",
    });
    mockBuildCampaignMetrics.mockResolvedValue(null);
    const { GET } = await import("@/app/api/referral-campaigns/[id]/metrics/route");
    const response = await GET(
      new Request("http://localhost:3000/api/referral-campaigns/camp-1/metrics"),
      {
        params: Promise.resolve({ id: "camp-1" }),
      },
    );
    expect(response.status).toBe(404);
  });
});
