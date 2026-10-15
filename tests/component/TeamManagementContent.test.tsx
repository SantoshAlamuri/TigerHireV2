import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ToastProvider from "@/components/ui/Toast";

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      organisationName: "Acme Inc",
      role: "leadership",
    },
  }),
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: (path: string) => {
    if (path === "/api/organisations/members") {
      return {
        data: { members: [], pendingInvites: [] },
        loading: false,
        refetch: vi.fn(),
      };
    }
    return {
      data: { organisation: { name: "Acme Inc", company_plan: "growth" } },
      loading: false,
      refetch: vi.fn(),
    };
  },
  useApiMutation: () => ({
    mutate: vi.fn(),
    loading: false,
    error: null,
  }),
}));

describe("TeamManagementContent", () => {
  it("renders bulk upload action and opens modal", async () => {
    const { TeamManagementContent } = await import("@/components/dashboard/TeamManagementContent");
    render(
      <ToastProvider>
        <TeamManagementContent />
      </ToastProvider>,
    );

    expect(screen.getByRole("button", { name: "Bulk Upload CSV" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bulk Upload CSV" }));
    expect(screen.getByText("Bulk invite team members")).toBeInTheDocument();
    expect(screen.getByText("Download template CSV")).toBeInTheDocument();
  });
});
