import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  getCachedAuthProfile: vi.fn(),
  setCachedAuthProfile: vi.fn(),
}));

import {
  jsonError,
  jsonSuccess,
  handleZodError,
  requireAuth,
  hasRole,
  getAuthContext,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedAuthProfile, setCachedAuthProfile } from "@/lib/redis/auth-profile-cache";

describe("jsonError", () => {
  it("returns a JSON response with error message and given status", async () => {
    const res = jsonError("Not Found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not Found");
  });

  it("defaults to status 400", async () => {
    const res = jsonError("Bad request");
    expect(res.status).toBe(400);
  });

  it("supports 500 status", async () => {
    const res = jsonError("Internal Server Error", 500);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Server Error");
  });
});

describe("jsonSuccess", () => {
  it("returns a JSON response with data and given status", async () => {
    const res = jsonSuccess({ items: [1, 2, 3] }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.items).toEqual([1, 2, 3]);
  });

  it("defaults to status 200", async () => {
    const res = jsonSuccess({ ok: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("handles null data", async () => {
    const res = jsonSuccess(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it("handles array data", async () => {
    const res = jsonSuccess(["a", "b"]);
    const body = await res.json();
    expect(body).toEqual(["a", "b"]);
  });
});

describe("handleZodError", () => {
  it("returns 422 with joined error messages", async () => {
    const schema = z.object({
      name: z.string().min(1, "Name is required"),
      age: z.number().min(0, "Age must be non-negative"),
    });
    const result = schema.safeParse({ name: "", age: -1 });
    if (!result.success) {
      const res = handleZodError(result.error);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toContain("Name is required");
      expect(body.error).toContain("Age must be non-negative");
      expect(body.error).toContain("; ");
    }
  });

  it("handles single validation error", async () => {
    const schema = z.object({ email: z.string().email("Invalid email") });
    const result = schema.safeParse({ email: "not-an-email" });
    if (!result.success) {
      const res = handleZodError(result.error);
      const body = await res.json();
      expect(body.error).toBe("Invalid email");
    }
  });
});

describe("requireAuth", () => {
  it("returns false for null context", () => {
    expect(requireAuth(null)).toBe(false);
  });

  it("returns true for valid context", () => {
    const ctx = {
      userId: "u-1",
      role: "recruiter" as const,
      organisationId: "org-1",
    };
    expect(requireAuth(ctx)).toBe(true);
  });

  it("acts as type guard", () => {
    const ctx: {
      userId: string;
      role: "recruiter";
      organisationId: string;
    } | null = {
      userId: "u-1",
      role: "recruiter",
      organisationId: "org-1",
    };
    if (requireAuth(ctx)) {
      expect(ctx.userId).toBe("u-1");
    }
  });
});

describe("hasRole", () => {
  const recruiterCtx = {
    userId: "u-1",
    role: "recruiter" as const,
    organisationId: "org-1",
  };

  it("returns true when role matches one of the allowed roles", () => {
    expect(hasRole(recruiterCtx, "recruiter", "leadership")).toBe(true);
  });

  it("returns false when role does not match", () => {
    expect(hasRole(recruiterCtx, "super_admin")).toBe(false);
  });

  it("works with single role check", () => {
    expect(hasRole(recruiterCtx, "recruiter")).toBe(true);
  });

  it("returns false for empty roles list", () => {
    expect(hasRole(recruiterCtx)).toBe(false);
  });

  it("checks candidate roles", () => {
    const candidateCtx = {
      userId: "u-c",
      role: "candidate_free" as const,
      organisationId: null,
    };
    expect(hasRole(candidateCtx, "candidate_free", "candidate_pro")).toBe(true);
    expect(hasRole(candidateCtx, "recruiter")).toBe(false);
  });
});

describe("getAuthContext", () => {
  const mockGetUser = vi.fn();
  const mockProfileSingle = vi.fn();

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

    (getCachedAuthProfile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (setCachedAuthProfile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("returns null when no user session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const ctx = await getAuthContext();
    expect(ctx).toBeNull();
  });

  it("returns cached profile when available", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u-cached" } },
    });
    (getCachedAuthProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: "recruiter",
      organisation_id: "org-cached",
      is_active: true,
    });

    const ctx = await getAuthContext();
    expect(ctx).toEqual({
      userId: "u-cached",
      role: "recruiter",
      organisationId: "org-cached",
      isActive: true,
      roleStatus: "active",
      isPlatformAdmin: false,
      isOrgAdmin: false,
    });
    expect(mockProfileSingle).not.toHaveBeenCalled();
  });

  it("fetches profile from DB and caches it when cache miss", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u-db" } },
    });
    mockProfileSingle.mockResolvedValue({
      data: { role: "leadership", organisation_id: "org-db", is_active: true },
    });

    const ctx = await getAuthContext();
    expect(ctx).toEqual({
      userId: "u-db",
      role: "leadership",
      organisationId: "org-db",
      isActive: true,
      roleStatus: "active",
      isPlatformAdmin: false,
      isOrgAdmin: false,
    });
    expect(setCachedAuthProfile).toHaveBeenCalledWith("u-db", {
      role: "leadership",
      organisation_id: "org-db",
      is_active: true,
      role_status: "active",
      is_platform_admin: false,
      is_org_admin: false,
    });
  });

  it("returns null when profile not found in DB", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u-no-profile" } },
    });
    mockProfileSingle.mockResolvedValue({ data: null });

    const ctx = await getAuthContext();
    expect(ctx).toBeNull();
  });
});
