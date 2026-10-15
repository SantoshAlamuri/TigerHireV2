import { describe, it, expect, vi, beforeEach } from "vitest";

const candidateCtx = {
  userId: "u1",
  role: "candidate_free" as const,
  organisationId: null as string | null,
};

vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: vi.fn().mockResolvedValue(candidateCtx),
    requireAuth: (ctx: unknown) => !!ctx,
    hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
    jsonError: (msg: string, status: number) =>
      new Response(JSON.stringify({ error: msg }), { status }),
    jsonSuccess: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
    handleZodError: () => new Response(JSON.stringify({ error: "validation" }), { status: 422 }),
  };
});

const mockUpdateStatus = vi.fn();
vi.mock("@/lib/services/ApplicationService", () => ({
  ApplicationService: { updateStatus: mockUpdateStatus },
}));

const mockCreate = vi.fn();
vi.mock("@/lib/repositories/NotificationRepository", () => ({
  NotificationRepository: { create: mockCreate },
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser: vi.fn() }, from: mockFrom }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

describe("PATCH /api/applications/[id] - candidate withdraw", () => {
  beforeEach(() => {
    vi.resetModules();
    mockUpdateStatus.mockReset();
    mockCreate.mockReset();
    mockFrom.mockReset();
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "app-1",
                    job_id: "job-1",
                    candidate_id: "cand-1",
                    status: "applied",
                    candidates: { user_id: "u1" },
                  },
                }),
            }),
          }),
        };
      }
      return {};
    });
  });

  it("returns 400 when candidate sends status other than withdrawn", async () => {
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const request = new Request("http://localhost/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shortlisted" }),
    });
    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(response.status).toBe(400);
  }, 15000);

  it("returns 200 and application when candidate withdraws and notifies recruiter", async () => {
    mockUpdateStatus.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "app-1",
                    job_id: "job-1",
                    candidate_id: "cand-1",
                    status: "applied",
                    candidates: { user_id: "u1" },
                  },
                }),
            }),
          }),
        };
      }
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { created_by: "recruiter-1", title: "Engineer" },
                }),
            }),
          }),
        };
      }
      if (table === "candidates") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { name: "Jane Doe" } }),
            }),
          }),
        };
      }
      return {};
    });

    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const request = new Request("http://localhost/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "withdrawn" }),
    });
    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(response.status).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.anything(), "app-1", "withdrawn", "u1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Application withdrawn",
        body: expect.stringContaining("Jane Doe"),
      }),
    );
    const body = await response.json();
    expect(body.application).toBeDefined();
    expect(body.application.id).toBe("app-1");
  });
});
