import { describe, it, expect, vi, afterEach } from "vitest";
import {
  coolingOffEndMs,
  isCoolingOffActive,
  getApplicationCoolingOffDays,
  getPublicReapplyPolicyPayload,
} from "@/lib/applications/cooling-off";

describe("cooling-off policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("computes cooling end from last terminal update", () => {
    const start = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(coolingOffEndMs("2026-01-01T00:00:00.000Z", 90)).toBe(start + 90 * 86_400_000);
  });

  it("is active before end and inactive after", () => {
    const terminal = "2026-01-01T00:00:00.000Z";
    const mid = new Date("2026-02-01T00:00:00.000Z").getTime();
    const late = new Date("2026-05-01T00:00:00.000Z").getTime();
    expect(isCoolingOffActive(terminal, mid, 90)).toBe(true);
    expect(isCoolingOffActive(terminal, late, 90)).toBe(false);
  });

  it("is never active when days is 0", () => {
    expect(isCoolingOffActive("2026-01-01T00:00:00.000Z", Date.now(), 0)).toBe(false);
  });

  it("reads APPLICATION_COOLING_OFF_DAYS when set", () => {
    vi.stubEnv("APPLICATION_COOLING_OFF_DAYS", "30");
    expect(getApplicationCoolingOffDays()).toBe(30);
  });

  it("uses default when env empty", () => {
    vi.stubEnv("APPLICATION_COOLING_OFF_DAYS", "");
    expect(getApplicationCoolingOffDays()).toBe(90);
  });

  it("getPublicReapplyPolicyPayload mirrors current cooling days and active when days > 0", () => {
    vi.stubEnv("APPLICATION_COOLING_OFF_DAYS", "30");
    expect(getPublicReapplyPolicyPayload()).toEqual({ coolingOffDays: 30, active: true });
    vi.stubEnv("APPLICATION_COOLING_OFF_DAYS", "0");
    expect(getPublicReapplyPolicyPayload()).toEqual({ coolingOffDays: 0, active: false });
  });
});
