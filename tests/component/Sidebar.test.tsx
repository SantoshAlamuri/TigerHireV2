import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let authState = {
  user: null as {
    id: string;
    email: string;
    name: string;
    role: "agency";
  } | null,
  loading: true,
  logout: vi.fn(),
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/agency",
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/TigerHireLogo", () => ({
  default: ({ href }: { href: string }) => <a href={href}>TigerHire</a>,
}));

describe("Sidebar", () => {
  it("keeps hook order stable when auth changes from loading to ready", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { Sidebar } = await import("@/components/dashboard/Sidebar");

    const { rerender } = render(<Sidebar open={false} onClose={() => {}} />);

    expect(screen.getByText("TigerHire")).toBeInTheDocument();

    authState = {
      ...authState,
      loading: false,
      user: {
        id: "user-1",
        email: "fatima@example.com",
        name: "Fatima Sheikh",
        role: "agency",
      },
    };

    expect(() => rerender(<Sidebar open={false} onClose={() => {}} />)).not.toThrow();

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/agency");

    vi.unstubAllGlobals();
  });
});
