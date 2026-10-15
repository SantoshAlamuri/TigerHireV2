import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OAuthConnectButton } from "@/components/settings/OAuthConnectButton";

describe("OAuthConnectButton", () => {
  it("uses default oauth path", () => {
    render(<OAuthConnectButton provider="google_calendar" />);
    const link = screen.getByRole("link", { name: /connect with oauth/i });
    const href = link.getAttribute("href");
    expect(href).toBeTruthy();
    const url = new URL(href as string, "http://localhost");
    expect(url.pathname).toBe("/api/settings/integrations/oauth/google_calendar");
    expect(url.searchParams.get("next")).toBe("/");
  });

  it("uses custom oauth path base", () => {
    render(
      <OAuthConnectButton provider="outlook" oauthPathBase="/api/settings/me/integrations/oauth" />,
    );
    const link = screen.getByRole("link", { name: /connect with oauth/i });
    const href = link.getAttribute("href");
    expect(href).toBeTruthy();
    const url = new URL(href as string, "http://localhost");
    expect(url.pathname).toBe("/api/settings/me/integrations/oauth/outlook");
    expect(url.searchParams.get("next")).toBe("/");
  });
});
