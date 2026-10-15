import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockWriteAccessAuditEvent = vi.fn();
const mockServerFrom = vi.fn();
const mockAdminFrom = vi.fn();

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
  handleApiError: (_err: unknown, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  buildScopedRateLimitKey: (input: { route: string; userId?: string }) =>
    `${input.route}:${input.userId ?? "anon"}`,
  getClientIpForRateLimit: () => "127.0.0.1",
}));

vi.mock("@/lib/security/access-audit", () => ({
  writeAccessAuditEvent: (...args: unknown[]) => mockWriteAccessAuditEvent(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mockServerFrom }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: mockAdminFrom }),
}));

/** Thenable chain that resolves every terminal to `result`. */
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

describe("GET /api/candidates/data-export — DSAR rate limit (PII-003)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
    mockWriteAccessAuditEvent.mockResolvedValue(undefined);
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "candidate_pro" });
    // Candidate self-lookup (server) + all admin sub-queries.
    mockServerFrom.mockImplementation(() =>
      chain({ data: { id: "c1", user_id: "u1", phone: null }, error: null }),
    );
    mockAdminFrom.mockImplementation(() => chain({ data: { id: "c1" }, error: null }));
  });

  it("returns 429 and does not touch candidate data when over the rate limit", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const { GET } = await import("@/app/api/candidates/data-export/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/candidates/data-export"));
    expect(res.status).toBe(429);
    expect(mockServerFrom).not.toHaveBeenCalled();
    expect(mockWriteAccessAuditEvent).not.toHaveBeenCalled();
  });

  it("proceeds past the rate limit for an allowed request", async () => {
    const { GET } = await import("@/app/api/candidates/data-export/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/candidates/data-export"));
    expect(res.status).toBe(200);
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
  });

  it("scopes the rate-limit key per requesting user", async () => {
    const { GET } = await import("@/app/api/candidates/data-export/route");
    await GET(new NextRequest("http://localhost:3000/api/candidates/data-export"));
    const cfg = mockCheckRateLimit.mock.calls[0][0];
    expect(cfg.key).toBe("candidates:data-export:u1");
    expect(cfg.limit).toBe(5);
  });

  it("includes the candidate's career document in the export", async () => {
    const career = { document: { summary: "Career summary" }, updated_at: "2026-09-04T12:00:00Z" };
    mockAdminFrom.mockImplementation((table: string) =>
      chain({
        data: table === "candidate_career_profiles" ? career : [],
        error: null,
      }),
    );
    const { GET } = await import("@/app/api/candidates/data-export/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/candidates/data-export"));
    expect(res.status).toBe(200);
    expect((await res.json()).careerProfile).toEqual(career);
  });

  it("does not report a complete export when career retrieval fails", async () => {
    mockAdminFrom.mockImplementation((table: string) =>
      chain({
        data: null,
        error: table === "candidate_career_profiles" ? { message: "unavailable" } : null,
      }),
    );
    const { GET } = await import("@/app/api/candidates/data-export/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/candidates/data-export"));
    expect(res.status).toBe(500);
  });
});
