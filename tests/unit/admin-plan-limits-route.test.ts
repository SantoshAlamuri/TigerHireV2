import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { superAdminCtx, recruiterCtx, createMockQueryBuilder } from "../helpers";

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

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockAdminFrom(...args) }),
}));

describe("admin plan limits route", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAdminFrom.mockReset();
  });

  it("GET returns 401 unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/plan-limits/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET returns 403 non-super-admin", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/admin/plan-limits/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("PATCH returns 400 malformed JSON", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { PATCH } = await import("@/app/api/admin/plan-limits/route");
    const req = new NextRequest("http://localhost:3000/api/admin/plan-limits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("PATCH returns 200 on valid update", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({
      data: { id: "p1", plan_key: "growth", plan_type: "company", limits: { unlocks: 1000 } },
      error: null,
    });
    mockAdminFrom.mockReturnValue(builder);
    const { PATCH } = await import("@/app/api/admin/plan-limits/route");
    const req = new NextRequest("http://localhost:3000/api/admin/plan-limits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_key: "growth",
        plan_type: "company",
        limits: {
          unlocks: 1000,
          features: {
            agents_run: true,
            fitscore_batch: true,
            assessments: true,
            offers: true,
            compensation_bands: true,
            interview_prep: true,
            scim: true,
          },
        },
      }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
  });
});
