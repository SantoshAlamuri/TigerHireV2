import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (payload: unknown, status = 200) => Response.json(payload, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
  handleZodError: () => Response.json({ error: "Validation error" }, { status: 422 }),
  parseJsonBody: async (request: Request) => {
    try {
      return { body: await request.json(), errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

describe("requisition templates route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/requisition-templates/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("GET returns templates for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "r1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({ data: [{ id: "tpl-1", name: "Eng L4" }], error: null }),
            }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/requisition-templates/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { templates: Array<{ id: string }> };
    expect(payload.templates[0]?.id).toBe("tpl-1");
  });
});
