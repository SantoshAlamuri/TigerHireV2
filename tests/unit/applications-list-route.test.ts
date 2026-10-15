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
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: (data: unknown) => new Response(JSON.stringify(data), { status: 200 }),
  handleZodError: () => new Response(JSON.stringify({ error: "validation" }), { status: 422 }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
  reportError: vi.fn(),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/observability/route-span", () => ({
  withRouteSpan: (_name: string, fn: () => unknown) => fn(),
}));

const mockListForRecruiter = vi.fn();
vi.mock("@/lib/services/ApplicationService", () => ({
  ApplicationService: {
    listForCandidate: vi.fn(),
    listForRecruiter: mockListForRecruiter,
    create: vi.fn(),
  },
}));

vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    getByUserId: vi.fn(),
  },
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: vi.fn(),
  },
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser: vi.fn() }, from: mockFrom }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 10, resetAt: new Date() }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/services/resend", () => ({
  sendApplicationConfirmation: vi.fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn(),
}));

describe("GET /api/applications", () => {
  beforeEach(() => {
    vi.resetModules();
    mockListForRecruiter.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/applications/route");
    const url = "http://localhost/api/applications";
    const request = new NextRequest(url);
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns applications list for recruiter role", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    mockListForRecruiter.mockResolvedValueOnce({
      applications: [{ id: "app-1", status: "applied" }],
      pagination: {
        page: 1,
        limit: 30,
        total: 1,
        totalPages: 1,
        nextCursor: undefined,
      },
    });
    const { GET } = await import("@/app/api/applications/route");
    const request = new NextRequest("http://localhost/api/applications");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applications).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    expect(mockListForRecruiter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ page: 1, limit: 30 }),
    );
  });
});
