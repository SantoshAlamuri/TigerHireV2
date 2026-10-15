import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("assessment template routes", () => {
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

  it("GET /api/assessment-templates returns 403 when user is out of workflow roles", async () => {
    mockHasAnyEnterpriseRole.mockResolvedValue(false);
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    const { GET } = await import("@/app/api/assessment-templates/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET /api/assessment-templates returns active templates and capability flag", async () => {
    mockHasSettingsCapability.mockReturnValue(false);
    const supabase = createMockSupabase({
      assessment_templates: createMockQueryBuilder({
        data: [{ id: "tpl-1", name: "Take home template", is_active: true }],
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { GET } = await import("@/app/api/assessment-templates/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
    expect(body.canManageTemplates).toBe(false);
  });

  it("POST /api/assessment-templates returns 403 when template capability is disabled", async () => {
    mockHasSettingsCapability.mockReturnValue(false);
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    const { POST } = await import("@/app/api/assessment-templates/route");
    const req = new NextRequest("http://localhost/api/assessment-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "written",
        scope: "screening",
        name: "Template 1",
        content: "A".repeat(20),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("PATCH /api/assessment-templates/[id] returns 400 for empty payload", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    const { PATCH } = await import("@/app/api/assessment-templates/[id]/route");
    const req = new NextRequest("http://localhost/api/assessment-templates/tpl-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/assessment-templates/[id] returns 404 when template is missing", async () => {
    const supabase = createMockSupabase({
      assessment_templates: createMockQueryBuilder({ data: null, error: null }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { DELETE } = await import("@/app/api/assessment-templates/[id]/route");
    const res = await DELETE(new NextRequest("http://localhost/api/assessment-templates/tpl-404"), {
      params: Promise.resolve({ id: "tpl-404" }),
    });
    expect(res.status).toBe(404);
  });
});
