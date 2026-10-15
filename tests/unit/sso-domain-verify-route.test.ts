import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockVerifyDnsTxt = vi.fn();

const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })) }));
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = vi.fn((table: string) => {
  if (table === "company_sso_mappings") {
    return { select: mockSelect, update: mockUpdate };
  }
  return {};
});

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
        id: "mapping-1",
        company_id: "org-1",
        primary_domain: "example.com",
        domain_verification_token: "token-123",
        provider_type: "email_password",
      },
      error: null,
    });
    mockVerifyDnsTxt.mockResolvedValue(true);
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("verifies TXT record and marks domain active", async () => {
    const { POST } = await import("@/app/api/sso/domain/verify/route");
    const response = await POST(
      new Request("http://localhost/api/sso/domain/verify", {
        method: "POST",
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mockVerifyDnsTxt).toHaveBeenCalledWith("example.com", "token-123");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event_type: "domain.verified" }),
    );
  });

  it("returns mismatch when TXT does not contain expected value", async () => {
    mockVerifyDnsTxt.mockResolvedValue(false);
    const { POST } = await import("@/app/api/sso/domain/verify/route");
    const response = await POST(
      new Request("http://localhost/api/sso/domain/verify", {
        method: "POST",
      }) as never,
    );

    expect(response.status).toBe(200);
  });
});
