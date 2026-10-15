import { describe, expect, it } from "vitest";
import {
  shouldScheduleCampaignLaunch,
  validateCampaignLaunchWindow,
} from "@/lib/referrers/campaign-launch";
import { formatCampaignJobTitles } from "@/lib/referrers/campaigns";

describe("referral campaign scope 1 helpers", () => {
  it("validateCampaignLaunchWindow rejects past ends_at", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(validateCampaignLaunchWindow({ starts_at: null, ends_at: past }).ok).toBe(false);
  });

  it("shouldScheduleCampaignLaunch when starts_at is in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const out = shouldScheduleCampaignLaunch({ starts_at: future });
    expect(out.scheduled).toBe(true);
    expect(out.launchesAt).toBe(future);
  });

  it("formatCampaignJobTitles lists up to three titles then and more", () => {
    expect(
      formatCampaignJobTitles([
        { jobTitle: "A" },
        { jobTitle: "B" },
        { jobTitle: "C" },
        { jobTitle: "D" },
      ]),
    ).toBe("A, B, C, and more");
  });
});
