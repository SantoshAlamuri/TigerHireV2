import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx } from "../helpers";

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

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockFrom(...args),
    }),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotificationBatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function chainSingle(data: unknown, error: unknown = null) {
  const c = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (value: unknown) => unknown) => resolve({ data: [], error: null })),
    single: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return c;
}

describe("GET /api/jobs/[id]/shortlist", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/shortlist/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/shortlist");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/jobs/[id]/shortlist/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/shortlist");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when job not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFrom.mockReturnValue(chainSingle(null, new Error("not found")));
    const { GET } = await import("@/app/api/jobs/[id]/shortlist/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-missing/shortlist");
    const res = await GET(req, { params: Promise.resolve({ id: "job-missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with candidates when job exists and user has access", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const jobChain = chainSingle({
      id: "job-1",
      organisation_id: recruiterCtx.organisationId,
      hiring_manager_id: "hm-1",
      title: "Engineer",
      shortlist_delivered_at: new Date().toISOString(),
    });
    const rangeChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve: (value: unknown) => unknown) => resolve({ data: [], error: null })),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") return jobChain;
      return rangeChain;
    });
    const { GET } = await import("@/app/api/jobs/[id]/shortlist/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/shortlist");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shortlist).toBeDefined();
    expect(Array.isArray(body.shortlist)).toBe(true);
  });
});
