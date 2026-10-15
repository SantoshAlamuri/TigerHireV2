import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveEmailAssetBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses EMAIL_LOGO_BASE_URL when set", async () => {
    vi.stubEnv("EMAIL_LOGO_BASE_URL", "https://cdn.example.com/");
    const { resolveEmailAssetBaseUrl } = await import("@/lib/config/env");
    expect(resolveEmailAssetBaseUrl("https://tigerhire.io")).toBe("https://cdn.example.com");
  });

  it("falls back to https://tigerhire.io for localhost", async () => {
    vi.stubEnv("EMAIL_LOGO_BASE_URL", "");
    const { resolveEmailAssetBaseUrl } = await import("@/lib/config/env");
    expect(resolveEmailAssetBaseUrl("http://localhost:3001")).toBe("https://tigerhire.io");
  });

  it("returns same origin for public https preview URLs", async () => {
    vi.stubEnv("EMAIL_LOGO_BASE_URL", "");
    const { resolveEmailAssetBaseUrl } = await import("@/lib/config/env");
    const preview = "https://myapp.vercel.app";
    expect(resolveEmailAssetBaseUrl(preview)).toBe("https://myapp.vercel.app");
  });
});
