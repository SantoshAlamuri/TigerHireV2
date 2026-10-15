import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder, recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role?: string } | null, ...roles: string[]) =>
    Boolean(ctx?.role && roles.includes(ctx.role)),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: mockFrom,
    }),
}));

describe("GET /api/audit/hiring-offer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
  });

  it("returns 400 for invalid entityId format", async () => {
    const { GET } = await import("@/app/api/audit/hiring-offer/route");
    const req = new Request(
      "http://localhost:3000/api/audit/hiring-offer?entityType=offer&entityId=not-a-uuid",
    );
    const res = await GET(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid entityId");
  });

  it("resolves offer via applications relation and returns events", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        return createMockQueryBuilder({
          data: {
            organisation_id: "org-1",
            applications: { job_id: "job-1" },
          },
        });
      }
      if (table === "jobs") {
        return createMockQueryBuilder({
          data: {
            hiring_manager_id: "hm-1",
          },
        });
      }
      if (table === "hiring_offer_audit_events") {
        return createMockQueryBuilder({
          data: [
            {
              id: "evt-1",
              event_type: "BGV_INITIATED",
              actor_profile_id: "user-1",
              actor_role: "recruiter",
              created_at: "2026-04-29T12:00:00.000Z",
            },
          ],
        });
      }
      return createMockQueryBuilder();
    });

    const { GET } = await import("@/app/api/audit/hiring-offer/route");
    const req = new Request(
      "http://localhost:3000/api/audit/hiring-offer?entityType=offer&entityId=f5000000-0000-4000-8000-000000000001",
    );
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events[0]?.event_type).toBe("BGV_INITIATED");
  });
});
