import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: mockAdminFrom,
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("company-sso-enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when role is not company-side", async () => {
    const { shouldEnforceCompanySsoForProfile } =
      await import("@/lib/security/company-sso-enforcement");
    const result = await shouldEnforceCompanySsoForProfile({
      role: "candidate_free",
      organisationId: "org-1",
    });
    expect(result).toBe(false);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("returns true when organisation enforce_sso is enabled", async () => {
    mockAdminFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { enforce_sso: true }, error: null }),
        }),
      }),
    });
    const { shouldEnforceCompanySsoForProfile } =
      await import("@/lib/security/company-sso-enforcement");
    const result = await shouldEnforceCompanySsoForProfile({
      role: "leadership",
      organisationId: "org-1",
    });
    expect(result).toBe(true);
  });

  it("treats password providers as non-SSO providers", async () => {
    const { isPasswordAuthProvider } = await import("@/lib/security/company-sso-enforcement");
    expect(isPasswordAuthProvider("email")).toBe(true);
    expect(isPasswordAuthProvider("phone")).toBe(true);
    expect(isPasswordAuthProvider("google")).toBe(false);
  });
});
