import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
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
  reportError: vi.fn(),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockFrom(...args),
    }),
}));

vi.mock("@/lib/repositories/EmployeeRepository", () => ({
  EmployeeRepository: { recordHireFeedback: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function chainSingle(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    update: vi.fn().mockReturnThis(),
  };
}

describe("POST /api/feedback/hire", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/feedback/hire/route");
    const req = new NextRequest("http://localhost:3000/api/feedback/hire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        candidateId: "00000000-0000-4000-8000-000000000002",
        outcome: "hired",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/feedback/hire/route");
    const req = new NextRequest("http://localhost:3000/api/feedback/hire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        candidateId: "00000000-0000-4000-8000-000000000002",
        outcome: "hired",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/feedback/hire/route");
    const req = new NextRequest("http://localhost:3000/api/feedback/hire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 when body fails validation", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/feedback/hire/route");
    const req = new NextRequest("http://localhost:3000/api/feedback/hire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "invalid", candidateId: "invalid", outcome: "maybe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 404 when job not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFrom.mockReturnValue(chainSingle(null));
    const { POST } = await import("@/app/api/feedback/hire/route");
    const req = new NextRequest("http://localhost:3000/api/feedback/hire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        candidateId: "00000000-0000-4000-8000-000000000002",
        outcome: "hired",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
