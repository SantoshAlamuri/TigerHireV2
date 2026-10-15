import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("lucide-react", () => ({
  Plus: (props: any) => <span data-testid="plus-icon" />,
  X: (props: any) => <span data-testid="x-icon" />,
}));

import { TagInput } from "@/components/dashboard/TagInput";

describe("TagInput", () => {
  it("renders existing tags", () => {
    render(<TagInput value={["React", "Vue"]} onChange={vi.fn()} placeholder="Add skill" />);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue")).toBeInTheDocument();
  });

  it("adds tag on Enter key", () => {
    const onChange = vi.fn();
    render(<TagInput value={["React"]} onChange={onChange} placeholder="Add skill" />);
    const input = screen.getByPlaceholderText("Add skill");
    fireEvent.change(input, { target: { value: "TypeScript" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["React", "TypeScript"]);
  });

  it("adds tag on comma", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} placeholder="Add skill" />);
    const input = screen.getByPlaceholderText("Add skill");
    fireEvent.change(input, { target: { value: "Node.js" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onChange).toHaveBeenCalledWith(["Node.js"]);
  });

  it("removes tag on click", () => {
    const onChange = vi.fn();
    render(<TagInput value={["React", "Vue"]} onChange={onChange} placeholder="Add skill" />);
    fireEvent.click(screen.getByLabelText("Remove React"));
    expect(onChange).toHaveBeenCalledWith(["Vue"]);
  });

  it("does not add duplicate tags", () => {
    const onChange = vi.fn();
    render(<TagInput value={["React"]} onChange={onChange} placeholder="Add skill" />);
    const input = screen.getByPlaceholderText("Add skill");
    fireEvent.change(input, { target: { value: "React" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders placeholder when no tags", () => {
    render(<TagInput value={[]} onChange={vi.fn()} placeholder="Add a tag..." />);
    expect(screen.getByPlaceholderText("Add a tag...")).toBeInTheDocument();
  });
});
