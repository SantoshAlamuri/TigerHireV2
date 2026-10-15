import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  hiringManagerCtx,
  createTenantScopedClientMock,
} from "../helpers";

const mockGetAuthContext = vi.fn();
const mockGetTenantScopedClient = vi.fn(async () => createTenantScopedClientMock());
const mockSupabaseFrom = vi.fn();
let mockHiringRequestRecord: {
  id: string;
  organisation_id: string;
  status: string;
  assigned_job_id: string | null;
} | null = null;
vi.mock("@/lib/redis/job-cache", () => ({
  getCachedJobList: vi.fn().mockResolvedValue(null),
  setCachedJobList: vi.fn().mockResolvedValue(undefined),
  invalidateJobCache: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  getTenantScopedClient: (...args: unknown[]) => mockGetTenantScopedClient(...args),
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
  },
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({
        error: err.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockListResult = {
  jobs: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
};
const mockCreateResult = { id: "j-new", title: "Test Job" };

vi.mock("@/lib/services/JobService", () => ({
  JobService: {
    list: vi.fn().mockResolvedValue(mockListResult),
    create: vi.fn().mockResolvedValue(mockCreateResult),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockSupabaseFrom(...args),
    }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockConsumeManualCredits = vi.fn();
vi.mock("@/lib/services/manual-billing", () => ({
  consumeManualCredits: (...args: unknown[]) => mockConsumeManualCredits(...args),
}));

describe("GET /api/jobs", () => {
  it("denies candidate access to staff application-count summaries", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/jobs/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/jobs?view=summary"));
    expect(response.status).toBe(403);
  });

  it("passes summary projection while retaining recruiter organisation scope", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/jobs/route");
    const { JobService } = await import("@/lib/services/JobService");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/jobs?view=summary&status=draft&page=2&limit=20"),
    );
    expect(response.status).toBe(200);
    expect(JobService.list).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        view: "summary",
        status: "draft",
        page: 2,
        limit: 20,
        organisationId: recruiterCtx.organisationId,
      }),
    );
  });

  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockHiringRequestRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      organisation_id: companyAdminCtx.organisationId as string,
      status: "approved",
      assigned_job_id: null,
    };
    mockSupabaseFrom.mockReset();
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "hiring_requests") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockHiringRequestRecord, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === "agency_clients") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { client_organisation_id: companyAdminCtx.organisationId },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    });
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs");
    const res = await GET(req);
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 200 with jobs for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs?page=1&limit=10");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toBeDefined();
  });

  it("returns 200 for candidate (sees only open jobs)", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs?page=1&limit=10");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/jobs", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockConsumeManualCredits.mockReset();
    mockConsumeManualCredits.mockResolvedValue({ applied: false });
    mockHiringRequestRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      organisation_id: companyAdminCtx.organisationId as string,
      status: "approved",
      assigned_job_id: null,
    };
    mockSupabaseFrom.mockReset();
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "hiring_requests") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockHiringRequestRecord, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === "agency_clients") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { client_organisation_id: companyAdminCtx.organisationId },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    });
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test",
        description: "Test description that is long enough for validation",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", description: "d".repeat(50) }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid body", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 201 when job is created", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Senior Engineer",
        description: "d".repeat(55),
        status: "open",
        hiringRequestId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.job).toBeDefined();
  });

  it("returns 409 when requisition link is missing for company flows", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Senior Engineer",
        description: "d".repeat(55),
        status: "open",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 409 when requisition is not approved", async () => {
    mockHiringRequestRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      organisation_id: companyAdminCtx.organisationId as string,
      status: "under_review",
      assigned_job_id: null,
    };
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Senior Engineer",
        description: "d".repeat(55),
        status: "open",
        hiringRequestId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 409 when requisition is already linked", async () => {
    mockHiringRequestRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      organisation_id: companyAdminCtx.organisationId as string,
      status: "approved",
      assigned_job_id: "job-existing",
    };
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Senior Engineer",
        description: "d".repeat(55),
        status: "open",
        hiringRequestId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 400 when hiring manager has no org", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...hiringManagerCtx,
      organisationId: null,
    });
    const { POST } = await import("@/app/api/jobs/route");
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Role",
        description: "d".repeat(55),
        status: "open",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
