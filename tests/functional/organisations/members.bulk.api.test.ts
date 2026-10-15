import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  ctx: { userId: "user-1", role: "leadership", organisationId: "org-1" },
  pendingInvites: [{ email: "existing@example.com" }],
}));

const mockCreateInvite = vi.fn();
const mockSendInviteEmail = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(async () => state.ctx),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
  },
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
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(JSON.stringify({ error: err.issues.map((e) => e.message).join("; ") }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/repositories/OrganisationRepository", () => ({
  OrganisationRepository: {
    getPendingInvites: vi.fn(async () => state.pendingInvites),
    createInvite: (...args: unknown[]) => mockCreateInvite(...args),
    getById: vi.fn(async () => ({ id: "org-1", name: "Acme Inc" })),
    findPendingInvite: vi.fn(async () => null),
  },
}));

vi.mock("@/lib/repositories/ProfileRepository", () => ({
  ProfileRepository: { getById: vi.fn(async () => ({ full_name: "A Recruiter" })) },
}));

vi.mock("@/lib/services/resend", () => ({
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  RATE_LIMIT_PRESETS: { default: { limit: 30, windowSecs: 60 } },
}));

describe("members bulk invite API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.ctx = { userId: "user-1", role: "leadership", organisationId: "org-1" };
    state.pendingInvites = [{ email: "existing@example.com" }];
  });

  it("imports CSV and skips rows with pending invites", async () => {
    const { POST } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csv: "email,role,full_name\nnew1@example.com,recruiter,New One\nexisting@example.com,interviewer,Existing",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.import.totalRows).toBe(2);
    expect(body.import.accepted).toBe(2);
    expect(body.import.created).toBe(1);
    expect(mockCreateInvite).toHaveBeenCalledTimes(1);
    expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
  });
});
