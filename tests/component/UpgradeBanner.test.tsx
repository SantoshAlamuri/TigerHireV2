import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("lucide-react", () => ({
  Check: (props: any) => <span data-testid="check-icon" />,
}));

import UpgradeBanner from "@/components/dashboard/UpgradeBanner";

describe("UpgradeBanner", () => {
  const defaultProps = {
    currentTier: "Free",
    targetTier: "Pro",
    features: ["Unlimited searches", "Priority support", "API access"],
  };

  it("renders upgrade heading", () => {
    render(<UpgradeBanner {...defaultProps} />);
    expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
  });

  it("renders feature list items", () => {
    render(<UpgradeBanner {...defaultProps} />);
    expect(screen.getByText("Unlimited searches")).toBeInTheDocument();
    expect(screen.getByText("Priority support")).toBeInTheDocument();
    expect(screen.getByText("API access")).toBeInTheDocument();
  });

  it("renders upgrade button/link", () => {
    render(<UpgradeBanner {...defaultProps} />);
    const link = screen.getByText("Upgrade now");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/pricing");
  });
});
