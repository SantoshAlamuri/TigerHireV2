import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetById = vi.fn();
const mockAssertApplicationAccess = vi.fn();

vi.mock("@/lib/repositories/ApplicationRepository", () => ({
  ApplicationRepository: {
    getById: (...args: unknown[]) => mockGetById(...args),
  },
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    getAuthContext: vi.fn(),
    getTenantScopedClient: vi.fn().mockResolvedValue({
      assertApplicationAccess: (...args: unknown[]) => mockAssertApplicationAccess(...args),
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/screening/fetch-application-screening-display", () => ({
  fetchApplicationScreeningAnswersForDisplay: vi.fn().mockResolvedValue([]),
}));

describe("GET /api/applications/[id] tenant access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertApplicationAccess.mockResolvedValue(undefined);
    mockGetById.mockResolvedValue({
      id: "app-1",
      jobs: { organisation_id: "org-1", hiring_manager_id: null },
      candidates: { user_id: "other-user" },
    });
  });

  it("uses tenant assertApplicationAccess for recruiters", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "rec-1",
      role: "recruiter",
      organisationId: "org-1",
    });

    const { GET } = await import("@/app/api/applications/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/applications/app-1"), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockAssertApplicationAccess).toHaveBeenCalledWith("app-1");
  });
});
