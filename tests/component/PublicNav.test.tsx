import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicNav } from "@/components/marketing/PublicLayout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("PublicNav", () => {
  it("renders TigerHire branding", () => {
    render(<PublicNav />);
    const link = screen.getByRole("link", { name: /tigerhire/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders product and segment links", () => {
    render(<PublicNav />);
    expect(screen.getByRole("link", { name: /^product$/i })).toHaveAttribute("href", "/product");
    expect(screen.getByRole("link", { name: /^solutions$/i })).toHaveAttribute(
      "href",
      "/companies",
    );
    expect(screen.getByRole("link", { name: /^jobs$/i })).toHaveAttribute("href", "/jobs");
  });

  it("renders auth and primary CTA links", () => {
    render(<PublicNav />);
    expect(screen.getAllByRole("link", { name: /^log in$/i })[0]).toHaveAttribute("href", "/login");
    expect(screen.getAllByRole("link", { name: /^sign up$/i })[0]).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.getAllByRole("link", { name: /book demo/i })[0]).toHaveAttribute(
      "href",
      "/contact",
    );
  });
});
