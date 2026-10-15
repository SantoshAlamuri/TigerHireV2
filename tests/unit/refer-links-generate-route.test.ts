import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockEnsureReferralToken = vi.fn();
const mockRefreshReferralToken = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx != null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    const body = await request.json();
    return { body, errorResponse: null };
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
    new Response(JSON.stringify({ error: err.issues.map((i) => i.message).join("; ") }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/referrers/referral-link-mint", () => ({
  ensureReferralToken: (...args: unknown[]) => mockEnsureReferralToken(...args),
  refreshReferralToken: (...args: unknown[]) => mockRefreshReferralToken(...args),
  getReferralLinkTtlDays: () => 30,
  publicAppOrigin: () => "http://localhost:3000",
}));

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabase,
}));

describe("POST /api/refer/links/generate", () => {
  beforeEach(() => {
    mockEnsureReferralToken.mockReset();
    mockRefreshReferralToken.mockReset();
    mockGetAuthContext.mockReset();
    mockSupabase.from.mockReset();

    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      role: "employee",
      organisationId: "org-1",
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "referrers") {
        return {
          select: () => ({
            eq: (col1: string, _val1: string) => {
              if (col1 === "user_id") {
                return {
                  maybeSingle: () => Promise.resolve({ data: { id: "ref-1" } }),
                };
              }
              return {
                eq: (_col2: string, _val2: boolean) => ({
                  maybeSingle: () => Promise.resolve({ data: { id: "ref-1" }, error: null }),
                }),
              };
            },
          }),
        };
      }
      if (table === "jobs") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    id: "00000000-0000-4000-8000-000000000001",
                    title: "Internal Role",
                    status: "open",
                    organisation_id: "org-1",
                    list_on_public_job_board: false,
                    list_for_internal_referrals: true,
                    organisations: { slug: "acme" },
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects referral link generation for internal-only roles", async () => {
    const { POST } = await import("@/app/api/refer/links/generate/route");
    const req = new NextRequest("http://localhost:3000/api/refer/links/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_ids: ["00000000-0000-4000-8000-000000000001"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error)).toContain("not available");
    expect(mockEnsureReferralToken).not.toHaveBeenCalled();
  });
});
