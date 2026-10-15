import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ROLE_DASHBOARD_PATH } from "@/types/database";
import {
  isCompanyHiringConfigSettingsPath,
  resolveDashboardRouteAccessRule,
  shouldRedirectNonOrgAdminFromOrgConfigPath,
} from "@/lib/security/dashboard-route-policy";

const mockUpdateSession = vi.fn();
const mockGetCachedAuthProfile = vi.fn();

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  getCachedAuthProfile: (...args: unknown[]) => mockGetCachedAuthProfile(...args),
  setCachedAuthProfile: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/finance-route-access", () => ({
  canAccessCompanyFinanceRoute: vi.fn(() => Promise.resolve(false)),
}));

function mockRecruiterProfile(isOrgAdmin: boolean) {
  mockGetCachedAuthProfile.mockResolvedValue({
    role: "recruiter",
    organisation_id: "org-1",
    is_active: true,
    role_status: "active",
    is_org_admin: isOrgAdmin,
  });
}

function mockActiveOrganisationSupabase() {
  return {
    from: (table: string) => {
      if (table === "organisations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { type: "company", approval: "approved" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    },
  };
}

describe("hiring-config settings access (Brief 3 Phase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSession.mockResolvedValue({
      supabase: mockActiveOrganisationSupabase(),
      user: { id: "user-recruiter" },
      supabaseResponse: NextResponse.next(),
    });
    mockRecruiterProfile(false);
  });

  it("treats all eight company hiring-config paths as exempt from org-admin redirect", () => {
    const paths = [
      "/company/settings/pipeline",
      "/company/settings/screening",
      "/company/settings/offer-letter-templates",
      "/company/settings/compensation-bands",
      "/company/settings/offer-approval-workflow",
      "/company/settings/requisition-approval-workflow",
      "/company/settings/requisition-templates",
      "/company/settings/requisition-delegations",
    ];
    for (const pathname of paths) {
      expect(isCompanyHiringConfigSettingsPath(pathname)).toBe(true);
      expect(shouldRedirectNonOrgAdminFromOrgConfigPath(pathname, false, "recruiter")).toBe(false);
      expect(shouldRedirectNonOrgAdminFromOrgConfigPath(pathname, false, "leadership")).toBe(false);
    }
  });

  it("still redirects non–org-admins from org settings hub (/company/settings)", () => {
    expect(
      shouldRedirectNonOrgAdminFromOrgConfigPath("/company/settings", false, "recruiter"),
    ).toBe(true);
  });

  it("resolves /company/settings/pipeline to the hiring-config rule, not /company catch-all", () => {
    const rule = resolveDashboardRouteAccessRule("/company/settings/pipeline");
    expect(rule?.prefix).toBe("/company/settings/pipeline");
    expect(rule?.roles).toContain("recruiter");
    expect(rule?.roles).not.toContain("hiring_manager");
  });

  it("proxy allows non–org-admin recruiter through to /company/settings/pipeline", async () => {
    const middleware = (await import("@/proxy")).default;
    const res = await middleware(
      new NextRequest("http://localhost:3000/company/settings/pipeline") as unknown as NextRequest,
    );

    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(307);
  });

  it("proxy redirects non–org-admin recruiter from /company/settings hub", async () => {
    const middleware = (await import("@/proxy")).default;
    const res = await middleware(
      new NextRequest("http://localhost:3000/company/settings") as unknown as NextRequest,
    );

    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(res.status).toBe(307);
    // Non-org-admins are bounced to their own landing page, not to /home.
    expect(location.pathname).toBe(ROLE_DASHBOARD_PATH.recruiter);
  });
});
