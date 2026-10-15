import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NotificationDropdown } from "@/components/dashboard/NotificationDropdown";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notifications: [], unreadCount: 0 }),
    }),
  );
});

describe("NotificationDropdown", () => {
  it("renders notifications button", () => {
    render(<NotificationDropdown />);
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  });

  it("opens dropdown on button click", async () => {
    render(<NotificationDropdown />);
    const btn = screen.getByRole("button", { name: /notifications/i });
    btn.click();
    await waitFor(() => {
      expect(screen.getByText(/view all/i)).toBeInTheDocument();
    });
  });
});
