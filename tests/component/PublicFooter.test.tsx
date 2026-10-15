import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicFooter } from "@/components/marketing/PublicLayout";

describe("PublicFooter", () => {
  it("renders TigerHire branding", () => {
    render(<PublicFooter />);
    const link = screen.getByRole("link", { name: /tigerhire/i });
    expect(link).toBeInTheDocument();
  });

  it("renders product column links", () => {
    render(<PublicFooter />);
    expect(screen.getByRole("link", { name: /how it works/i })).toHaveAttribute("href", "/product");
    expect(screen.getByRole("link", { name: /talent intelligence/i })).toHaveAttribute(
      "href",
      "/product#talent-intelligence",
    );
  });

  it("renders privacy and terms links", () => {
    render(<PublicFooter />);
    expect(screen.getByRole("link", { name: /privacy/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /terms/i })).toBeInTheDocument();
  });
});
