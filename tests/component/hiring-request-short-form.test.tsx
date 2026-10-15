import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
const { mutate, push } = vi.hoisted(() => ({ mutate: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/dashboard/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ data: { templates: [] } }),
  useOptimisticMutation: () => ({ mutate, loading: false, error: null }),
  invalidateQueries: vi.fn(),
}));
import NewHiringRequestPage from "@/app/(dashboard)/company/hiring-requests/new/page";

beforeEach(() => {
  cleanup();
  mutate.mockReset();
  push.mockReset();
});
describe("short hiring request", () => {
  it("shows location and budget first and preserves edits when moving back", () => {
    render(<NewHiringRequestPage />);
    fireEvent.change(screen.getByLabelText(/Role title/), { target: { value: "Engineer" } });
    fireEvent.change(screen.getByLabelText("City / site"), { target: { value: "Pune" } });
    expect(screen.getByLabelText("Budget min")).toBeInTheDocument();
    expect(screen.queryByLabelText("Must-have requirements")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Responsibilities and approval" })).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Must-have requirements"), {
      target: { value: "TypeScript" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText(/Role title/)).toHaveValue("Engineer");
    expect(screen.getByLabelText("City / site")).toHaveValue("Pune");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Must-have requirements")).toHaveValue("TypeScript");
  });
  it("sends both steps together and keeps input after a failed save", async () => {
    mutate.mockResolvedValue(null);
    render(<NewHiringRequestPage />);
    fireEvent.change(screen.getByLabelText(/Role title/), { target: { value: "Engineer" } });
    fireEvent.change(screen.getByLabelText("Budget min"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Must-have requirements"), {
      target: { value: "TypeScript" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Engineer",
          budgetCtcMin: 1000000,
          mustHaves: "TypeScript",
          saveDraft: false,
        }),
      ),
    );
    expect(screen.getByLabelText("Must-have requirements")).toHaveValue("TypeScript");
    expect(push).not.toHaveBeenCalled();
  });
  it("can save a private draft before completing the next step", async () => {
    mutate.mockResolvedValue({ id: "r1" });
    render(<NewHiringRequestPage />);
    fireEvent.change(screen.getByLabelText(/Role title/), { target: { value: "Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Engineer", saveDraft: true }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/company/hiring-requests");
  });
});
