import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockAdminFrom = vi.fn();
const mockValidateOrigin = vi.fn(() => null);

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (payload: unknown, status = 200) => Response.json(payload, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
  handleZodError: () => Response.json({ error: "Validation error" }, { status: 422 }),
  parseJsonBody: async (request: Request) => {
    try {
      return { body: await request.json(), errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockAdminFrom(...args) }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (req: Request) => mockValidateOrigin(req),
}));

describe("offer letter flow settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns default flow when no org settings row exists", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockAdminFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/settings/offer-letter-flow/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { flow: { steps: string[] }; canEdit: boolean };
    expect(payload.flow.steps.length).toBeGreaterThanOrEqual(3);
    expect(payload.canEdit).toBe(false);
  });

  it("POST is forbidden for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "recruiter",
      organisationId: "org-1",
    });

    const { POST } = await import("@/app/api/settings/offer-letter-flow/route");
    const request = new Request("http://localhost:3000/api/settings/offer-letter-flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: ["A", "B", "C"],
        ctcCalculators: [
          {
            key: "std",
            name: "Standard CTC",
            components: [{ label: "Base", annual: 1000000 }],
          },
        ],
        defaultCalculatorKey: "std",
      }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(403);
  });

  it("POST saves flow for company admin", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u-admin",
      role: "leadership",
      organisationId: "org-1",
      isOrgAdmin: true,
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "role_permission_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { permissions: { recruiterCanCreateOffers: true } },
                  error: null,
                }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    });

    const { POST } = await import("@/app/api/settings/offer-letter-flow/route");
    const request = new Request("http://localhost:3000/api/settings/offer-letter-flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: ["Select candidate", "Compute CTC", "Fill letter details", "Create offer"],
        ctcCalculators: [
          {
            key: "eng_std",
            name: "Engineering Standard",
            components: [{ label: "Base", annual: 1200000 }],
          },
          {
            key: "sales_std",
            name: "Sales Standard",
            components: [{ label: "Base", annual: 900000 }],
          },
        ],
        defaultCalculatorKey: "eng_std",
      }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      flow: { ctcCalculators: Array<{ name: string; components: Array<{ label: string }> }> };
    };
    expect(payload.flow.ctcCalculators[0]?.name).toBe("Engineering Standard");
    expect(payload.flow.ctcCalculators[0]?.components[0]?.label).toBe("Base");
  });
});
