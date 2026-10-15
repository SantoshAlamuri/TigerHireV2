import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, companyAdminCtx, candidateCtx } from "../helpers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";

const mockGetAuthContext = vi.fn();
const mockListPendingApprovalItems = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
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

vi.mock("@/lib/approvals/list-pending-approval-items", () => ({
  listPendingApprovalItems: (...args: unknown[]) => mockListPendingApprovalItems(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/enterprise-roles", () => ({
  hasAnyEnterpriseRole: vi.fn().mockResolvedValue(false),
}));

describe("GET /api/approvals", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockListPendingApprovalItems.mockReset();
    mockListPendingApprovalItems.mockResolvedValue({ shortlistApprovals: [], items: [] });
    vi.mocked(hasAnyEnterpriseRole).mockResolvedValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/approvals/route");
    const req = new NextRequest("http://localhost:3000/api/approvals");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is candidate", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/approvals/route");
    const req = new NextRequest("http://localhost:3000/api/approvals");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 with empty pendingApprovals when jobs query returns empty", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/approvals/route");
    const req = new NextRequest("http://localhost:3000/api/approvals");
    const res = await GET(req);
    const errorText = await res.text();
    expect(res.status, errorText).toBe(200);
    const body = JSON.parse(errorText);
    expect(body.pendingApprovals).toEqual([]);
  });

  it("includes admin offer approvals for company admins", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockListPendingApprovalItems.mockResolvedValue({
      shortlistApprovals: [],
      items: [{ id: "offer-1", source: "offer_finance", title: "Backend Engineer" }],
    });

    const { GET } = await import("@/app/api/approvals/route");
    const req = new NextRequest("http://localhost:3000/api/approvals");
    const res = await GET(req);

    const errorText = await res.text();
    expect(res.status, errorText).toBe(200);
    const body = JSON.parse(errorText);
    expect(body.items.some((item: { source?: string }) => item.source === "offer_finance")).toBe(
      true,
    );
    expect(mockListPendingApprovalItems).toHaveBeenCalled();
  });

  it("includes finance approvals when finance is delegated to the actor", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockListPendingApprovalItems.mockResolvedValue({
      shortlistApprovals: [],
      items: [{ id: "offer-2", source: "offer_finance", title: "Frontend Engineer" }],
    });

    const { GET } = await import("@/app/api/approvals/route");
    const req = new NextRequest("http://localhost:3000/api/approvals");
    const res = await GET(req);

    const errorText = await res.text();
    expect(res.status, errorText).toBe(200);
    const body = JSON.parse(errorText);
    expect(body.items.some((item: { source?: string }) => item.source === "offer_finance")).toBe(
      true,
    );
  });

  it("does not include finance-gated requisition stages for company admin without finance role", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockListPendingApprovalItems.mockResolvedValue({
      shortlistApprovals: [],
      items: [],
    });

    const { GET } = await import("@/app/api/approvals/route");
    const req = new NextRequest("http://localhost:3000/api/approvals");
    const res = await GET(req);
    const errorText = await res.text();
    expect(res.status, errorText).toBe(200);
    const body = JSON.parse(errorText);
    expect(body.items.some((item: { source?: string }) => item.source === "hiring_request")).toBe(
      false,
    );
  });

  it("includes admin-gated requisition stages for company admin", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockListPendingApprovalItems.mockResolvedValue({
      shortlistApprovals: [],
      items: [{ id: "req-2", source: "hiring_request", title: "Product Designer" }],
    });

    const { GET } = await import("@/app/api/approvals/route");
    const req = new NextRequest("http://localhost:3000/api/approvals");
    const res = await GET(req);
    const errorText = await res.text();
    expect(res.status, errorText).toBe(200);
    const body = JSON.parse(errorText);
    expect(body.items.some((item: { source?: string }) => item.source === "hiring_request")).toBe(
      true,
    );
  });
});
