import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("lucide-react", () => ({
  X: () => React.createElement("span", { "data-testid": "icon-x" }),
  AlertTriangle: () => React.createElement("span", { "data-testid": "icon-alert" }),
}));

import { OverrideReasonModal } from "@/components/dashboard/OverrideReasonModal";

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  candidateName: "Jane Doe",
  fitScore: 42,
  action: "promote" as const,
};

describe("OverrideReasonModal", () => {
  it("renders nothing when isOpen=false", () => {
    const { container } = render(<OverrideReasonModal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders reason options when isOpen=true", () => {
    render(<OverrideReasonModal {...defaultProps} />);
    expect(screen.getByText("Override recommendation?")).toBeInTheDocument();
    expect(screen.getByText("Strong interview performance")).toBeInTheDocument();
    expect(screen.getByText("Better cultural fit than score suggests")).toBeInTheDocument();
    expect(screen.getByText("Trusted referral / recommendation")).toBeInTheDocument();
    expect(screen.getByText("Other reason")).toBeInTheDocument();
  });

  it("confirm button is disabled until a reason is selected", () => {
    render(<OverrideReasonModal {...defaultProps} />);
    const confirmBtn = screen.getByText("Confirm");
    expect(confirmBtn).toBeDisabled();

    fireEvent.click(screen.getByText("Strong interview performance"));
    expect(confirmBtn).not.toBeDisabled();
  });

  it("calls onConfirm with reason and notes", () => {
    const onConfirm = vi.fn();
    render(<OverrideReasonModal {...defaultProps} onConfirm={onConfirm} />);

    // Select "Other reason" to show the textarea
    fireEvent.click(screen.getByText("Other reason"));

    const textarea = screen.getByPlaceholderText("Share any additional context...");
    fireEvent.change(textarea, { target: { value: "Great references" } });

    fireEvent.click(screen.getByText("Confirm"));

    expect(onConfirm).toHaveBeenCalledWith("other", "Great references");
  });

  it("calls onConfirm with reason only (no notes) for non-other reasons", () => {
    const onConfirm = vi.fn();
    render(<OverrideReasonModal {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText("Strong interview performance"));
    fireEvent.click(screen.getByText("Confirm"));

    expect(onConfirm).toHaveBeenCalledWith("strong_interview", undefined);
  });

  it("calls onClose on cancel", () => {
    const onClose = vi.fn();
    render(<OverrideReasonModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
