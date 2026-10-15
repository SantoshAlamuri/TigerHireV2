import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAssertJobAccess = vi.fn();
const mockJobsSelect = vi.fn();

vi.mock("@/lib/tenancy/tenant-scoped-client", () => ({
  createTenantScopedClient: vi.fn().mockResolvedValue({
    assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
    jobs: () => ({
      select: () => ({
        eq: () => ({
          single: mockJobsSelect,
        }),
      }),
    }),
    context: {
      accessibleOrganisationIds: ["org-1", "org-client"],
    },
  }),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
}));

describe("assertJobAccess (tenant-scoped)", () => {
  beforeEach(() => {
    mockAssertJobAccess.mockReset();
    mockJobsSelect.mockReset();
  });

  it("returns null when tenant assertJobAccess returns false", async () => {
    mockAssertJobAccess.mockResolvedValue(false);
    const { assertJobAccess } = await import("@/lib/job-access");
    const supabase = {} as never;
    const ctx = {
      userId: "user-1",
      role: "recruiter" as const,
      organisationId: "org-1",
    };
    const result = await assertJobAccess(supabase, ctx, "job-missing");
    expect(result.job).toBeNull();
  });

  it("returns job record for recruiter in accessible org", async () => {
    mockAssertJobAccess.mockResolvedValue(true);
    mockJobsSelect.mockResolvedValue({
      data: {
        id: "job-1",
        organisation_id: "org-1",
        hiring_manager_id: null,
      },
      error: null,
    });
    const { assertJobAccess } = await import("@/lib/job-access");
    const supabase = {} as never;
    const ctx = {
      userId: "user-1",
      role: "recruiter" as const,
      organisationId: "org-1",
    };
    const result = await assertJobAccess(supabase, ctx, "job-1");
    expect(result.job?.id).toBe("job-1");
    expect(result.job?.organisation_id).toBe("org-1");
  });
});
