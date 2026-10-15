import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSignOut = vi.fn();
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: { getUser: () => mockGetUser(), signOut: () => mockSignOut() },
    }),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api-helpers", () => ({
  jsonSuccess: (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("returns 200 with ok: true after signOut", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const req = new NextRequest("http://localhost:3000/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockSignOut).toHaveBeenCalled();
  });
});
