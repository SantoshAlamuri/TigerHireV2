import type { ReactElement } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "@/components/dashboard/TopBar";
import ToastProvider from "@/components/ui/Toast";

function renderTopBar(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const mockLogout = vi.fn();

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "user-1", role: "recruiter" },
    logout: mockLogout,
  }),
}));

vi.mock("@/components/dashboard/NotificationDropdown", () => ({
  NotificationDropdown: () => <div data-testid="notification-dropdown" />,
}));

describe("TopBar", () => {
  it("renders notification and profile actions", () => {
    renderTopBar(<TopBar onMenuClick={() => {}} />);
    expect(screen.getByTestId("notification-dropdown")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /your profile/i })).toHaveAttribute("href", "/profile");
    const profileLink = screen
      .getAllByRole("link")
      .find((el) => el.getAttribute("href") === "/profile");
    expect(profileLink).toBeDefined();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("renders menu trigger button", () => {
    renderTopBar(<TopBar onMenuClick={() => {}} />);
    expect(screen.getByLabelText(/open menu/i)).toBeInTheDocument();
  });

  it("calls onMenuClick when menu button is clicked", async () => {
    const onMenuClick = vi.fn();
    renderTopBar(<TopBar onMenuClick={onMenuClick} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it("calls logout when sign out is clicked", () => {
    renderTopBar(<TopBar onMenuClick={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
