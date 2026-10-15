import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, companyAdminCtx } from "../helpers";

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
      { status: 422, headers: { "Content-Type": "application/json" } },
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
      candidates: [
        { id: "c1", name: "Jane D." },
        { id: "c2", name: "John S." },
      ],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    }),
    getById: vi.fn().mockResolvedValue({ id: "c1", name: "Jane Doe" }),
    create: vi.fn().mockResolvedValue({ id: "c-new", name: "New Candidate" }),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
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

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: new Date(Date.now() + 60_000),
  }),
  RATE_LIMIT_PRESETS: {
    auth: { limit: 10, windowSecs: 60 },
    default: { limit: 30, windowSecs: 60 },
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
  }),
}));

describe("Candidates Lifecycle — Functional Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
  });

  describe("Authorization matrix", () => {
    it("recruiter can list candidates", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const req = new NextRequest(
        "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.candidates).toBeDefined();
      expect(Array.isArray(body.candidates)).toBe(true);
    });

    it("company admin can list candidates", async () => {
      mockGetAuthContext.mockResolvedValue(companyAdminCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const req = new NextRequest(
        "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it("candidate cannot list other candidates", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const req = new NextRequest(
        "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
      );
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it("unauthenticated users are rejected", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Response structure", () => {
    it("response includes pagination metadata", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const req = new NextRequest(
        "http://localhost:3000/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc",
      );
      const res = await GET(req);
      const body = await res.json();
      expect(body.pagination).toBeDefined();
      expect(body.pagination).toHaveProperty("page");
      expect(body.pagination).toHaveProperty("total");
      expect(body.pagination).toHaveProperty("totalPages");
    });
  });
});
