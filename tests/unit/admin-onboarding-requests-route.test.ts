import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder, buildRequest, fakeUuid } from "../helpers";

const mockAdminFrom = vi.fn();
const mockRequirePlatformAdmin = vi.fn();
const mockValidateOrigin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

vi.mock("@/lib/security/platform-admin", () => ({
  requirePlatformAdmin: (...args: unknown[]) => mockRequirePlatformAdmin(...args),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    parseJsonBody: async (request: Request) => {
      try {
        const body = await request.json();
        return { body, errorResponse: null };
      } catch {
        return {
          body: null,
          errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
        };
      }
    },
  };
});

describe("admin onboarding requests route", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockRequirePlatformAdmin.mockReset();
    mockValidateOrigin.mockReset();
    mockValidateOrigin.mockReturnValue(null);
    mockRequirePlatformAdmin.mockResolvedValue({
      context: { userId: "admin-user-1", isPlatformAdmin: true },
    });
  });

  it("GET returns onboarding request queue for platform admins", async () => {
    const builder = createMockQueryBuilder({
      data: [
        {
          id: fakeUuid("1"),
          email: "admin@acme.com",
          onboarding_status: "pending",
        },
      ],
      error: null,
    });
    mockAdminFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/admin/onboarding-requests/route");
    const response = await GET(
      buildRequest("http://localhost/api/admin/onboarding-requests") as never,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.requests).toHaveLength(1);
    expect(payload.requests[0].onboarding_status).toBe("pending");
  });

  it("GET returns 403 for non-platform admin", async () => {
    mockRequirePlatformAdmin.mockResolvedValue({
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    });
    const { GET } = await import("@/app/api/admin/onboarding-requests/route");
    const response = await GET(
      buildRequest("http://localhost/api/admin/onboarding-requests") as never,
    );
    expect(response.status).toBe(403);
  });

  it("PATCH returns CSRF error when origin validation fails", async () => {
    mockValidateOrigin.mockReturnValue(Response.json({ error: "Invalid origin" }, { status: 403 }));
    const { PATCH } = await import("@/app/api/admin/onboarding-requests/route");
    const response = await PATCH(
      buildRequest("http://localhost/api/admin/onboarding-requests", {
        method: "PATCH",
        body: {
          id: fakeUuid("2"),
          onboardingStatus: "approved",
          onboardingCompanyId: fakeUuid("100"),
        },
      }) as never,
    );
    expect(response.status).toBe(403);
  });

  it("PATCH returns 422 for invalid body", async () => {
    const { PATCH } = await import("@/app/api/admin/onboarding-requests/route");
    const response = await PATCH(
      buildRequest("http://localhost/api/admin/onboarding-requests", {
        method: "PATCH",
        body: {
          id: "not-a-uuid",
          onboardingStatus: "approved",
        },
      }) as never,
    );
    expect(response.status).toBe(422);
  });

  it("PATCH updates onboarding request status", async () => {
    const builder = createMockQueryBuilder({
      data: {
        id: fakeUuid("2"),
        onboarding_status: "approved",
        onboarding_company_id: fakeUuid("100"),
        onboarding_approved_by: "admin-user-1",
      },
      error: null,
    });
    mockAdminFrom.mockReturnValue(builder);

    const { PATCH } = await import("@/app/api/admin/onboarding-requests/route");
    const response = await PATCH(
      buildRequest("http://localhost/api/admin/onboarding-requests", {
        method: "PATCH",
        body: {
          id: fakeUuid("2"),
          onboardingStatus: "approved",
          onboardingCompanyId: fakeUuid("100"),
        },
      }) as never,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.request.onboarding_status).toBe("approved");
  });

  it("PATCH blocks handled status transition without prior approval", async () => {
    const currentBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("3"),
        onboarding_status: "pending",
        onboarding_company_id: fakeUuid("300"),
        onboarding_admin_payload: null,
        onboarding_activity: [],
      },
      error: null,
    });
    mockAdminFrom.mockReturnValue(currentBuilder);

    const { PATCH } = await import("@/app/api/admin/onboarding-requests/route");
    const response = await PATCH(
      buildRequest("http://localhost/api/admin/onboarding-requests", {
        method: "PATCH",
        body: {
          id: fakeUuid("3"),
          onboardingStatus: "handled",
          onboardingCompanyId: fakeUuid("300"),
        },
      }) as never,
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.error).toContain("approved");
  });
});
