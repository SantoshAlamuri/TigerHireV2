import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("lucide-react", () => ({
  ChevronDown: (props: any) => <span data-testid="chevron-down" />,
  ChevronRight: (props: any) => <span data-testid="chevron-right" />,
}));

import { CollapsibleSection } from "@/components/dashboard/CollapsibleSection";

describe("CollapsibleSection", () => {
  it("renders title", () => {
    render(
      <CollapsibleSection title="My Section">
        <p>Content</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("My Section")).toBeInTheDocument();
  });

  it("content visible when defaultOpen=true", () => {
    render(
      <CollapsibleSection title="Open Section" defaultOpen={true}>
        <p>Visible Content</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("Visible Content")).toBeInTheDocument();
  });

  it("content hidden when defaultOpen=false", () => {
    render(
      <CollapsibleSection title="Closed Section" defaultOpen={false}>
        <p>Hidden Content</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByText("Hidden Content")).not.toBeInTheDocument();
  });

  it("clicking toggles visibility", () => {
    render(
      <CollapsibleSection title="Toggle Section" defaultOpen={false}>
        <p>Toggle Content</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByText("Toggle Content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Toggle Content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Toggle Content")).not.toBeInTheDocument();
  });
});
