import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string } | null, ...roles: string[]) =>
    Boolean(ctx && roles.includes(ctx.role)),
  jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
}));

import { getAuthContext } from "@/lib/api-helpers";

const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/applications/[id]/communications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/applications/[id]/communications/route");
    const req = new NextRequest("http://localhost/api/applications/x/communications");
    const res = await GET(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(401);
  });
});
