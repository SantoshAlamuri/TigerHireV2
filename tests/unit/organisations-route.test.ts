import { describe, it, expect, vi, beforeEach } from "vitest";
import { companyAdminCtx, candidateCtx, superAdminCtx } from "../helpers";

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
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockOrg = { id: "org-1", name: "Acme Corp" };
const chainMock = () => {
  const m: Record<string, unknown> = {};
  const methods = ["select", "eq", "gte", "in", "update", "order"];
  for (const method of methods) {
    m[method] = vi.fn().mockReturnValue(m);
  }
  m.single = vi.fn().mockResolvedValue({ data: mockOrg, error: null });
  m.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve({ data: [mockOrg], error: null, count: 5 }),
  );
  return m;
};

const mockFrom = vi.fn().mockReturnValue(chainMock());
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mockFrom }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/organisations", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations");
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations");
    const res = await GET(req as any);
    expect(res.status).toBe(403);
  });

  it("returns 200 for leadership", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { GET } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/organisations", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { PATCH } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(403);
  });

  it("allows company admin to toggle enforce_2fa", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const update = vi.fn();
    const eq = vi.fn();
    const select = vi.fn();
    const single = vi.fn().mockResolvedValue({
      data: { ...mockOrg, enforce_2fa: true },
      error: null,
    });
    const builder: any = { update, eq, select, single };
    update.mockReturnValue(builder);
    eq.mockReturnValue(builder);
    select.mockReturnValue(builder);
    mockFrom.mockReturnValueOnce(builder);

    const { PATCH } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enforce_2fa: true }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ enforce_2fa: true }));
  });
});

describe("DELETE /api/organisations", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations", {
      method: "DELETE",
    });
    const res = await DELETE(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin roles", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { DELETE } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations", {
      method: "DELETE",
    });
    const res = await DELETE(req as any);
    expect(res.status).toBe(403);
  });

  it("returns 405 for super_admin because organisation deletion is disabled", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { DELETE } = await import("@/app/api/organisations/route");
    const req = new Request("http://localhost:3000/api/organisations", {
      method: "DELETE",
    });
    const res = await DELETE(req as any);
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toContain("disabled by design");
  });
});
