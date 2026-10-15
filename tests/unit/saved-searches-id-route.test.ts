import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
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

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockFrom(...args),
    }),
}));

function chainSingle(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
}

describe("GET /api/saved-searches/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/saved-searches/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/saved-searches/ss-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ss-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when saved search not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFrom.mockReturnValue(chainSingle(null, new Error("not found")));
    const { GET } = await import("@/app/api/saved-searches/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/saved-searches/ss-missing");
    const res = await GET(req, { params: Promise.resolve({ id: "ss-missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with search when found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFrom.mockReturnValue(
      chainSingle({ id: "ss-1", name: "My Search", user_id: recruiterCtx.userId }),
    );
    const { GET } = await import("@/app/api/saved-searches/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/saved-searches/ss-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ss-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.search).toBeDefined();
    expect(body.search.id).toBe("ss-1");
  });
});

describe("PATCH /api/saved-searches/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/saved-searches/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/saved-searches/ss-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "ss-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/saved-searches/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/saved-searches/ss-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "ss-1" }) });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/saved-searches/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/saved-searches/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/saved-searches/ss-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "ss-1" }) });
    expect(res.status).toBe(401);
  });
});
