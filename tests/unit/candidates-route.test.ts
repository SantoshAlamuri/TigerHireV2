import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  agencyCtx,
  createMockSupabase,
  createMockQueryBuilder,
} from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
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
  handleApiError: (err: unknown, _msg: string) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    listMasked: vi.fn().mockResolvedValue({
      candidates: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    }),
  },
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: new Date(Date.now() + 60_000),
  }),
}));

vi.mock("@/lib/repositories/CandidateRepository", () => ({
  getAccessibleCandidateIdsForOrgs: vi.fn().mockResolvedValue([]),
  CandidateRepository: {},
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/candidates", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockCreateSupabaseServerClient.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/candidates/route");
    const req = new NextRequest("http://localhost:3000/api/candidates");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/candidates/route");
    const req = new NextRequest(
      "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/candidates/route");
    const req = new NextRequest(
      "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBeDefined();
  });

  it("returns 200 for company admin", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { GET } = await import("@/app/api/candidates/route");
    const req = new NextRequest(
      "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 200 for agency role", async () => {
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    const agencyClientsBuilder = createMockQueryBuilder({
      data: [],
    });
    const supabaseWithAgency = createMockSupabase({
      agency_clients: agencyClientsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValueOnce(supabaseWithAgency);
    const { GET } = await import("@/app/api/candidates/route");
    const req = new NextRequest(
      "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBeDefined();
  });

  it("returns 422 when query params invalid (e.g. invalid sortBy)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/candidates/route");
    const req = new NextRequest(
      "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=invalid_field&sortOrder=desc",
    );
    const res = await GET(req);
    expect(res.status).toBe(422);
  });

  it("returns 200 with empty candidates when non-super_admin has no organisationId", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...recruiterCtx,
      organisationId: null,
    });
    const { GET } = await import("@/app/api/candidates/route");
    const req = new NextRequest(
      "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  it("returns 500 when CandidateService.listMasked throws", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockCreateSupabaseServerClient.mockResolvedValue({});
    const { CandidateService } = await import("@/lib/services/CandidateService");
    vi.mocked(CandidateService.listMasked).mockRejectedValueOnce(new Error("DB error"));
    const { GET } = await import("@/app/api/candidates/route");
    const req = new NextRequest(
      "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
    );
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
