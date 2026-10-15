import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { requireRole } from "@/lib/security/rbac";
import type { AuthContext } from "@/lib/security/rbac";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isAuthContext(result: unknown): result is AuthContext {
  return typeof result === "object" && result !== null && "userId" in result && "role" in result;
}

describe("requireRole", () => {
  const mockGetUser = vi.fn();
  const mockProfileSingle = vi.fn();
  const dummyReq = new NextRequest("http://localhost/api/test");

  beforeEach(() => {
    vi.clearAllMocks();

    (createSupabaseServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: mockGetUser },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: mockProfileSingle,
          }),
        }),
      }),
    });
  });

  it("returns 401 when no user session exists", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await requireRole(dummyReq, ["recruiter"]);
    expect(isAuthContext(result)).toBe(false);
    expect((result as Response).status).toBe(401);
    const body = await (result as Response).json();
    expect(body.error).toBe("Unauthenticated");
  });

  it("returns 403 when profile is not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockProfileSingle.mockResolvedValue({ data: null });

    const result = await requireRole(dummyReq, ["recruiter"]);
    expect(isAuthContext(result)).toBe(false);
    expect((result as Response).status).toBe(403);
    const body = await (result as Response).json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user role is not in allowedRoles", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "candidate_free", organisation_id: null },
    });

    const result = await requireRole(dummyReq, ["recruiter", "leadership"]);
    expect(isAuthContext(result)).toBe(false);
    expect((result as Response).status).toBe(403);
  });

  it("returns AuthContext when user has allowed role", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "recruiter", organisation_id: "org-1" },
    });

    const result = await requireRole(dummyReq, ["recruiter", "leadership"]);
    expect(isAuthContext(result)).toBe(true);
    expect((result as AuthContext).userId).toBe("u-1");
    expect((result as AuthContext).role).toBe("recruiter");
    expect((result as AuthContext).organisationId).toBe("org-1");
    expect((result as AuthContext).companyId).toBe("org-1");
  });

  it("returns 403 when user org does not match resourceOrganisationId", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "recruiter", organisation_id: "org-1" },
    });

    const result = await requireRole(dummyReq, ["recruiter"], "org-other");
    expect(isAuthContext(result)).toBe(false);
    expect((result as Response).status).toBe(403);
  });

  it("allows super_admin to access any organisation resource", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-sa" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "super_admin", organisation_id: null },
    });

    const result = await requireRole(dummyReq, ["super_admin", "recruiter"], "org-other");
    expect(isAuthContext(result)).toBe(true);
    expect((result as AuthContext).role).toBe("super_admin");
  });

  it("allows access when resourceOrganisationId matches user org", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "recruiter", organisation_id: "org-1" },
    });

    const result = await requireRole(dummyReq, ["recruiter"], "org-1");
    expect(isAuthContext(result)).toBe(true);
  });

  it("skips org check when resourceOrganisationId is null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "recruiter", organisation_id: "org-1" },
    });

    const result = await requireRole(dummyReq, ["recruiter"], null);
    expect(isAuthContext(result)).toBe(true);
  });

  it("skips org check when resourceOrganisationId is undefined", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "recruiter", organisation_id: "org-1" },
    });

    const result = await requireRole(dummyReq, ["recruiter"], undefined);
    expect(isAuthContext(result)).toBe(true);
  });

  it("sets organisationId to undefined when profile has no org", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-c" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "candidate_free", organisation_id: null },
    });

    const result = await requireRole(dummyReq, ["candidate_free"]);
    expect(isAuthContext(result)).toBe(true);
    expect((result as AuthContext).organisationId).toBeUndefined();
    expect((result as AuthContext).companyId).toBeUndefined();
  });

  it("accepts multiple allowedRoles and matches the user's role", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-hm" } } });
    mockProfileSingle.mockResolvedValue({
      data: { role: "hiring_manager", organisation_id: "org-2" },
    });

    const result = await requireRole(dummyReq, ["recruiter", "hiring_manager", "leadership"]);
    expect(isAuthContext(result)).toBe(true);
    expect((result as AuthContext).role).toBe("hiring_manager");
  });
});
