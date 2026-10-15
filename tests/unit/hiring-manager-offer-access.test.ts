import { describe, expect, it, vi } from "vitest";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";
import type { AuthContext } from "@/lib/api-helpers";

function mockAdmin(offerRow: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: offerRow, error: null })),
        })),
      })),
    })),
  } as never;
}

describe("forbidUnlessHiringManagerOwnsOfferJob", () => {
  it("allows leadership without querying job ownership", async () => {
    const ctx = {
      userId: "u1",
      role: "leadership",
      organisationId: "o1",
    } as AuthContext;
    const admin = { from: vi.fn() } as never;
    const res = await forbidUnlessHiringManagerOwnsOfferJob({
      ctx,
      admin,
      offerId: "offer-1",
    });
    expect(res).toBeNull();
    expect((admin as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("returns 403 when hiring manager does not own the job", async () => {
    const ctx = {
      userId: "hm-1",
      role: "hiring_manager",
      organisationId: "o1",
    } as AuthContext;
    const admin = mockAdmin({
      id: "offer-1",
      applications: { jobs: { hiring_manager_id: "other-hm" } },
    });
    const res = await forbidUnlessHiringManagerOwnsOfferJob({
      ctx,
      admin,
      offerId: "offer-1",
    });
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it("returns null when hiring manager owns the job", async () => {
    const ctx = {
      userId: "hm-1",
      role: "hiring_manager",
      organisationId: "o1",
    } as AuthContext;
    const admin = mockAdmin({
      id: "offer-1",
      applications: { jobs: { hiring_manager_id: "hm-1" } },
    });
    const res = await forbidUnlessHiringManagerOwnsOfferJob({
      ctx,
      admin,
      offerId: "offer-1",
    });
    expect(res).toBeNull();
  });
});
