import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockVerifyDnsTxt = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockMaybeSingle = vi.fn();
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })) }));
const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  };
});

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/sso/verification", () => ({
  verifyDnsTxt: (...args: unknown[]) => mockVerifyDnsTxt(...args),
}));

vi.mock("@/lib/repositories/integrations.repository", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

describe("POST /api/sso/domain/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      role: "leadership",
      roleStatus: "active",
      organisationId: "org-1",
    });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "map-1",
        company_id: "org-1",
        primary_domain: "acme.com",
        domain_verification_token: "tigerhire-verify=abc",
        provider_type: "email_password",
      },
      error: null,
    });
    mockVerifyDnsTxt.mockResolvedValue(true);
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("rejects non-admin caller", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      role: "recruiter",
      roleStatus: "active",
      organisationId: "org-1",
    });
    const { POST } = await import("@/app/api/sso/domain/verify/route");
    const response = await POST(
      new Request("http://localhost/api/sso/domain/verify", { method: "POST" }) as never,
    );
    expect(response.status).toBe(403);
  });

  it("rejects if no verification initiated", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "map-1",
        company_id: "org-1",
        primary_domain: "acme.com",
        domain_verification_token: null,
        provider_type: "email_password",
      },
      error: null,
    });
    const { POST } = await import("@/app/api/sso/domain/verify/route");
    const response = await POST(
      new Request("http://localhost/api/sso/domain/verify", { method: "POST" }) as never,
    );
    expect(response.status).toBe(400);
  });

  it("success path sets domain_verified_at", async () => {
    const { POST } = await import("@/app/api/sso/domain/verify/route");
    const response = await POST(
      new Request("http://localhost/api/sso/domain/verify", { method: "POST" }) as never,
    );
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockWriteAuditLog).toHaveBeenCalled();
  });

  it("enforces rate limit", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
    const { POST } = await import("@/app/api/sso/domain/verify/route");
    const response = await POST(
      new Request("http://localhost/api/sso/domain/verify", { method: "POST" }) as never,
    );
    expect(response.status).toBe(429);
  });
});
