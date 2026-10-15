import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

function mockNextRequest(origin: string | null): NextRequest {
  return {
    headers: {
      get: (k: string) => (k === "origin" ? origin : null),
    },
  } as unknown as NextRequest;
}

describe("validateOrigin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { validateOrigin } = await import("@/lib/security/csrf");
    const result = validateOrigin(mockNextRequest("https://evil.com"));
    expect(result).toBeNull();
  });

  it("returns null when origin matches allowed", async () => {
    const { validateOrigin } = await import("@/lib/security/csrf");
    const result = validateOrigin(mockNextRequest("https://app.example.com"));
    expect(result).toBeNull();
  });

  it("returns 403 when origin does not match in production", async () => {
    const { validateOrigin } = await import("@/lib/security/csrf");
    const result = validateOrigin(mockNextRequest("https://evil.com"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});
