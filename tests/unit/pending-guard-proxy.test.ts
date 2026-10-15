import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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

describe("proxy pending/suspended guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSession.mockResolvedValue({
      supabase: { from: vi.fn() },
      user: { id: "user-1" },
      supabaseResponse: NextResponse.next(),
    });
  });

  it("redirects pending users to awaiting approval page", async () => {
    mockGetCachedAuthProfile.mockResolvedValue({
      role: "leadership",
      organisation_id: "org-1",
      is_active: true,
      role_status: "pending",
    });
    const middleware = (await import("@/proxy")).default;
    const res = await middleware(
      new NextRequest("http://localhost:3000/company") as unknown as NextRequest,
    );
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(res.status).toBe(307);
    expect(location.pathname).toBe("/awaiting-approval");
  });

  it("redirects suspended users to no-access page", async () => {
    mockGetCachedAuthProfile.mockResolvedValue({
      role: "leadership",
      organisation_id: "org-1",
      is_active: true,
      role_status: "suspended",
    });
    const middleware = (await import("@/proxy")).default;
    const res = await middleware(
      new NextRequest("http://localhost:3000/company") as unknown as NextRequest,
    );
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(res.status).toBe(307);
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("account_suspended");
  });

  it("redirects active company users to pending-activation when org approval is pending", async () => {
    mockGetCachedAuthProfile.mockResolvedValue({
      role: "leadership",
      organisation_id: "org-1",
      is_active: true,
      role_status: "active",
    });
    const from = vi.fn((table: string) => {
      if (table === "organisations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { type: "company", approval: "pending" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });
    mockUpdateSession.mockResolvedValue({
      supabase: { from },
      user: { id: "user-1" },
      supabaseResponse: NextResponse.next(),
    });
    const middleware = (await import("@/proxy")).default;
    const res = await middleware(
      new NextRequest("http://localhost:3000/company") as unknown as NextRequest,
    );
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(res.status).toBe(307);
    expect(location.pathname).toBe("/company/pending-activation");
  });

  it("does not redirect away from pending-activation when org is still pending", async () => {
    mockGetCachedAuthProfile.mockResolvedValue({
      role: "leadership",
      organisation_id: "org-1",
      is_active: true,
      role_status: "active",
    });
    const from = vi.fn((table: string) => {
      if (table === "organisations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { type: "company", approval: "pending" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });
    mockUpdateSession.mockResolvedValue({
      supabase: { from },
      user: { id: "user-1" },
      supabaseResponse: NextResponse.next(),
    });
    const middleware = (await import("@/proxy")).default;
    const res = await middleware(
      new NextRequest("http://localhost:3000/company/pending-activation") as unknown as NextRequest,
    );
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("proxy API account-status gate (audit Finding C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSession.mockResolvedValue({
      supabase: { from: vi.fn() },
      user: { id: "user-1" },
      supabaseResponse: NextResponse.next(),
    });
  });

  async function callApi(role_status: string | undefined, is_active = true, role = "recruiter") {
    mockGetCachedAuthProfile.mockResolvedValue({
      role,
      organisation_id: "org-1",
      is_active,
      role_status,
    });
    const middleware = (await import("@/proxy")).default;
    return middleware(
      new NextRequest("http://localhost:3000/api/candidates") as unknown as NextRequest,
    );
  }

  it("returns 403 with code account_pending for a pending user on a protected API", async () => {
    const res = await callApi("pending");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("account_pending");
  });

  it("returns 403 with code account_suspended for a suspended user", async () => {
    const res = await callApi("suspended");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("account_suspended");
  });

  it("returns 403 with code account_inactive for a deactivated user", async () => {
    const res = await callApi("active", false);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("account_inactive");
  });

  it("returns 401 (not 403) for an unauthenticated request to a protected API", async () => {
    mockUpdateSession.mockResolvedValue({
      supabase: { from: vi.fn() },
      user: null,
      supabaseResponse: NextResponse.next(),
    });
    const middleware = (await import("@/proxy")).default;
    const res = await middleware(
      new NextRequest("http://localhost:3000/api/candidates") as unknown as NextRequest,
    );
    expect(res.status).toBe(401);
  });

  it("does not 403 an active user (super_admin) on a protected API", async () => {
    // super_admin short-circuits the org-activation gate, so no org lookup is needed.
    const res = await callApi("active", true, "super_admin");
    expect(res.status).not.toBe(403);
  });

  it("does not gate public API paths on account status", async () => {
    mockGetCachedAuthProfile.mockResolvedValue({
      role: "recruiter",
      organisation_id: "org-1",
      is_active: false,
      role_status: "suspended",
    });
    const middleware = (await import("@/proxy")).default;
    // /api/health is in API_PUBLIC_PREFIXES — must not be blocked even for a suspended user.
    const res = await middleware(
      new NextRequest("http://localhost:3000/api/health") as unknown as NextRequest,
    );
    expect(res.status).not.toBe(403);
  });
});
