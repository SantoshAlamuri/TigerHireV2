import { describe, expect, it } from "vitest";
import { buildScopedRateLimitKey } from "@/lib/security/rate-limit";

describe("buildScopedRateLimitKey", () => {
  it("builds org:user key when both are provided", () => {
    expect(
      buildScopedRateLimitKey({
        route: "fitscore",
        organisationId: "org-1",
        userId: "user-1",
      }),
    ).toBe("fitscore:org-1:user-1");
  });

  it("falls back to user key when organisation is missing", () => {
    expect(
      buildScopedRateLimitKey({
        route: "fitscore",
        userId: "user-1",
      }),
    ).toBe("fitscore:user-1");
  });

  it("falls back to ip key for unauthenticated calls", () => {
    expect(
      buildScopedRateLimitKey({
        route: "waitlist",
        ip: "10.0.0.1",
      }),
    ).toBe("waitlist:10.0.0.1");
  });

  it("appends suffix when provided", () => {
    expect(
      buildScopedRateLimitKey({
        route: "settings-org-key-save",
        organisationId: "org-1",
        userId: "user-1",
        suffix: "127.0.0.1",
      }),
    ).toBe("settings-org-key-save:org-1:user-1:127.0.0.1");
  });
});
