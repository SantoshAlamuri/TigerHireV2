import { describe, expect, it } from "vitest";
import {
  SETUP_ROUTES,
  getCanonicalPathForSetup,
  getDefaultSetupPathForArea,
  getSetupPathForCanonical,
  getSetupRoutesForArea,
} from "@/features/setup/config/manifest";

describe("setup route manifest", () => {
  it("maps canonical company settings paths to setup paths", () => {
    expect(getSetupPathForCanonical("/company/settings")).toBe("/setup/organization/profile");
    expect(getSetupPathForCanonical("/company/settings/pipeline")).toBe(
      "/setup/hiring-config/pipeline",
    );
    expect(getSetupPathForCanonical("/company/settings/integrations")).toBe(
      "/setup/platform/integrations",
    );
    expect(getSetupPathForCanonical("/company/team")).toBe("/setup/organization/team");
  });

  it("resolves setup path back to canonical path", () => {
    expect(getCanonicalPathForSetup("/setup/comms/privacy")).toBe("/company/settings/privacy");
    expect(getCanonicalPathForSetup("/setup/hiring-config/screening")).toBe(
      "/company/settings/screening",
    );
  });

  it("provides default entry per setup area", () => {
    expect(getDefaultSetupPathForArea("organization")).toBe("/setup/organization/profile");
    expect(getDefaultSetupPathForArea("hiring-config")).toBe(
      "/setup/hiring-config/default-recruitment-plan",
    );
    expect(getDefaultSetupPathForArea("comms")).toBe("/setup/comms/privacy");
    expect(getDefaultSetupPathForArea("platform")).toBe("/setup/platform/integrations");
  });

  it("lists hiring-config routes including default recruitment plan", () => {
    const hiring = getSetupRoutesForArea("hiring-config");
    expect(hiring.some((r) => r.id === "hiring.default_plan")).toBe(true);
    expect(hiring.some((r) => r.id === "hiring.pipeline")).toBe(true);
    expect(SETUP_ROUTES.length).toBeGreaterThanOrEqual(18);
  });
});
