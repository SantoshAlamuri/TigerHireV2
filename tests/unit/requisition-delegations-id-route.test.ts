import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (payload: unknown, status = 200) => Response.json(payload, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock("@/lib/settings/permissions", () => ({
  getOrgSettingsPermissions: () => Promise.resolve({ requisitionAdvancedMode: true }),
  isRequisitionAdvancedModeEnabled: () => true,
}));

describe("requisition delegations id route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes delegation for company admin", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "ca-1",
      role: "leadership",
      organisationId: "org-1",
      isOrgAdmin: true,
    });
    mockFrom.mockReturnValue({
      update: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: "del-1" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const { DELETE } = await import("@/app/api/settings/requisition-delegations/[id]/route");
    const req = new NextRequest("http://localhost/api/settings/requisition-delegations/del-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "del-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revoked).toBe(true);
  });
});
