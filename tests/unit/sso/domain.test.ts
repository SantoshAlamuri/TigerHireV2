import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMaybeSingle = vi.fn();
const mockEq2 = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle, eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockCreateSupabaseAdmin = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

describe("sso/domain helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extractDomain handles basic, uppercase, whitespace", async () => {
    const { extractDomain } = await import("@/lib/sso/domain");
    expect(extractDomain(" User@Acme.COM ")).toBe("acme.com");
    expect(extractDomain("bad-email")).toBe("");
  });

  it("isPublicDomain returns true for gmail (builtin) and false for acme", async () => {
    const { isPublicDomain } = await import("@/lib/sso/domain");
    await expect(isPublicDomain("gmail.com")).resolves.toBe(true);

    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(isPublicDomain("acme.com")).resolves.toBe(false);
  });

  it("resolveCompanyFromDomain handles verified/unverified/nonexistent", async () => {
    const { resolveCompanyFromDomain } = await import("@/lib/sso/domain");
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        company_id: "org-1",
        domain_verified_at: "2026-01-01T00:00:00Z",
        provider_type: "google",
      },
      error: null,
    });
    await expect(resolveCompanyFromDomain("acme.com")).resolves.toEqual({
      company_id: "org-1",
      verified: true,
      provider_type: "google",
    });

    mockMaybeSingle.mockResolvedValueOnce({
      data: { company_id: "org-1", domain_verified_at: null, provider_type: "google" },
      error: null,
    });
    await expect(resolveCompanyFromDomain("acme.com")).resolves.toEqual({
      company_id: "org-1",
      verified: false,
      provider_type: "google",
    });

    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(resolveCompanyFromDomain("missing.com")).resolves.toBeNull();
  });

  it("resolveOauthCompanyFromEmail returns explicit routing reason", async () => {
    const { resolveOauthCompanyFromEmail } = await import("@/lib/sso/domain");

    await expect(resolveOauthCompanyFromEmail("user@gmail.com")).resolves.toMatchObject({
      reason: "public_domain_blocked",
      companyId: null,
      providerType: null,
    });

    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(resolveOauthCompanyFromEmail("user@missing.com")).resolves.toMatchObject({
      reason: "domain_not_claimed",
      companyId: null,
      providerType: null,
    });

    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockMaybeSingle.mockResolvedValueOnce({
      data: { company_id: "org-1", domain_verified_at: null, provider_type: "google" },
      error: null,
    });
    await expect(resolveOauthCompanyFromEmail("user@acme.com")).resolves.toMatchObject({
      reason: "domain_unverified",
      companyId: "org-1",
      providerType: "google",
    });
  });
});
