import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("lucide-react", () => ({
  Lock: () => React.createElement("span", { "data-testid": "icon-lock" }),
  X: () => React.createElement("span", { "data-testid": "icon-x" }),
}));

import OutOfCreditsModal from "@/components/dashboard/OutOfCreditsModal";

describe("OutOfCreditsModal", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(<OutOfCreditsModal open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders modal content when open=true", () => {
    render(<OutOfCreditsModal open={true} onClose={() => {}} />);
    expect(screen.getByText("Out of credits")).toBeInTheDocument();
  });

  it("shows upgrade button", () => {
    render(<OutOfCreditsModal open={true} onClose={() => {}} />);
    expect(screen.getByText("Upgrade plan")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<OutOfCreditsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Close text button clicked", () => {
    const onClose = vi.fn();
    render(<OutOfCreditsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows monthly limit message when monthlyLimit provided", () => {
    render(<OutOfCreditsModal open={true} onClose={() => {}} monthlyLimit={50} />);
    expect(screen.getByText(/You've used all 50 profile unlock credits/)).toBeInTheDocument();
  });
});
