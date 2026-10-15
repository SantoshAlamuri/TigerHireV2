import { describe, expect, it } from "vitest";
import { buildOfferLetterPdfFromText } from "@/lib/offers/build-offer-pdf";

describe("buildOfferLetterPdfFromText", () => {
  it("returns base64 PDF and stable-length content hash", async () => {
    const text = "OFFER OF EMPLOYMENT\n\nAcme Corp\n\nRole: Engineer\n";
    const a = await buildOfferLetterPdfFromText(text);
    const b = await buildOfferLetterPdfFromText(text);
    expect(a.base64.length).toBeGreaterThan(100);
    expect(Buffer.from(a.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
