import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  hiringManagerCtx,
  agencyCtx,
} from "../helpers";

const mockGetAuthContext = vi.fn();
const mockAssertJobAccess = vi.fn();
const mockOrganisationsQuery = vi.fn();
const mockGetTenantScopedClient = vi.fn(() =>
  Promise.resolve({
    assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
    raw: {},
    organisations: () => mockOrganisationsQuery(),
  }),
);
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
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

const mockGetCachedJobDetail = vi.fn();
const mockSetCachedJobDetail = vi.fn();
const mockInvalidateJobCache = vi.fn();
vi.mock("@/lib/redis/job-cache", () => ({
  getCachedJobDetail: (...args: unknown[]) => mockGetCachedJobDetail(...args),
  setCachedJobDetail: (...args: unknown[]) => mockSetCachedJobDetail(...args),
  invalidateJobCache: (...args: unknown[]) => mockInvalidateJobCache(...args),
}));

const mockJobServiceGetById = vi.fn();
const mockJobServiceUpdate = vi.fn();
const mockJobServiceRemove = vi.fn();
vi.mock("@/lib/services/JobService", () => ({
  JobService: {
    getById: (...args: unknown[]) => mockJobServiceGetById(...args),
    update: (...args: unknown[]) => mockJobServiceUpdate(...args),
    remove: (...args: unknown[]) => mockJobServiceRemove(...args),
  },
}));

const mockEnqueue = vi.fn(() => Promise.resolve());
vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockFrom(...args),
    }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const jobPayload = {
  id: "job-1",
  title: "Engineer",
  organisation_id: "org-1",
  hiring_manager_id: "hm-1",
  status: "open",
};

describe("GET /api/jobs/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertJobAccess.mockReset();
    mockOrganisationsQuery.mockReset();
    mockGetTenantScopedClient.mockClear();
    mockAssertJobAccess.mockResolvedValue(true);
    mockOrganisationsQuery.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { slug: "acme", name: "Acme" },
        error: null,
      }),
    });
    mockGetCachedJobDetail.mockReset();
    mockJobServiceGetById.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when job not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetCachedJobDetail.mockResolvedValue(null);
    mockJobServiceGetById.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-missing");
    const res = await GET(req, { params: Promise.resolve({ id: "job-missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 when recruiter fetches job in same org", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetCachedJobDetail.mockResolvedValue(null);
    mockJobServiceGetById.mockResolvedValue({
      ...jobPayload,
      organisation_id: recruiterCtx.organisationId,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { slug: "acme", name: "Acme" },
        error: null,
      }),
    });
    const { GET } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job).toBeDefined();
  });

  it("returns 403 when hiring_manager fetches job assigned to another HM", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    mockGetCachedJobDetail.mockResolvedValue(null);
    mockJobServiceGetById.mockResolvedValue({
      ...jobPayload,
      hiring_manager_id: "other-hm-id",
    });
    const { GET } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 when candidate fetches open job", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetCachedJobDetail.mockResolvedValue(null);
    mockJobServiceGetById.mockResolvedValue({
      ...jobPayload,
      status: "open",
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { slug: "acme", name: "Acme" },
        error: null,
      }),
    });
    const { GET } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when candidate fetches closed job", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetCachedJobDetail.mockResolvedValue(null);
    mockJobServiceGetById.mockResolvedValue({
      ...jobPayload,
      status: "closed",
    });
    const { GET } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/jobs/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertJobAccess.mockReset();
    mockOrganisationsQuery.mockReset();
    mockGetTenantScopedClient.mockClear();
    mockAssertJobAccess.mockResolvedValue(true);
    mockOrganisationsQuery.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { slug: "acme", name: "Acme" },
        error: null,
      }),
    });
    mockJobServiceGetById.mockReset();
    mockJobServiceUpdate.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when candidate tries to update job", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { PATCH } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when job not found on PATCH", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockJobServiceGetById.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job-missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 when recruiter updates job", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockJobServiceGetById.mockResolvedValue({
      ...jobPayload,
      organisation_id: recruiterCtx.organisationId,
    });
    mockJobServiceUpdate.mockResolvedValue({
      ...jobPayload,
      title: "Senior Engineer",
    });
    const { PATCH } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Senior Engineer" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job).toBeDefined();
  });
});

describe("DELETE /api/jobs/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertJobAccess.mockReset();
    mockOrganisationsQuery.mockReset();
    mockGetTenantScopedClient.mockClear();
    mockAssertJobAccess.mockResolvedValue(true);
    mockOrganisationsQuery.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { slug: "acme", name: "Acme" },
        error: null,
      }),
    });
    mockJobServiceGetById.mockReset();
    mockJobServiceUpdate.mockReset();
    mockJobServiceRemove.mockReset();
    mockFrom.mockReset();
    mockEnqueue.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when recruiter tries to delete job", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { DELETE } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when job not found on DELETE", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockJobServiceGetById.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-missing", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "job-missing" }) });
    expect(res.status).toBe(404);
  });

  it("closes the job instead of deleting it", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockJobServiceGetById.mockResolvedValue({
      ...jobPayload,
      organisation_id: companyAdminCtx.organisationId,
    });
    mockJobServiceUpdate.mockResolvedValue({
      ...jobPayload,
      organisation_id: companyAdminCtx.organisationId,
      status: "closed",
    });
    const { DELETE } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockJobServiceUpdate).toHaveBeenCalledWith({}, "job-1", { status: "closed" });
    expect(mockJobServiceRemove).not.toHaveBeenCalled();
    expect(body.preservedCandidateHistory).toBe(true);
    expect(body.message).toContain("preserved");
  });

  it("returns preserved message when job is already closed", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockJobServiceGetById.mockResolvedValue({
      ...jobPayload,
      organisation_id: companyAdminCtx.organisationId,
      status: "closed",
    });
    const { DELETE } = await import("@/app/api/jobs/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    expect(mockJobServiceUpdate).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.message).toContain("already closed");
  });
});
