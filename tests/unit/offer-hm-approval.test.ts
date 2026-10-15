import { describe, it, expect } from "vitest";
import {
  offerNeedsFinanceAfterHmApproval,
  canProfileApproveOfferDraft,
} from "@/lib/offers/offer-hm-approval";
import { DEFAULT_SETTINGS_PERMISSIONS } from "@/lib/settings/permissions";

describe("offer HM approval helpers", () => {
  it("offerNeedsFinanceAfterHmApproval is always true for sequential approvals", () => {
    expect(
      offerNeedsFinanceAfterHmApproval("exception_pending", DEFAULT_SETTINGS_PERMISSIONS),
    ).toBe(true);
    expect(offerNeedsFinanceAfterHmApproval("within_band", DEFAULT_SETTINGS_PERMISSIONS)).toBe(
      true,
    );
    expect(offerNeedsFinanceAfterHmApproval(null, DEFAULT_SETTINGS_PERMISSIONS)).toBe(true);
  });

  it("offerNeedsFinanceAfterHmApproval remains true with explicit always mode", () => {
    const perms = { ...DEFAULT_SETTINGS_PERMISSIONS, offerFinanceApprovalMode: "always" as const };
    expect(offerNeedsFinanceAfterHmApproval("within_band", perms)).toBe(true);
    expect(offerNeedsFinanceAfterHmApproval(null, perms)).toBe(true);
  });

  it("canProfileApproveOfferDraft allows leadership and job hiring manager", () => {
    const perms = { ...DEFAULT_SETTINGS_PERMISSIONS };
    expect(
      canProfileApproveOfferDraft({
        actorUserId: "u1",
        actorRole: "leadership",
        jobHiringManagerId: "hm-1",
        permissions: perms,
      }),
    ).toBe(true);
    expect(
      canProfileApproveOfferDraft({
        actorUserId: "hm-1",
        actorRole: "hiring_manager",
        jobHiringManagerId: "hm-1",
        permissions: perms,
      }),
    ).toBe(true);
    expect(
      canProfileApproveOfferDraft({
        actorUserId: "other",
        actorRole: "hiring_manager",
        jobHiringManagerId: "hm-1",
        permissions: perms,
      }),
    ).toBe(false);
  });

  it("canProfileApproveOfferDraft allows delegated profile ids", () => {
    const perms = {
      ...DEFAULT_SETTINGS_PERMISSIONS,
      offerDraftApproverProfileIds: ["delegate-1"],
    };
    expect(
      canProfileApproveOfferDraft({
        actorUserId: "delegate-1",
        actorRole: "recruiter",
        jobHiringManagerId: "hm-1",
        permissions: perms,
      }),
    ).toBe(true);
  });
});
