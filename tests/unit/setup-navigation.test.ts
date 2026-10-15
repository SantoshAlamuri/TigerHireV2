import { describe, expect, it } from "vitest";
import { isSetupAppPath, isSetupLandingPath } from "@/features/setup/navigation";

describe("isSetupAppPath", () => {
  it("matches setup root and nested routes", () => {
    expect(isSetupAppPath("/setup")).toBe(true);
    expect(isSetupAppPath("/setup/")).toBe(true);
    expect(isSetupAppPath("/setup/hiring-config/pipeline")).toBe(true);
  });

  it("does not match company or recruit settings", () => {
    expect(isSetupAppPath("/company/settings/pipeline")).toBe(false);
    expect(isSetupAppPath("/recruit/settings/pipeline")).toBe(false);
    expect(isSetupAppPath("/home")).toBe(false);
  });
});

describe("isSetupLandingPath", () => {
  it("matches only the setup hub", () => {
    expect(isSetupLandingPath("/setup")).toBe(true);
    expect(isSetupLandingPath("/setup/")).toBe(true);
    expect(isSetupLandingPath("/setup/hiring-config/pipeline")).toBe(false);
  });
});
