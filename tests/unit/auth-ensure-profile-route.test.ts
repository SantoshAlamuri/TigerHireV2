import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ROLE_DASHBOARD_PATH } from "@/types/database";

const mockGetUser = vi.fn();
const mockAdminFrom = vi.fn();
const mockClaimUnclaimed = vi.fn();

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: { default: { limit: 30, windowSecs: 60 } },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: mockAdminFrom,
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/agents/candidate-dedup", () => ({
  claimUnclaimedCandidateByEmail: (...args: unknown[]) => mockClaimUnclaimed(...args),
}));

function ensureProfileReq(body: object = {}) {
  return new NextRequest("http://localhost:3000/api/auth/ensure-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/ensure-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not logged in" },
    });

    const { POST } = await import("@/app/api/auth/ensure-profile/route");
    const res = await POST(ensureProfileReq());

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("returns 200 with existing profile data when profile already exists", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "existing@test.com",
          user_metadata: {},
        },
      },
      error: null,
    });

    mockAdminFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { role: "recruiter", full_name: "Existing User" },
            }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/auth/ensure-profile/route");
    const res = await POST(ensureProfileReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.role).toBe("recruiter");
    expect(json.fullName).toBe("Existing User");
    expect(json.redirectTo).toBe(ROLE_DASHBOARD_PATH.recruiter);
  });

  it("claims unclaimed candidate by email for existing candidate profile", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "candidate@test.com",
          user_metadata: {},
        },
      },
      error: null,
    });

    mockAdminFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { role: "candidate_free", full_name: "Candidate" },
            }),
        }),
      }),
    });

    mockClaimUnclaimed.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/auth/ensure-profile/route");
    const res = await POST(ensureProfileReq());

    expect(res.status).toBe(200);
    expect(mockClaimUnclaimed).toHaveBeenCalledWith(expect.anything(), "u1", "candidate@test.com");
  });

  it("creates new profile and returns 200 when no profile exists", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u-new",
          email: "new@test.com",
          user_metadata: { full_name: "New User" },
        },
      },
      error: null,
    });

    const insertFn = vi.fn().mockResolvedValue({ error: null });

    mockAdminFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
        }),
      }),
      insert: insertFn,
    }));

    mockClaimUnclaimed.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/auth/ensure-profile/route");
    const res = await POST(ensureProfileReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.role).toBe("candidate_free");
    expect(json.fullName).toBe("New User");
    expect(json.redirectTo).toBe("/candidate");
    expect(insertFn).toHaveBeenCalledWith({
      id: "u-new",
      role: "candidate_free",
      full_name: "New User",
    });
  });

  it("falls back to email prefix when no full_name in user_metadata", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u-fb",
          email: "fallback@example.com",
          user_metadata: {},
        },
      },
      error: null,
    });

    const insertFn = vi.fn().mockResolvedValue({ error: null });

    mockAdminFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
        }),
      }),
      insert: insertFn,
    }));

    mockClaimUnclaimed.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/auth/ensure-profile/route");
    const res = await POST(ensureProfileReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fullName).toBe("fallback");
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ full_name: "fallback" }));
  });

  it("returns 500 when profile insert fails", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u-fail",
          email: "fail@test.com",
          user_metadata: { full_name: "Fail User" },
        },
      },
      error: null,
    });

    mockAdminFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({
        error: { message: "duplicate key" },
      }),
    }));

    const { POST } = await import("@/app/api/auth/ensure-profile/route");
    const res = await POST(ensureProfileReq());

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Failed to create profile");
  });

  it("returns 401 when getUser returns auth error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/ensure-profile/route");
    const res = await POST(ensureProfileReq());

    expect(res.status).toBe(401);
  });
});
