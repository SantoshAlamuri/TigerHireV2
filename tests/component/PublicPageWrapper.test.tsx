import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicPageWrapper } from "@/components/marketing/PublicLayout";

describe("PublicPageWrapper", () => {
  it("renders children", () => {
    render(
      <PublicPageWrapper>
        <p>Page content</p>
      </PublicPageWrapper>,
    );
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
