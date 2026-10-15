import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolvePrescreenChannel } from "@/lib/prescreen/resolve-channel";

describe("resolvePrescreenChannel", () => {
  it("uses whatsapp for recruiter upload when phone is present", () => {
    expect(resolvePrescreenChannel("recruiter_upload", "+919999999999")).toBe("whatsapp");
  });

  it("falls back to form for recruiter upload without phone", () => {
    expect(resolvePrescreenChannel("recruiter_upload", null)).toBe("form");
  });

  it("keeps whatsapp for guided apply", () => {
    expect(resolvePrescreenChannel("whatsapp", "+919999999999")).toBe("whatsapp");
  });
});

describe("isPrescreenGateEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is on when org screening_default_mode is whatsapp", async () => {
    vi.doMock("@/lib/screening/org-whatsapp-screening", () => ({
      isOrgWhatsappScreeningEnabled: vi.fn().mockResolvedValue(true),
    }));
    const { isPrescreenGateEnabled } = await import("@/lib/prescreen/flag");
    await expect(isPrescreenGateEnabled("org-1")).resolves.toBe(true);
  });

  it("is off when org screening_default_mode is not whatsapp", async () => {
    vi.doMock("@/lib/screening/org-whatsapp-screening", () => ({
      isOrgWhatsappScreeningEnabled: vi.fn().mockResolvedValue(false),
    }));
    const { isPrescreenGateEnabled } = await import("@/lib/prescreen/flag");
    await expect(isPrescreenGateEnabled("org-1")).resolves.toBe(false);
  });
});
