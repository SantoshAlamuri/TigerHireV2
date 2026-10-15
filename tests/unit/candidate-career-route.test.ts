import { beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockQueryBuilder,
  createMockSupabase,
  candidateCtx,
  mockApiHelperJsonHandlers,
} from "../helpers";
import { emptyCareerProfile } from "@/lib/candidate/career-profile";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), csrf: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => mocks.client() }));
vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => mocks.csrf() }));
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mocks.auth(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  ...mockApiHelperJsonHandlers,
}));

const candidateId = "00000000-0000-4000-8000-000000000001";
let candidates: ReturnType<typeof createMockQueryBuilder>;
let careers: ReturnType<typeof createMockQueryBuilder>;
function request(expectedUpdatedAt: string | null = null, extra = {}) {
  return new NextRequest("http://localhost/api/candidates/me/career", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document: emptyCareerProfile(), expectedUpdatedAt, ...extra }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockReturnValue(null);
  mocks.auth.mockResolvedValue(candidateCtx);
  candidates = createMockQueryBuilder({ data: { id: candidateId } });
  careers = createMockQueryBuilder({
    data: { document: emptyCareerProfile(), updated_at: "2026-09-04T12:00:00Z" },
  });
  mocks.client.mockResolvedValue(
    createMockSupabase({ candidates, candidate_career_profiles: careers }),
  );
});

describe("candidate career API", () => {
  it.each([null, { role: "recruiter" }, { role: "hiring_manager" }])(
    "denies access to %s",
    async (ctx) => {
      mocks.auth.mockResolvedValue(ctx);
      const { GET, PATCH } = await import("@/app/api/candidates/me/career/route");
      expect((await GET()).status).toBe(ctx ? 403 : 401);
      expect((await PATCH(request())).status).toBe(ctx ? 403 : 401);
      expect(careers.select).not.toHaveBeenCalled();
    },
  );
  it("uses authenticated ownership for reads and inserts", async () => {
    const { GET, PATCH } = await import("@/app/api/candidates/me/career/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(candidates.eq).toHaveBeenCalledWith("user_id", candidateCtx.userId);
    expect((await PATCH(request())).status).toBe(200);
    expect(careers.insert).toHaveBeenCalledWith({
      candidate_id: candidateId,
      document: emptyCareerProfile(),
    });
  });
  it("rejects forged owner fields without writing", async () => {
    const { PATCH } = await import("@/app/api/candidates/me/career/route");
    expect((await PATCH(request(null, { candidate_id: "someone-else" }))).status).toBe(422);
    expect(careers.insert).not.toHaveBeenCalled();
  });
  it("rejects stale writes and concurrent first saves", async () => {
    const { PATCH } = await import("@/app/api/candidates/me/career/route");
    vi.mocked(careers.maybeSingle).mockResolvedValueOnce({ data: null, error: null });
    expect((await PATCH(request("2026-09-04T11:00:00Z"))).status).toBe(409);
    expect(careers.eq).toHaveBeenCalledWith("updated_at", "2026-09-04T11:00:00Z");
    vi.mocked(careers.maybeSingle).mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    expect((await PATCH(request())).status).toBe(409);
  });
  it("does not report success when storage fails", async () => {
    vi.mocked(careers.maybeSingle).mockResolvedValueOnce({
      data: null,
      error: { message: "DB unavailable" },
    });
    const { PATCH } = await import("@/app/api/candidates/me/career/route");
    expect((await PATCH(request())).status).toBe(500);
  });
});
