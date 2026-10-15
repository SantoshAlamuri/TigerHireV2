import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it("renders nothing when consent already stored", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("all");
    render(<CookieConsentBanner />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog with Accept and Essential only when no consent", async () => {
    render(<CookieConsentBanner />);
    await waitFor(
      () => {
        expect(screen.getByRole("dialog", { name: /cookie consent/i })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole("button", { name: /essential only/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accept all/i })).toBeInTheDocument();
  }, 8000);

  it("has link to privacy policy when banner visible", async () => {
    render(<CookieConsentBanner />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /privacy policy/i })).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /privacy policy/i });
    expect(link).toHaveAttribute("href", "/privacy");
  });
});
