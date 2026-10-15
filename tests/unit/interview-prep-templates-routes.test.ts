import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockHasAnyEnterpriseRole = vi.fn();
const mockGetOrgSettingsPermissions = vi.fn();
const mockHasSettingsCapability = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
  jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleZodError: () => Response.json({ error: "Invalid request payload" }, { status: 422 }),
  handleApiError: (err: unknown) => Response.json({ error: String(err) }, { status: 500 }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/security/enterprise-roles", () => ({
  hasAnyEnterpriseRole: (...args: unknown[]) => mockHasAnyEnterpriseRole(...args),
}));

vi.mock("@/lib/settings/permissions", () => ({
  getOrgSettingsPermissions: (...args: unknown[]) => mockGetOrgSettingsPermissions(...args),
  hasSettingsCapability: (...args: unknown[]) => mockHasSettingsCapability(...args),
}));

describe("interview prep template routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockHasAnyEnterpriseRole.mockResolvedValue(true);
    mockGetOrgSettingsPermissions.mockResolvedValue({});
    mockHasSettingsCapability.mockReturnValue(true);
  });

  it("POST /api/interview-prep/templates returns 400 for malformed JSON", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    const { POST } = await import("@/app/api/interview-prep/templates/route");
    const req = new NextRequest("http://localhost/api/interview-prep/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("PATCH /api/interview-prep/templates/[id] returns 400 for malformed JSON", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    const { PATCH } = await import("@/app/api/interview-prep/templates/[id]/route");
    const req = new NextRequest("http://localhost/api/interview-prep/templates/tpl-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(400);
  });

  it("GET /api/interview-prep/templates returns template list", async () => {
    const supabase = createMockSupabase({
      interview_prep_templates: createMockQueryBuilder({
        data: [
          {
            id: "tpl-1",
            role_function: "Engineering",
            stage_name: "Screen",
            title: "Screening questions",
            when_to_use: "Early stage",
            objective: "Assess fundamentals",
            question_tracks: ["core"],
            rubric: ["clarity"],
          },
        ],
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { GET } = await import("@/app/api/interview-prep/templates/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
  });
});
