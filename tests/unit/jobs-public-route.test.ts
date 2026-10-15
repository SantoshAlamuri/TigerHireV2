import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-helpers", () => ({
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
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/config/env", () => ({
  env: { hiddenPublicJobOrgSlugs: [] },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function chainSingle(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe("GET /api/jobs/[id]/public", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("returns 404 when job not found", async () => {
    mockFrom.mockReturnValue(chainSingle(null, new Error("not found")));
    const { GET } = await import("@/app/api/jobs/[id]/public/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/public");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with job when open job exists", async () => {
    const job = {
      id: "job-1",
      title: "Engineer",
      status: "open",
      organisations: { name: "Acme", slug: "acme" },
    };
    mockFrom.mockReturnValue(chainSingle(job));
    const { GET } = await import("@/app/api/jobs/[id]/public/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/public");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job).toBeDefined();
    expect(body.job.id).toBe("job-1");
  });
});
