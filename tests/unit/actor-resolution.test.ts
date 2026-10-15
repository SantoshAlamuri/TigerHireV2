import { describe, expect, it, vi } from "vitest";
import { canActorApproveRequiredRole } from "@/lib/approvals/actor-resolution";

vi.mock("@/lib/security/enterprise-roles", () => ({
  hasAnyEnterpriseRole: vi.fn().mockResolvedValue(false),
}));

type MockAdmin = {
  from: (table: string) => {
    select: (value: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: null }>;
      };
    };
  };
};

function createAdminWithActor(actor: { role: string; organisation_id: string }): MockAdmin {
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: actor, error: null }),
            }),
          }),
        };
      }
      if (table === "approval_delegations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    lte: () => ({
                      gte: () => ({
                        limit: async () => ({ data: [], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      {
        throw new Error(`Unexpected table: ${table}`);
      }
    },
  };
}

describe("actor-resolution", () => {
  it("allows actor when required role matches", async () => {
    const admin = createAdminWithActor({
      role: "leadership",
      organisation_id: "org-1",
    });

    const allowed = await canActorApproveRequiredRole(admin as never, {
      organisationId: "org-1",
      actorProfileId: "profile-1",
      requiredRole: "leadership",
    });

    expect(allowed).toBe(true);
  });

  it("does not allow cross-role fallback for leadership", async () => {
    const admin = createAdminWithActor({
      role: "leadership",
      organisation_id: "org-1",
    });

    const allowed = await canActorApproveRequiredRole(admin as never, {
      organisationId: "org-1",
      actorProfileId: "profile-1",
      requiredRole: "recruiter",
    });

    expect(allowed).toBe(false);
  });

  it("does not allow actor across organisations", async () => {
    const admin = createAdminWithActor({
      role: "leadership",
      organisation_id: "org-2",
    });

    const allowed = await canActorApproveRequiredRole(admin as never, {
      organisationId: "org-1",
      actorProfileId: "profile-1",
      requiredRole: "hr",
    });

    expect(allowed).toBe(false);
  });
});
