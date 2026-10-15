import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), from: vi.fn(), role: vi.fn() }));
vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: mocks.auth,
    requireAuth: (ctx: unknown) => Boolean(ctx),
    hasRole: mocks.role,
    getTenantScopedClient: async () => ({ assertJobAccess: mocks.access }),
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mocks.from }),
}));
import { GET } from "@/app/api/jobs/[id]/application-summary/route";
const request = () =>
  GET(new NextRequest("http://localhost/api/jobs/job-1/application-summary"), {
    params: Promise.resolve({ id: "job-1" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user-1" });
  mocks.role.mockReturnValue(true);
  mocks.access.mockResolvedValue(true);
});
describe("application summary", () => {
  it("counts all rows without requesting application payloads", async () => {
    const select = vi.fn();
    const eq = vi.fn();
    const query = {
      select,
      eq,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ count: 251, error: null }).then(resolve),
    };
    select.mockReturnValue(query);
    eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    const response = await request();
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain('"screened":251');
    expect(select).toHaveBeenCalledWith("id, application_screening_answers!inner(id)", {
      count: "exact",
      head: true,
    });
    expect(eq).toHaveBeenCalledWith("job_id", "job-1");
  });
  it("does not query applications for a job the caller cannot access", async () => {
    mocks.access.mockResolvedValue(false);
    expect((await request()).status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects non-hiring roles before job lookup", async () => {
    mocks.role.mockReturnValue(false);
    expect((await request()).status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
