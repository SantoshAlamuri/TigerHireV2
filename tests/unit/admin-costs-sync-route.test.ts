import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockSyncAllPlatformCosts = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role?: string }, role: string) => ctx?.role === role,
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: (_err: unknown, message: string) =>
    Response.json({ error: message }, { status: 500 }),
}));

vi.mock("@/lib/costs/sync", () => ({
  syncAllPlatformCosts: (...args: unknown[]) => mockSyncAllPlatformCosts(...args),
}));

describe("POST /api/admin/costs/sync", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockSyncAllPlatformCosts.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/costs/sync/route");
    const req = new NextRequest("http://localhost:3000/api/admin/costs/sync", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin roles", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "recruiter" });
    const { POST } = await import("@/app/api/admin/costs/sync/route");
    const req = new NextRequest("http://localhost:3000/api/admin/costs/sync", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("syncs and returns provider results for super_admin", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "super_admin" });
    mockSyncAllPlatformCosts.mockResolvedValue([
      { provider: "vercel", imported: 3, skipped: false },
      { provider: "meta", imported: 5, skipped: false },
      { provider: "upstash", imported: 0, skipped: true, reason: "pending connector" },
    ]);

    const { POST } = await import("@/app/api/admin/costs/sync/route");
    const req = new NextRequest("http://localhost:3000/api/admin/costs/sync", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.synced).toBe(true);
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results[0].provider).toBe("vercel");
    expect(json.results.some((r: { provider: string }) => r.provider === "meta")).toBe(true);
  });
});
