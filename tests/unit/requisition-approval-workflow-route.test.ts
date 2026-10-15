import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
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

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockAdminFrom(...args) }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

describe("requisition approval workflow settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 403 for hiring manager", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "hiring_manager",
      organisationId: "org-1",
    });
    const { GET } = await import("@/app/api/settings/requisition-approval-workflow/route");
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("GET returns current workflow key for company admin", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "leadership",
      organisationId: "org-1",
      isOrgAdmin: true,
    });
    mockAdminFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { permissions: { requisitionApprovalWorkflowKey: "requisition_linear_v1" } },
              error: null,
            }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/settings/requisition-approval-workflow/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { requisitionApprovalWorkflowKey: string };
    expect(payload.requisitionApprovalWorkflowKey).toBe("requisition_linear_v1");
  });
});
