import { describe, expect, it } from "vitest";
import {
  extractNameFromMessage,
  extractNameFromMessageIgnoringPhone,
  extractPhoneFromMessage,
  isLikelyPersonName,
  looksLikeReferralStatusOrResendText,
  parseResendReferralPhone,
  isExplicitReferCommand,
  looksLikeApplyIntent,
  looksLikeReferralAction,
  looksLikeSelfApply,
  parseApplyPrefillHints,
  parseReferralFastPath,
} from "@/lib/whatsapp/referral-flow";
import { normalizeIndianPhone } from "@/lib/whatsapp/normalize-phone";
import { parseReferralText } from "@/lib/whatsapp/referral-handler";

describe("normalizeIndianPhone", () => {
  it("prepends 91 to 10-digit mobile", () => {
    expect(normalizeIndianPhone("7674911055")).toBe("917674911055");
    expect(normalizeIndianPhone("+91 76749 11055")).toBe("917674911055");
  });

  it("keeps 12-digit 91-prefixed numbers", () => {
    expect(normalizeIndianPhone("919885674488")).toBe("919885674488");
  });

  it("normalizes 9010255055 to 919010255055", () => {
    expect(normalizeIndianPhone("9010255055")).toBe("919010255055");
  });
});

describe("referral-flow extractors", () => {
  it("detects self-apply phrases", () => {
    expect(looksLikeSelfApply("I want to apply for a role")).toBe(true);
    expect(looksLikeSelfApply("I'd like to apply")).toBe(true);
    expect(looksLikeSelfApply("Referring sam")).toBe(false);
  });

  it("parses apply prefill role and company hints", () => {
    expect(
      parseApplyPrefillHints(
        "Hi TigerHire — I'd like to apply.\nRole: QA Engineer\nCompany: Finstack",
      ),
    ).toEqual({ roleHint: "QA Engineer", companyHint: "Finstack" });
  });

  it("detects apply vs refer commands for dual-mode routing", () => {
    expect(looksLikeApplyIntent("APPLY")).toBe(true);
    expect(
      looksLikeApplyIntent(
        "Hi TigerHire — I'd like to apply. I'll share my CV here and check my fit against open roles.",
      ),
    ).toBe(true);
    expect(looksLikeApplyIntent("No i want to apply")).toBe(true);
    expect(looksLikeApplyIntent("I want to refer my friend")).toBe(false);
    expect(isExplicitReferCommand("REFER")).toBe(true);
    expect(isExplicitReferCommand("2")).toBe(true);
  });

  it("does not treat role-picker numbers as apply intent for registered users", () => {
    expect(looksLikeApplyIntent("1", { sessionState: "role_job_selection" })).toBe(false);
    expect(looksLikeApplyIntent("2", { sessionState: "role_family_selection" })).toBe(false);
    expect(looksLikeApplyIntent("3", { sessionState: "scored" })).toBe(false);
    expect(
      looksLikeApplyIntent("1", {
        sessionState: "cv_requested",
        context: {
          guided_role_options: [
            {
              label: "Engineering",
              matchField: "role_function",
              matchValue: "engineering",
              count: 2,
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      looksLikeApplyIntent("1", {
        sessionState: "new",
        context: { awaiting_mode_choice: true },
      }),
    ).toBe(true);
  });

  it("extracts phone from messy text", () => {
    expect(extractPhoneFromMessage("Referring sam 7674911055")).toBe("917674911055");
  });

  it("extracts name when phone is in the same message", () => {
    expect(extractNameFromMessageIgnoringPhone("Sam 7674911055")).toBe("Sam");
  });

  it("extracts short names", () => {
    expect(extractNameFromMessage("Alice")).toBe("Alice");
    expect(extractNameFromMessage("Referring sam")).toBe("Sam");
  });

  it("does not treat refer-a-friend phrases as a candidate name", () => {
    expect(extractNameFromMessage("Refer a friend")).toBeNull();
    expect(extractNameFromMessage("refer my friend")).toBeNull();
    expect(extractNameFromMessage("Refer someone")).toBeNull();
  });

  it("rejects complaint sentences as candidate names", () => {
    expect(extractNameFromMessage("He haven't recieved a message yet")).toBeNull();
    expect(isLikelyPersonName("He Haven't Recieved A Message Yet")).toBe(false);
    expect(looksLikeReferralStatusOrResendText("He haven't recieved a message yet")).toBe(true);
    expect(looksLikeReferralStatusOrResendText("Yes can you resend")).toBe(true);
  });

  it("parses RESEND with phone", () => {
    expect(parseResendReferralPhone("RESEND 7674911055")).toBe("917674911055");
  });

  it("flags referral keywords and phones", () => {
    expect(
      looksLikeReferralAction({ type: "text", text: { body: "I want to refer my friend" } }),
    ).toBe(true);
    expect(
      looksLikeReferralAction({ type: "text", text: { body: "Referring sam 7674911055" } }),
    ).toBe(true);
  });
});

describe("referral fast-path parsing", () => {
  it("parses Refer Alice - Backend Engineer - Bangalore without splitting role wrongly", () => {
    const parsed = parseReferralFastPath("Refer Alice - Backend Engineer - Bangalore");
    expect(parsed).toEqual({
      candidateName: "Alice",
      roleCategory: "Backend Engineer",
      location: "Bangalore",
    });
  });

  it("parses name + phone + for job title", () => {
    const parsed = parseReferralFastPath("Refer Alice 7674911055 for QA Engineer");
    expect(parsed?.candidateName).toBe("Alice");
    expect(parsed?.roleCategory).toBe("QA Engineer");
  });

  it("legacy parseReferralText matches improved dash split", () => {
    const parsed = parseReferralText("Refer Alice - Backend Engineer - Bangalore");
    expect(parsed?.roleCategory).toBe("Backend Engineer");
    expect(parsed?.location).toBe("Bangalore");
  });
});
