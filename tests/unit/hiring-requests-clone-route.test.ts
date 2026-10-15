import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (payload: unknown, status = 200) => Response.json(payload, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/audit/hiring-offer-audit", () => ({
  recordHiringOfferAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit/client-ip", () => ({
  getRequestClientIp: () => "127.0.0.1",
}));

describe("hiring request clone route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 and cloned draft", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "hm-1",
      role: "hiring_manager",
      organisationId: "org-1",
    });
    let step = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== "hiring_requests") return null;
      if (step++ === 0) {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "hr-1",
                    organisation_id: "org-1",
                    created_by: "hm-1",
                    title: "Backend Engineer",
                    department: "Engineering",
                    headcount: 1,
                    urgency: "high",
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "hr-clone", status: "draft", title: "Backend Engineer" },
                error: null,
              }),
          }),
        }),
      };
    });

    const { POST } = await import("@/app/api/hiring-requests/[id]/clone/route");
    const req = new NextRequest("http://localhost/api/hiring-requests/hr-1/clone", {
      method: "POST",
    });
    const response = await POST(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { request: { id: string; status: string } };
    expect(payload.request.id).toBe("hr-clone");
    expect(payload.request.status).toBe("draft");
  });

  it("falls back to base clone payload when extended columns are unavailable", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "hm-1",
      role: "hiring_manager",
      organisationId: "org-1",
    });
    let step = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== "hiring_requests") return null;
      if (step++ === 0) {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "hr-1",
                    organisation_id: "org-1",
                    created_by: "hm-1",
                    title: "Backend Engineer",
                    department: "Engineering",
                    headcount: 1,
                    urgency: "high",
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (step === 2) {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: { code: "PGRST204", message: "Could not find the 'role_level' column" },
                }),
            }),
          }),
        };
      }
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "hr-clone", status: "draft", title: "Backend Engineer" },
                error: null,
              }),
          }),
        }),
      };
    });

    const { POST } = await import("@/app/api/hiring-requests/[id]/clone/route");
    const req = new NextRequest("http://localhost/api/hiring-requests/hr-1/clone", {
      method: "POST",
    });
    const response = await POST(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { request: { id: string; status: string } };
    expect(payload.request.id).toBe("hr-clone");
    expect(payload.request.status).toBe("draft");
  });
});
