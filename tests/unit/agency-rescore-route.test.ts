import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { agencyCtx, candidateCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
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
  jsonSuccess: (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/services/FitScoreService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/FitScoreService")>();
  return {
    ...actual,
    FitScoreService: {
      ...actual.FitScoreService,
      computeSingle: vi.fn().mockResolvedValue({ fitScore: 75 }),
    },
  };
});

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockIsJdBaseApproved = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  isJdBaseApproved: (...args: unknown[]) => mockIsJdBaseApproved(...args),
  JD_BASE_NOT_APPROVED_MESSAGE:
    "JD Base awaiting hiring manager approval. Review weights and approve before scoring.",
}));

describe("POST /api/agency/rescore-candidates", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockIsJdBaseApproved.mockReset();
    mockIsJdBaseApproved.mockResolvedValue(true);
    mockCreateSupabaseServerClient.mockReset();
    mockCreateSupabaseAdmin.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agency/rescore-candidates/route");
    const req = new NextRequest("http://localhost:3000/api/agency/rescore-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-agency role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/agency/rescore-candidates/route");
    const req = new NextRequest("http://localhost:3000/api/agency/rescore-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when agency has no organisationId", async () => {
    mockGetAuthContext.mockResolvedValue({ ...agencyCtx, organisationId: null });
    const { POST } = await import("@/app/api/agency/rescore-candidates/route");
    const req = new NextRequest("http://localhost:3000/api/agency/rescore-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 428 when any client job JD Base is unapproved", async () => {
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [{ client_organisation_id: "client-1" }],
          }),
        })),
      })),
    });
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: [{ id: "job-1" }],
          }),
        })),
      })),
    });
    mockIsJdBaseApproved.mockResolvedValueOnce(false);

    const { POST } = await import("@/app/api/agency/rescore-candidates/route");
    const req = new NextRequest("http://localhost:3000/api/agency/rescore-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(428);
    const body = await res.json();
    expect(body.error).toContain("JD Base awaiting hiring manager approval");
  });
});
