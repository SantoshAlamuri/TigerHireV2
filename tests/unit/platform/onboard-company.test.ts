import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePlatformAdmin = vi.fn();
const mockIsPublicDomain = vi.fn();
const mockValidateOrigin = vi.fn(() => null);
const mockSelectMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockSelectMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockInviteUserByEmail = vi.fn();
const mockDeleteUser = vi.fn();
const mockUpdateUserById = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/security/platform-admin", () => ({
  requirePlatformAdmin: (...args: unknown[]) => mockRequirePlatformAdmin(...args),
}));

vi.mock("@/lib/sso/domain", () => ({
  isPublicDomain: (...args: unknown[]) => mockIsPublicDomain(...args),
  isValidDomain: (d: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      admin: {
        inviteUserByEmail: mockInviteUserByEmail,
        deleteUser: mockDeleteUser,
        updateUserById: mockUpdateUserById,
      },
    },
  }),
}));

describe("POST /api/platform/companies/onboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatformAdmin.mockResolvedValue({ context: { userId: "actor-1" } });
    mockIsPublicDomain.mockResolvedValue(false);
    mockSelectMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockInviteUserByEmail.mockResolvedValue({ data: { user: { id: "auth-user-1" } }, error: null });
    mockRpc.mockResolvedValue({
      data: [{ company_id: "org-1", admin_user_id: "auth-user-1" }],
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({ data: { user: { id: "auth-user-1" } }, error: null });
  });

  it("rejects non-platform-admin", async () => {
    mockRequirePlatformAdmin.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import("@/app/api/platform/companies/onboard/route");
    const response = await POST(
      new Request("http://localhost/api/platform/companies/onboard", { method: "POST" }) as never,
    );
    expect(response.status).toBe(403);
  });

  it("rejects duplicate domain", async () => {
    mockSelectMaybeSingle.mockResolvedValueOnce({ data: { id: "existing" }, error: null });
    const { POST } = await import("@/app/api/platform/companies/onboard/route");
    const response = await POST(
      new Request("http://localhost/api/platform/companies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: "Acme",
          primary_domain: "acme.com",
          plan: "starter",
          admin_email: "admin@acme.com",
          admin_first_name: "A",
          admin_last_name: "B",
        }),
      }) as never,
    );
    expect(response.status).toBe(400);
  });

  it("rejects public domain", async () => {
    mockIsPublicDomain.mockResolvedValueOnce(true);
    const { POST } = await import("@/app/api/platform/companies/onboard/route");
    const response = await POST(
      new Request("http://localhost/api/platform/companies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: "Acme",
          primary_domain: "gmail.com",
          plan: "starter",
          admin_email: "admin@gmail.com",
          admin_first_name: "A",
          admin_last_name: "B",
        }),
      }) as never,
    );
    expect(response.status).toBe(400);
  });

  it("creates company mapping admin and sends invite", async () => {
    const { POST } = await import("@/app/api/platform/companies/onboard/route");
    const response = await POST(
      new Request("http://localhost/api/platform/companies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: "Acme",
          primary_domain: "acme.com",
          plan: "starter",
          admin_email: "admin@acme.com",
          admin_first_name: "A",
          admin_last_name: "B",
        }),
      }) as never,
    );
    expect(response.status).toBe(201);
    expect(mockInviteUserByEmail).toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalled();
    expect(mockUpdateUserById).toHaveBeenCalled();
  });

  it("rolls back invited auth user when transaction fails", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "failed" } });
    const { POST } = await import("@/app/api/platform/companies/onboard/route");
    const response = await POST(
      new Request("http://localhost/api/platform/companies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: "Acme",
          primary_domain: "acme.com",
          plan: "starter",
          admin_email: "admin@acme.com",
          admin_first_name: "A",
          admin_last_name: "B",
        }),
      }) as never,
    );
    expect(response.status).toBe(500);
    expect(mockDeleteUser).toHaveBeenCalledWith("auth-user-1");
  });
});
