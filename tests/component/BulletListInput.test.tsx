import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("lucide-react", () => ({
  Plus: (props: any) => <span data-testid="plus-icon" />,
  X: (props: any) => <span data-testid="x-icon" />,
}));

import { BulletListInput } from "@/components/dashboard/BulletListInput";

describe("BulletListInput", () => {
  it("renders existing items", () => {
    render(
      <BulletListInput
        value={["First item", "Second item"]}
        onChange={vi.fn()}
        placeholder="Add item"
      />,
    );
    expect(screen.getByDisplayValue("First item")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Second item")).toBeInTheDocument();
  });

  it("adds new item", () => {
    const onChange = vi.fn();
    render(<BulletListInput value={["Existing"]} onChange={onChange} placeholder="Add item" />);
    const input = screen.getByPlaceholderText("Add item");
    fireEvent.change(input, { target: { value: "New item" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["Existing", "New item"]);
  });

  it("removes item", () => {
    const onChange = vi.fn();
    render(
      <BulletListInput value={["Item A", "Item B"]} onChange={onChange} placeholder="Add item" />,
    );
    fireEvent.click(screen.getByLabelText("Remove item 1"));
    expect(onChange).toHaveBeenCalledWith(["Item B"]);
  });

  it("edits existing item", () => {
    const onChange = vi.fn();
    render(
      <BulletListInput value={["Original text"]} onChange={onChange} placeholder="Add item" />,
    );
    const itemInput = screen.getByDisplayValue("Original text");
    fireEvent.change(itemInput, { target: { value: "Updated text" } });
    expect(onChange).toHaveBeenCalledWith(["Updated text"]);
  });
});
