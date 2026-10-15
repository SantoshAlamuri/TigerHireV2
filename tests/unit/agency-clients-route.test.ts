import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { agencyCtx, createMockSupabase, createMockQueryBuilder, buildRequest } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
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
  handleZodError: (_err: unknown) =>
    new Response(JSON.stringify({ error: "Invalid request payload" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (err: unknown, msg: string) =>
    new Response(
      JSON.stringify({
        error: msg,
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    ),
}));

const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

const mockOrganisationRepositoryGetBySlug = vi.fn();
vi.mock("@/lib/repositories/OrganisationRepository", () => ({
  OrganisationRepository: {
    getBySlug: (...args: unknown[]) => mockOrganisationRepositoryGetBySlug(...args),
  },
}));

describe("GET /api/agency/clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(agencyCtx);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not agency role", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...agencyCtx,
      role: "recruiter",
    });
    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when agency has no organisationId", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...agencyCtx,
      organisationId: null,
    });
    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("organisation");
  });

  it("returns empty organisations when agency_clients query errors", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: null,
      error: { message: "db error" },
    });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisations).toEqual([]);
  });

  it("returns empty organisations when no client links", async () => {
    const linksBuilder = createMockQueryBuilder({ data: [], count: 0 });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisations).toEqual([]);
  });

  it("returns client organisations when links exist", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [
        { client_organisation_id: "client-1", status: "active", is_active: true },
        { client_organisation_id: "client-2", status: "active", is_active: true },
      ],
    });
    const orgsBuilder = createMockQueryBuilder({
      data: [
        { id: "client-1", name: "Client A", slug: "client-a" },
        { id: "client-2", name: "Client B", slug: "client-b" },
      ],
    });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
      organisations: orgsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisations).toHaveLength(2);
    expect(body.organisations[0].name).toBe("Client A");
  });

  it("does not report a pending request as a client", async () => {
    // The company has not approved yet, so the agency must not see it listed as
    // a client it can work on — it surfaces under pendingRequests instead.
    const linksBuilder = createMockQueryBuilder({
      data: [
        { client_organisation_id: "client-1", status: "pending", is_active: true },
        { client_organisation_id: "client-2", status: "active", is_active: true },
      ],
    });
    const orgsBuilder = createMockQueryBuilder({
      data: [
        { id: "client-1", name: "Not Yet Approved", slug: "not-yet" },
        { id: "client-2", name: "Client B", slug: "client-b" },
      ],
    });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
      organisations: orgsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    const body = await res.json();
    expect(body.organisations).toHaveLength(1);
    expect(body.organisations[0].name).toBe("Client B");
    expect(body.pendingRequests).toHaveLength(1);
    expect(body.pendingRequests[0].name).toBe("Not Yet Approved");
  });

  it("does not report a deactivated link as a client", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1", status: "active", is_active: false }],
    });
    const orgsBuilder = createMockQueryBuilder({
      data: [{ id: "client-1", name: "Paused Client", slug: "paused" }],
    });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
      organisations: orgsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    const body = await res.json();
    expect(body.organisations).toEqual([]);
  });

  it("returns empty organisations when organisations query errors", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1", status: "active", is_active: true }],
    });
    const orgsBuilder = createMockQueryBuilder({
      data: null,
      error: { message: "org fetch failed" },
    });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
      organisations: orgsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/agency/clients/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisations).toEqual([]);
  });
});

describe("POST /api/agency/clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(agencyCtx);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: { slug: "acme" },
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not agency", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...agencyCtx,
      role: "leadership",
    });
    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: { slug: "acme" },
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(403);
  });

  it("returns 422 when slug is missing", async () => {
    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: {},
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Invalid request payload");
  });

  it("returns 400 for malformed JSON", async () => {
    const { POST } = await import("@/app/api/agency/clients/route");
    const req = new NextRequest("http://localhost/api/agency/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when slug is empty after normalize", async () => {
    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: { slug: "---" },
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("letter or number");
  });

  it("returns 400 when adding own organisation as client", async () => {
    const existingOrg = {
      id: agencyCtx.organisationId,
      name: "My Agency",
      slug: "my-agency",
      type: "agency",
    };
    mockOrganisationRepositoryGetBySlug.mockResolvedValue(existingOrg);
    const supabase = createMockSupabase({});
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: { slug: "my-agency" },
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("own organisation");
  });

  it("creates new client org and link when slug does not exist", async () => {
    mockOrganisationRepositoryGetBySlug.mockResolvedValue(null);
    const insertBuilder = createMockQueryBuilder({
      data: {
        id: "new-org-1",
        name: "Acme Corp",
        slug: "acme-corp",
        type: "company",
      },
    });
    const admin = createMockSupabase({ organisations: insertBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const linkBuilder = createMockQueryBuilder({ data: {}, error: null });
    const supabase = createMockSupabase({
      agency_clients: linkBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: { slug: "Acme Corp!", name: "Acme Corp" },
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.organisation).toBeDefined();
    expect(body.organisation.slug).toBe("acme-corp");
  });

  it("adds existing client by slug and returns 201", async () => {
    const existingOrg = {
      id: "client-org-1",
      name: "Existing Client",
      slug: "existing-client",
      type: "company",
    };
    mockOrganisationRepositoryGetBySlug.mockResolvedValue(existingOrg);
    const linkBuilder = createMockQueryBuilder({ data: {}, error: null });
    const supabase = createMockSupabase({
      agency_clients: linkBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: { slug: "existing-client" },
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.organisation.id).toBe("client-org-1");
  });

  it("returns 409 when client is already added", async () => {
    const existingOrg = {
      id: "client-org-1",
      name: "Existing",
      slug: "existing",
      type: "company",
    };
    mockOrganisationRepositoryGetBySlug.mockResolvedValue(existingOrg);
    const linkBuilder = createMockQueryBuilder({
      data: null,
      error: { code: "23505", message: "unique violation" },
    });
    const supabase = createMockSupabase({
      agency_clients: linkBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: { slug: "existing" },
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already requested access");
  });

  it("normalizes slug (lowercase, hyphens)", async () => {
    mockOrganisationRepositoryGetBySlug.mockResolvedValue(null);
    const insertBuilder = createMockQueryBuilder({
      data: {
        id: "new-1",
        name: "Test",
        slug: "test-company",
        type: "company",
      },
    });
    mockCreateSupabaseAdmin.mockReturnValue(createMockSupabase({ organisations: insertBuilder }));
    const linkBuilder = createMockQueryBuilder({ data: {}, error: null });
    mockCreateSupabaseServerClient.mockResolvedValue(
      createMockSupabase({ agency_clients: linkBuilder }),
    );

    const { POST } = await import("@/app/api/agency/clients/route");
    const req = buildRequest("http://localhost/api/agency/clients", {
      method: "POST",
      body: { slug: "  Test   Company  " },
    });
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.organisation.slug).toBe("test-company");
  });
});
