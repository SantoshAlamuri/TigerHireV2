import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import EmptyState from "@/components/dashboard/EmptyState";

describe("EmptyState", () => {
  it("renders title", () => {
    render(
      <EmptyState
        icon={<span data-testid="icon">icon</span>}
        title="No Results"
        description="Nothing to show"
      />,
    );
    expect(screen.getByRole("heading", { name: "No Results" })).toBeInTheDocument();
  });

  it("renders an optional emphasis fragment", () => {
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="No"
        emphasis="Results"
        description="Nothing to show"
      />,
    );
    expect(screen.getByRole("heading", { name: "No Results" })).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="Empty"
        description="Try adjusting your filters"
      />,
    );
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
  });

  it("renders action link when action provided", () => {
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="No Jobs"
        description="Post your first job"
        action={{ label: "Post Job", href: "/jobs/new" }}
      />,
    );
    const link = screen.getByText("Post Job");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/jobs/new");
  });

  it("does not render action link when not provided", () => {
    render(<EmptyState icon={<span>icon</span>} title="Empty" description="No action" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(
      <EmptyState
        icon={<span data-testid="custom-icon">custom</span>}
        title="Empty"
        description="desc"
      />,
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});
