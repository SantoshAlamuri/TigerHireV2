import { describe, expect, it, vi } from "vitest";

const getConnection = vi.fn();

vi.mock("@/lib/repositories/integration-connections.repository", () => ({
  getConnection,
}));

describe("resolve integration", () => {
  it("uses user calendar connection before org fallback", async () => {
    getConnection
      .mockResolvedValueOnce({ id: "user-row", status: "connected" })
      .mockResolvedValueOnce({ id: "org-row", status: "connected" });

    const { resolveCalendarConnection } = await import("@/lib/settings/resolve-integration");
    const result = await resolveCalendarConnection({} as never, {
      organisationId: "org-1",
      userId: "user-1",
      provider: "google_calendar",
    });

    expect(result?.id).toBe("user-row");
    expect(getConnection).toHaveBeenCalledTimes(1);
  });

  it("falls back to org calendar connection", async () => {
    getConnection
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "org-row", status: "connected" });

    const { resolveCalendarConnection } = await import("@/lib/settings/resolve-integration");
    const result = await resolveCalendarConnection({} as never, {
      organisationId: "org-1",
      userId: "user-1",
      provider: "outlook",
    });

    expect(result?.id).toBe("org-row");
  });
});
