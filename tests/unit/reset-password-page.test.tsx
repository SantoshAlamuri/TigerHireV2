import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockSetSession = vi.fn();
const mockGetSession = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  createSupabaseBrowserClient: () => ({
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
      getSession: () => mockGetSession(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: mockUnsubscribe } } }),
      updateUser: vi.fn(),
    },
  }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/TigerHireLogo", () => ({
  default: () => React.createElement("span", null, "logo"),
}));

const RECOVERY_HASH =
  "#access_token=at.123&expires_in=3600&refresh_token=rt.456&token_type=bearer&type=recovery";

async function renderPage() {
  const { default: ResetPasswordPage } = await import("@/app/(auth)/reset-password/page");
  return render(<ResetPasswordPage />);
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/reset-password");
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  it("adopts the session from the implicit-flow hash fragment and clears it", async () => {
    window.history.replaceState(null, "", `/reset-password${RECOVERY_HASH}`);
    mockSetSession.mockResolvedValue({
      data: { session: { user: { email: "hello@tigerhire.io" } } },
      error: null,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Set a new password")).toBeInTheDocument();
    });
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "at.123",
      refresh_token: "rt.456",
    });
    expect(screen.getByText("hello@tigerhire.io")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("shows the invalid-link state when the fragment carries a Supabase error", async () => {
    window.history.replaceState(
      null,
      "",
      "/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired link")).toBeInTheDocument();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("falls back to the stored session when there is no fragment", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: "stored@tigerhire.io" } } },
      error: null,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Set a new password")).toBeInTheDocument();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(screen.getByText("stored@tigerhire.io")).toBeInTheDocument();
  });

  it("shows the invalid-link state when neither fragment nor stored session exists", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Invalid or expired link")).toBeInTheDocument();
    });
  });

  it("treats a rejected fragment session as an invalid link", async () => {
    window.history.replaceState(null, "", `/reset-password${RECOVERY_HASH}`);
    mockSetSession.mockResolvedValue({ data: { session: null }, error: { message: "bad" } });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired link")).toBeInTheDocument();
    });
    expect(window.location.hash).toBe("");
  });
});
