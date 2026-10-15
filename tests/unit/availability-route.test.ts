import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const recruiterCtx = {
  userId: "u1",
  role: "recruiter" as const,
  organisationId: "org-1",
};

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(),
  requireAuth: (ctx: unknown) => !!ctx,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
        }),
      };
    }
  },
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  handleZodError: () => new Response(JSON.stringify({ error: "Invalid payload" }), { status: 422 }),
  jsonSuccess: (data: unknown, status?: number) =>
    new Response(JSON.stringify(data), { status: status ?? 200 }),
}));

const mockFrom = vi.fn();
const mockAgencyClientsQuery = () => ({
  select: () => ({
    eq: () => Promise.resolve({ data: [], error: null }),
  }),
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser: vi.fn() }, from: mockFrom }),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockAdminFrom(...args) }),
}));

vi.mock("@/lib/calendar/scheduling-recruiter-notify", () => ({
  safeNotifyRecruiterSlotsPublished: vi.fn(),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

describe("GET /api/jobs/[id]/availability", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/jobs/[id]/availability/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/availability");
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 200 and slots when user has access", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    const slotsData = [
      {
        id: "s1",
        start_at: "2027-03-01T10:00:00Z",
        end_at: "2027-03-01T10:30:00Z",
        timezone: "Asia/Kolkata",
        status: "available",
        pipeline_candidate_id: null,
        user_id: "u-owner",
      },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: jobData, error: null }),
            }),
          }),
        };
      }
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  order: () => Promise.resolve({ data: slotsData, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ id: "u-owner", full_name: "Alex Recruiter" }],
                error: null,
              }),
          }),
        };
      }
      return {};
    });
    const { GET } = await import("@/app/api/jobs/[id]/availability/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/availability");
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0].id).toBe("s1");
    expect(body.slots[0].slot_owner).toEqual({
      id: "u-owner",
      display_name: "Alex Recruiter",
    });
  });
});

describe("POST /api/jobs/[id]/availability", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/jobs/[id]/availability/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/availability", {
      method: "POST",
      body: JSON.stringify({
        slots: [
          {
            start_at: "2027-03-01T10:00:00Z",
            end_at: "2027-03-01T10:30:00Z",
          },
        ],
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 422 when slots array is empty or missing", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs")
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: jobData, error: null }),
            }),
          }),
        };
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/availability/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/availability", {
      method: "POST",
      body: JSON.stringify({ slots: [] }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(422);
  });

  it("returns 201 and created slots when valid slots provided", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    const insertedSlots = [
      {
        id: "s1",
        start_at: "2027-03-01T10:00:00Z",
        end_at: "2027-03-01T10:30:00Z",
        timezone: "Asia/Kolkata",
      },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      return {};
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          insert: () => ({
            select: () => Promise.resolve({ data: insertedSlots, error: null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    });
    const { POST } = await import("@/app/api/jobs/[id]/availability/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/availability", {
      method: "POST",
      body: JSON.stringify({
        slots: [
          {
            start_at: "2027-03-01T10:00:00Z",
            end_at: "2027-03-01T10:30:00Z",
          },
        ],
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0].id).toBe("s1");
    expect(body.slots[0].timezone).toBe("Asia/Kolkata");
  });
});
