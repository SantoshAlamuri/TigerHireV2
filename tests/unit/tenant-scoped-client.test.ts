import { describe, expect, it, vi } from "vitest";
import { TenantScopedClient } from "@/lib/tenancy/tenant-scoped-client";
import type { TenantContext } from "@/lib/tenancy/tenant-context";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: "user-1",
    role: "recruiter",
    organisationId: "org-1",
    accessibleOrganisationIds: ["org-1", "org-2"],
    isSuperAdmin: false,
    ...overrides,
  };
}

describe("TenantScopedClient.jobs", () => {
  it("applies organisation filter after select, not on bare from()", () => {
    const inFn = vi.fn().mockReturnValue({ eq: vi.fn() });
    const selectFn = vi.fn().mockReturnValue({ in: inFn });
    const fromFn = vi.fn().mockReturnValue({ select: selectFn });

    const supabase = { from: fromFn } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const db = new TenantScopedClient(supabase, makeTenantContext());

    db.jobs().select("id, organisation_id").eq("id", "job-1");

    expect(fromFn).toHaveBeenCalledWith("jobs");
    expect(selectFn).toHaveBeenCalledWith("id, organisation_id", undefined);
    expect(inFn).toHaveBeenCalledWith("organisation_id", ["org-1", "org-2"]);
  });

  it("skips organisation filter for super admin", () => {
    const inFn = vi.fn();
    const selectFn = vi.fn().mockReturnValue({ in: inFn });
    const fromFn = vi.fn().mockReturnValue({ select: selectFn });

    const supabase = { from: fromFn } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const db = new TenantScopedClient(supabase, makeTenantContext({ isSuperAdmin: true }));

    db.jobs().select("*");

    expect(selectFn).toHaveBeenCalled();
    expect(inFn).not.toHaveBeenCalled();
  });
});
