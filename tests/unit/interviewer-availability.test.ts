import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder } from "../helpers";

const declarantCtx = {
  userId: "u-interviewer",
  role: "interviewer" as const,
  organisationId: "org-1",
};

const recruiterCtx = {
  userId: "u-recruiter",
  role: "recruiter" as const,
  organisationId: "org-1",
};

vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: vi.fn(),
    requireAuth: (ctx: unknown) => !!ctx,
    hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
    jsonError: (msg: string, status: number) =>
      new Response(JSON.stringify({ error: msg }), { status }),
    jsonSuccess: (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), { status: status ?? 200 }),
    parseJsonBody: vi.fn(async (req: NextRequest) => ({
      body: await req.json(),
      errorResponse: null,
    })),
  };
});

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: vi.fn(() => null),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mockFrom }),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: mockAdminFrom }),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn(async () => ({
    job: { id: "job-1", organisation_id: "org-1", title: "Engineer" },
  })),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("interviewer availability APIs", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAdminFrom.mockReset();
  });

  it("GET /api/me/availability returns windows for declarant", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValue(declarantCtx);

    const builder = createMockQueryBuilder({
      data: [
        {
          id: "w1",
          user_id: declarantCtx.userId,
          organisation_id: "org-1",
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 90000000).toISOString(),
          notes: null,
          is_active: true,
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/me/availability/route");
    const res = await GET(new NextRequest("http://localhost/api/me/availability"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.windows).toHaveLength(1);
  });

  it("GET /api/jobs/[id]/interviewer-availability scopes to assigned interviewers", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValue(recruiterCtx);

    const stagesBuilder = createMockQueryBuilder({
      data: [
        { stage_type: "interview", interviewer_user_id: "iv-1" },
        { stage_type: "screening", interviewer_user_id: null },
      ],
      error: null,
    });
    const windowsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "w1",
          user_id: "iv-1",
          organisation_id: "org-1",
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 90000000).toISOString(),
          notes: null,
          is_active: true,
        },
      ],
      error: null,
    });
    const profilesBuilder = createMockQueryBuilder({
      data: [{ id: "iv-1", full_name: "Alex" }],
      error: null,
    });

    const jobsBuilder = createMockQueryBuilder({
      data: { hiring_manager_id: null },
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "jobs") return jobsBuilder;
      if (table === "pipeline_stages") return stagesBuilder;
      if (table === "interviewer_availability_windows") return windowsBuilder;
      if (table === "profiles") return profilesBuilder;
      return createMockQueryBuilder({ data: [], error: null });
    });

    const { GET } = await import("@/app/api/jobs/[id]/interviewer-availability/route");
    const res = await GET(
      new NextRequest("http://localhost/api/jobs/job-1/interviewer-availability"),
      { params: Promise.resolve({ id: "job-1" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.interviewer_user_ids).toEqual(["iv-1"]);
    expect(json.windows.every((w: { user_id: string }) => w.user_id === "iv-1")).toBe(true);
  });
});

describe("notify-interviewer-availability dedupe", () => {
  it("isWithinDailyCap respects 24h window", async () => {
    const { isWithinDailyCap } = await import("@/lib/interviews/notify-interviewer-availability");
    const now = Date.now();
    expect(isWithinDailyCap(new Date(now - 1000).toISOString(), now)).toBe(true);
    expect(isWithinDailyCap(new Date(now - 25 * 60 * 60 * 1000).toISOString(), now)).toBe(false);
  });
});
