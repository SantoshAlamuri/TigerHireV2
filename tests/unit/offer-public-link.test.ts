import { describe, expect, it } from "vitest";
import {
  hashOfferPublicOtp,
  signOfferPublicSession,
  verifyOfferPublicOtpHash,
  verifyOfferPublicSession,
} from "@/lib/offers/offer-public-link";

describe("offer-public-link", () => {
  it("round-trips HMAC session JWT", () => {
    const jwt = signOfferPublicSession(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    const v = verifyOfferPublicSession(jwt);
    expect(v).toEqual({
      offerId: "11111111-1111-4111-8111-111111111111",
      candidateUserId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("verifies OTP hash with timing-safe check", () => {
    const oid = "11111111-1111-4111-8111-111111111111";
    const hash = hashOfferPublicOtp(oid, "123456");
    expect(verifyOfferPublicOtpHash(hash, oid, "123456")).toBe(true);
    expect(verifyOfferPublicOtpHash(hash, oid, "000000")).toBe(false);
  });
});
