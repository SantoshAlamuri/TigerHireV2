import { describe, expect, it } from "vitest";
import { applyDoNotCallModeGuard } from "@/lib/screening/mode-guard";

describe("applyDoNotCallModeGuard", () => {
  it("forces automated modes to none for opted-out candidates", () => {
    expect(
      applyDoNotCallModeGuard({
        doNotCall: true,
        resolvedMode: "whatsapp",
      }),
    ).toBe("none");
    expect(
      applyDoNotCallModeGuard({
        doNotCall: true,
        resolvedMode: "voice",
      }),
    ).toBe("none");
  });

  it("keeps non-automated modes unchanged", () => {
    expect(
      applyDoNotCallModeGuard({
        doNotCall: true,
        resolvedMode: "manual",
      }),
    ).toBe("manual");
  });
});
