import { describe, it, expect } from "vitest";
import { indianPhone, phoneDigits, phoneHref } from "@/lib/v2/phone";

/**
 * Indian mobile numbers are ten digits. Everything before that — +91, 91, a
 * leading 0, spaces, dashes, brackets — is dialling noise that arrived from
 * whichever portal the CV came through, and showing it just makes the number
 * harder to read and harder to compare.
 *
 * The rule: take the last ten digits from the end. That is the number.
 */
describe("phoneDigits", () => {
  it("takes the last ten digits regardless of prefix", () => {
    expect(phoneDigits("+919876543210")).toBe("9876543210");
    expect(phoneDigits("919876543210")).toBe("9876543210");
    expect(phoneDigits("09876543210")).toBe("9876543210");
    expect(phoneDigits("9876543210")).toBe("9876543210");
  });

  it("ignores spaces, dashes, brackets and dots", () => {
    expect(phoneDigits("+91 98765 43210")).toBe("9876543210");
    expect(phoneDigits("98765-43210")).toBe("9876543210");
    expect(phoneDigits("(+91) 98765.43210")).toBe("9876543210");
  });

  it("handles a doubled country code, which portals do produce", () => {
    expect(phoneDigits("+91919876543210")).toBe("9876543210");
  });

  it("returns null for anything shorter than ten digits rather than guessing", () => {
    expect(phoneDigits("98765")).toBeNull();
    expect(phoneDigits("+91")).toBeNull();
    expect(phoneDigits("")).toBeNull();
    expect(phoneDigits(null)).toBeNull();
    expect(phoneDigits(undefined)).toBeNull();
  });

  it("ignores text that carries no digits at all", () => {
    expect(phoneDigits("not provided")).toBeNull();
    expect(phoneDigits("N/A")).toBeNull();
  });
});

describe("indianPhone", () => {
  it("displays as two readable groups, with no country code", () => {
    expect(indianPhone("+919876543210")).toBe("98765 43210");
  });

  it("formats an already-clean number the same way", () => {
    expect(indianPhone("9876543210")).toBe("98765 43210");
  });

  it("returns an em dash when there is no usable number", () => {
    expect(indianPhone(null)).toBe("—");
    expect(indianPhone("12345")).toBe("—");
  });

  it("never shows +91 back to the recruiter", () => {
    expect(indianPhone("+91 98765 43210")).not.toContain("91 9");
    expect(indianPhone("+919876543210").startsWith("+")).toBe(false);
  });
});

describe("phoneHref", () => {
  it("dials with the country code, because dialling needs it", () => {
    // Display drops +91; the tel: link must keep it or the call fails.
    expect(phoneHref("9876543210")).toBe("tel:+919876543210");
    expect(phoneHref("+91 98765 43210")).toBe("tel:+919876543210");
  });

  it("returns null when there is nothing to dial", () => {
    expect(phoneHref("12345")).toBeNull();
    expect(phoneHref(null)).toBeNull();
  });
});
