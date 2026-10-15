import { describe, expect, it, vi } from "vitest";
import {
  buildDomainVerificationTxtValue,
  extractEmailDomain,
  isBlockedPublicDomain,
  resolveCompanyFromEmail,
} from "@/lib/sso/company-sso";

describe("company-sso helper", () => {
  it("extracts and normalizes email domains", () => {
    expect(extractEmailDomain("User@Example.COM")).toBe("example.com");
    expect(extractEmailDomain("invalid-email")).toBeNull();
  });

  it("checks blocked public domains", () => {
    expect(isBlockedPublicDomain("gmail.com")).toBe(true);
    expect(isBlockedPublicDomain("corp.example.com")).toBe(false);
  });

  it("builds deterministic verification TXT value", () => {
    expect(buildDomainVerificationTxtValue("org-1", "token-1")).toBe(
      "tigerhire-domain-verify=org-1:token-1",
    );
  });

  it("resolves verified company mapping from email", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { company_id: "org-123" }, error: null });
    const eq = vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as never;

    const result = await resolveCompanyFromEmail(supabase, "user@company.com");
    expect(result).toBe("org-123");
    expect(from).toHaveBeenCalledWith("company_sso_mappings");
  });

  it("returns null when email is invalid", async () => {
    const supabase = { from: vi.fn() } as never;
    const result = await resolveCompanyFromEmail(supabase, "invalid");
    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
