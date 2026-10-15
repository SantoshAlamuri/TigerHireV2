import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("@/app/(auth)/login/LoginClient", () => ({
  default: () => <div data-testid="login-client">login-client</div>,
}));

describe("LoginPage", () => {
  it("renders the login client on the server without a fallback shell", async () => {
    const { default: LoginPage } = await import("@/app/(auth)/login/page");

    const html = renderToString(<LoginPage />);

    expect(html).toContain("login-client");
  });

  it("renders the login client in the browser", async () => {
    const { default: LoginPage } = await import("@/app/(auth)/login/page");

    render(<LoginPage />);

    expect(screen.getByTestId("login-client")).toBeInTheDocument();
  });
});
