import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  superAdminCtx,
  hiringManagerCtx,
  createTenantScopedClientMock,
} from "../helpers";

const mockGetAuthContext = vi.fn();
const mockGetTenantScopedClient = vi.fn(async () => createTenantScopedClientMock());
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
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/services/JobService", () => ({
  JobService: {
    list: vi.fn().mockResolvedValue({
      jobs: [
        { id: "j1", title: "Engineer", status: "open" },
        { id: "j2", title: "Designer", status: "open" },
      ],
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    }),
    create: vi.fn().mockResolvedValue({ id: "j-new", title: "New Job" }),
    getById: vi.fn().mockResolvedValue({ id: "j1", title: "Engineer" }),
    update: vi.fn().mockResolvedValue({ id: "j1", title: "Updated" }),
    remove: vi.fn().mockResolvedValue(undefined),
    getActiveByCompany: vi.fn().mockResolvedValue([{ id: "j1", status: "open" }]),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("Jobs Lifecycle — Functional Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
  });

  describe("RBAC enforcement across all roles", () => {
    const roles = [
      { ctx: recruiterCtx, name: "recruiter", canCreate: true, canList: true },
      { ctx: candidateCtx, name: "candidate", canCreate: false, canList: true },
      {
        ctx: companyAdminCtx,
        name: "leadership",
        canCreate: true,
        canList: true,
      },
      {
        ctx: hiringManagerCtx,
        name: "hiring_manager",
        canCreate: true,
        canList: true,
      },
      {
        ctx: superAdminCtx,
        name: "super_admin",
        canCreate: false,
        canList: true,
      },
    ];

    for (const { ctx, name, canList } of roles) {
      it(`${name} can${canList ? "" : "not"} list jobs`, async () => {
        mockGetAuthContext.mockResolvedValue(ctx);
        const { GET } = await import("@/app/api/jobs/route");
        const req = new NextRequest("http://localhost:3000/api/jobs?page=1&limit=10");
        const res = await GET(req);
        if (canList) {
          expect(res.status).toBe(200);
        } else {
          expect([401, 403]).toContain(res.status);
        }
      });
    }

    for (const { ctx, name, canCreate } of roles) {
      it(`${name} can${canCreate ? "" : "not"} create jobs`, async () => {
        mockGetAuthContext.mockResolvedValue(ctx);
        const { POST } = await import("@/app/api/jobs/route");
        const req = new NextRequest("http://localhost:3000/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Test Job",
            description: "d".repeat(55),
            status: "open",
          }),
        });
        const res = await POST(req);
        if (canCreate) {
          expect([200, 201, 409]).toContain(res.status);
        } else {
          expect([400, 401, 403]).toContain(res.status);
        }
      });
    }
  });

  describe("Unauthenticated access", () => {
    it("rejects GET /api/jobs without auth", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/jobs/route");
      const req = new NextRequest("http://localhost:3000/api/jobs");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("rejects POST /api/jobs without auth", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { POST } = await import("@/app/api/jobs/route");
      const req = new NextRequest("http://localhost:3000/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test", description: "d".repeat(55) }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Pagination", () => {
    it("returns pagination metadata", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/jobs/route");
      const req = new NextRequest("http://localhost:3000/api/jobs?page=1&limit=10");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
    });
  });

  describe("Input validation", () => {
    it("rejects empty title", async () => {
      mockGetAuthContext.mockResolvedValue(companyAdminCtx);
      const { POST } = await import("@/app/api/jobs/route");
      const req = new NextRequest("http://localhost:3000/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", description: "desc" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(422);
    });

    it("rejects non-JSON body", async () => {
      mockGetAuthContext.mockResolvedValue(companyAdminCtx);
      const { POST } = await import("@/app/api/jobs/route");
      const req = new NextRequest("http://localhost:3000/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      const res = await POST(req);
      expect([400, 422, 500]).toContain(res.status);
    });
  });
});
