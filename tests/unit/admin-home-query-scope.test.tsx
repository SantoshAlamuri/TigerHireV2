import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAdminHome } from "@/app/(dashboard)/admin/_home/useAdminHome";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-api", () => ({ useApiQuery: query }));

beforeEach(() => {
  query.mockReset();
  query.mockImplementation((url: string | null) => ({
    data: url === "/api/platform/access" ? { is_platform_admin: true } : null,
    loading: Boolean(url),
    error: null,
  }));
});

function requestedUrls() {
  return query.mock.calls.map(([url]) => url).filter(Boolean);
}

describe("admin overview request scope", () => {
  it("does not request reports or diagnostics before their section is opened", () => {
    const { rerender } = renderHook(({ section }) => useAdminHome(section), {
      initialProps: { section: "Overview" },
    });
    expect(requestedUrls()).toEqual([
      "/api/platform/access",
      "/api/admin/onboarding-requests",
      "/api/admin/billing",
      "/api/admin/whatsapp-sessions",
    ]);
    query.mockClear();
    rerender({ section: "System health" });
    expect(requestedUrls()).toEqual([
      "/api/platform/access",
      "/api/admin/agents",
      "/api/admin/fitscore-observability",
    ]);
    query.mockClear();
    rerender({ section: "Reports" });
    expect(requestedUrls()).toEqual([
      "/api/platform/access",
      "/api/admin/analytics",
      "/api/usage/summary",
    ]);
  });

  it("does not report zero operational issues when requests fail or are pending", () => {
    query.mockImplementation((url: string | null) => ({
      data: url === "/api/platform/access" ? { is_platform_admin: true } : null,
      loading: false,
      error: url === "/api/admin/billing" ? "Unavailable" : null,
    }));
    const { result } = renderHook(() => useAdminHome());
    expect(result.current.attentionCards.every((card) => card.value === null)).toBe(true);
    expect(result.current.attentionCards.find((card) => card.key === "billing")?.description).toBe(
      "Could not load billing",
    );
  });
});
