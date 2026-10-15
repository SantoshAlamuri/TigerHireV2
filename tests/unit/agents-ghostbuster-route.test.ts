import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockRunGhostbuster = vi.fn();

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

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
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/security/agent-access", () => ({
  assertRecruiterCanAccessCandidateForAgent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/ghostbuster-authenticity", () => ({
  runGhostbuster: (...args: unknown[]) => mockRunGhostbuster(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const CAND_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("POST /api/agents/ghostbuster", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockRunGhostbuster.mockReset();
    mockRunGhostbuster.mockResolvedValue({
      candidateId: CAND_ID,
      riskScore: 12,
      flags: [],
      summary: "Looks authentic",
    });
  });

  function post(body: unknown) {
    return new NextRequest("http://localhost:3000/api/agents/ghostbuster", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agents/ghostbuster/route");
    const res = await POST(post({ candidateId: CAND_ID }));
    expect(res.status).toBe(401);
    expect(mockRunGhostbuster).not.toHaveBeenCalled();
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/agents/ghostbuster/route");
    const res = await POST(post({ candidateId: CAND_ID }));
    expect(res.status).toBe(403);
    expect(mockRunGhostbuster).not.toHaveBeenCalled();
  });

  it("returns 400 when candidateId is not a valid UUID", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/agents/ghostbuster/route");
    const res = await POST(post({ candidateId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(mockRunGhostbuster).not.toHaveBeenCalled();
  });

  it("returns 200 with authenticity result for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/agents/ghostbuster/route");
    const res = await POST(post({ candidateId: CAND_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidateId).toBe(CAND_ID);
    expect(body.riskScore).toBe(12);
    expect(mockRunGhostbuster).toHaveBeenCalledWith(CAND_ID);
  });
});
