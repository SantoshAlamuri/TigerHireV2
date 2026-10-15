import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    set: () => {},
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  getCachedAuthProfile: vi.fn().mockResolvedValue(null),
  setCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

describe("api-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("jsonError returns error JSON with correct status", async () => {
    const { jsonError } = await import("@/lib/api-helpers");
    const response = jsonError("Not Found", 404);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Not Found");
  }, 15000);

  it("jsonSuccess returns data with correct status", async () => {
    const { jsonSuccess } = await import("@/lib/api-helpers");
    const response = jsonSuccess({ foo: "bar" }, 201);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.foo).toBe("bar");
  });

  it("handleZodError returns 422 with messages", async () => {
    const { handleZodError } = await import("@/lib/api-helpers");
    const { z } = await import("zod");
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: "" });
    if (!result.success) {
      const response = handleZodError(result.error);
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error).toBeTruthy();
      expect(typeof body.error).toBe("string");
    }
  });

  it("requireAuth returns false for null context", async () => {
    const { requireAuth } = await import("@/lib/api-helpers");
    expect(requireAuth(null)).toBe(false);
  });

  it("requireAuth returns true for valid context", async () => {
    const { requireAuth } = await import("@/lib/api-helpers");
    const ctx = {
      userId: "u-1",
      role: "recruiter" as const,
      organisationId: "org-1",
    };
    expect(requireAuth(ctx)).toBe(true);
  });

  it("hasRole checks role membership", async () => {
    const { hasRole } = await import("@/lib/api-helpers");
    const ctx = {
      userId: "u-1",
      role: "recruiter" as const,
      organisationId: "org-1",
    };
    expect(hasRole(ctx, "recruiter", "leadership")).toBe(true);
    expect(hasRole(ctx, "super_admin")).toBe(false);
  });

  it("getAuthContext returns null when no user session", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    const ctx = await getAuthContext();
    expect(ctx).toBeNull();
  });
});
