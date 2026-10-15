import { describe, expect, it } from "vitest";
import {
  mergeApplicationReferralFields,
  type ApplicationReferralFields,
  type ReferralResolutionInput,
} from "@/lib/referrers/application-referral-merge";

const incomingA: ReferralResolutionInput = {
  referralLinkId: "link-a",
  directReferrerId: "ref-a",
  parentReferrerId: null,
};

const incomingB: ReferralResolutionInput = {
  referralLinkId: "link-b",
  directReferrerId: "ref-b",
  parentReferrerId: "parent-b",
};

describe("mergeApplicationReferralFields", () => {
  it("empty existing + incoming ref sets triple", () => {
    expect(mergeApplicationReferralFields(null, incomingA)).toEqual({
      referral_link_id: "link-a",
      direct_referrer_id: "ref-a",
      parent_referrer_id: null,
    });
  });

  it("empty existing + no incoming yields nulls", () => {
    expect(mergeApplicationReferralFields(null, null)).toEqual({
      referral_link_id: null,
      direct_referrer_id: null,
      parent_referrer_id: null,
    });
  });

  it("existing ref A + incoming B keeps A (first-touch)", () => {
    const existing: ApplicationReferralFields = {
      referral_link_id: "link-a",
      direct_referrer_id: "ref-a",
      parent_referrer_id: null,
    };
    expect(mergeApplicationReferralFields(existing, incomingB)).toEqual(existing);
  });

  it("existing ref + null incoming preserves attribution (re-apply without ?ref=)", () => {
    const existing: ApplicationReferralFields = {
      referral_link_id: "link-a",
      direct_referrer_id: "ref-a",
      parent_referrer_id: "parent-x",
    };
    expect(mergeApplicationReferralFields(existing, null)).toEqual(existing);
  });

  it("treats only parent_referrer_id as attributed (preserve triple)", () => {
    const existing: ApplicationReferralFields = {
      referral_link_id: null,
      direct_referrer_id: null,
      parent_referrer_id: "parent-only",
    };
    expect(mergeApplicationReferralFields(existing, incomingA)).toEqual(existing);
  });
});
