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
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({
        error: err.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockProfileGet = vi.fn();
const mockProfileUpdate = vi.fn();
vi.mock("@/lib/services/ProfileService", () => ({
  ProfileService: {
    get: (...args: unknown[]) => mockProfileGet(...args),
    update: (...args: unknown[]) => mockProfileUpdate(...args),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// GET /api/profiles
// ---------------------------------------------------------------------------
describe("GET /api/profiles", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockProfileGet.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/profiles/route");
    const res = await GET();
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 404 when profile not found", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockProfileGet.mockResolvedValue({ profile: null });
    const { GET } = await import("@/app/api/profiles/route");
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns 200 with profile data", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockProfileGet.mockResolvedValue({
      profile: { id: "p1", full_name: "Jane", role: "candidate_free" },
    });
    const { GET } = await import("@/app/api/profiles/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.full_name).toBe("Jane");
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockProfileGet.mockRejectedValueOnce(new Error("db fail"));
    const { GET } = await import("@/app/api/profiles/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/profiles
// ---------------------------------------------------------------------------
describe("PATCH /api/profiles", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockProfileUpdate.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/profiles/route");
    const req = new NextRequest("http://localhost:3000/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "New Name" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 on successful update", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockProfileUpdate.mockResolvedValue({
      profile: { id: "p1", full_name: "Updated" },
    });
    const { PATCH } = await import("@/app/api/profiles/route");
    const req = new NextRequest("http://localhost:3000/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Updated" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.full_name).toBe("Updated");
  });

  it("passes role and userId to service", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockProfileUpdate.mockResolvedValue({ profile: { id: "p1" } });
    const { PATCH } = await import("@/app/api/profiles/route");
    const req = new NextRequest("http://localhost:3000/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+91000" }),
    });
    await PATCH(req);
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.anything(),
      candidateCtx.userId,
      candidateCtx.role,
      { phone: "+91000" },
    );
  });

  it("returns 400 for malformed JSON", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/profiles/route");
    const req = new NextRequest("http://localhost:3000/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid payload type", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/profiles/route");
    const req = new NextRequest("http://localhost:3000/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experienceYears: "5" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(422);
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockProfileUpdate.mockRejectedValueOnce(new Error("fail"));
    const { PATCH } = await import("@/app/api/profiles/route");
    const req = new NextRequest("http://localhost:3000/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "X" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });
});
