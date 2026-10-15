import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";

describe("NotFound", () => {
  it("renders 404 page with correct content", () => {
    render(<NotFound />);

    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(
      screen.getByText(/The page you're looking for doesn't exist or has been moved/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go home/i })).toBeInTheDocument();
  });

  it("has a link to home page", () => {
    render(<NotFound />);
    const homeLink = screen.getByRole("link", { name: /go home/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
