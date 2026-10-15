import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
  RATE_LIMIT_PRESETS: { apply: { limit: 20, windowSecs: 60 } },
}));

describe("GET /api/schedule/self-serve/[token]", () => {
  it("returns 400 when token is too short", async () => {
    const { GET } = await import("@/app/api/schedule/self-serve/[token]/route");
    const req = new NextRequest("http://localhost/schedule/short");
    const res = await GET(req, { params: Promise.resolve({ token: "123456789012345" }) });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(String(j.error ?? j)).toMatch(/invalid/i);
  });
});
