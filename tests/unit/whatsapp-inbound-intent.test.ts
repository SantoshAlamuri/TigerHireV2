import { describe, expect, it } from "vitest";
import { isCandidateIntentText, isMarketingHandoffText } from "@/lib/whatsapp/inbound-intent";

describe("inbound-intent", () => {
  it("detects marketing handoff from site prefills (lowercase)", () => {
    expect(
      isMarketingHandoffText("Hi TigerHire — I'm reaching out from your contact page.\n\n"),
    ).toBe(true);
    expect(
      isMarketingHandoffText(
        "I just sent a message through the form on your website. Following up here for a quicker reply.",
      ),
    ).toBe(true);
    expect(
      isMarketingHandoffText("I'd like to join the TigerHire waitlist as a company or recruiter."),
    ).toBe(true);
    expect(isMarketingHandoffText("I'd like to join the TigerHire waitlist as a job seeker.")).toBe(
      true,
    );
    expect(isMarketingHandoffText("I'd like to hear more about what you're building.")).toBe(true);
  });

  it("detects extra marketing patterns", () => {
    expect(isMarketingHandoffText("Can we book a demo next week?")).toBe(true);
    expect(isMarketingHandoffText("Partnership inquiry for TigerHire")).toBe(true);
    expect(isMarketingHandoffText("See https://tigerhire.io/contact")).toBe(true);
  });

  it("does not treat generic hi or candidate intent as marketing", () => {
    expect(isMarketingHandoffText("Hi")).toBe(false);
    expect(isMarketingHandoffText("Hi TigerHire")).toBe(false);
    expect(isMarketingHandoffText("I want to apply for a role")).toBe(false);
    expect(isMarketingHandoffText("Here's my resume")).toBe(false);
    expect(isMarketingHandoffText("APPLY")).toBe(false);
  });

  it("candidate signals win over marketing phrases", () => {
    expect(
      isMarketingHandoffText("From your contact page — actually I want to send my CV for a job"),
    ).toBe(false);
  });

  it("isCandidateIntentText recognises APPLY and CV language", () => {
    expect(isCandidateIntentText("APPLY")).toBe(true);
    expect(isCandidateIntentText("apply")).toBe(true);
    expect(isCandidateIntentText("I need a job in Bangalore")).toBe(true);
    expect(isCandidateIntentText("")).toBe(false);
    expect(isCandidateIntentText("   ")).toBe(false);
  });
});
