import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/components/dashboard/ProgressBarFill", () => ({
  ProgressBarFill: ({ value, fillClassName }: { value: number; fillClassName?: string }) => (
    <div data-testid="progress-bar" data-value={value} data-fill={fillClassName} />
  ),
}));

import { DimensionBar } from "@/components/dashboard/DimensionBar";

describe("DimensionBar", () => {
  it("renders label text", () => {
    render(<DimensionBar label="Skills Match" value={75} />);
    expect(screen.getByText("Skills Match")).toBeInTheDocument();
  });

  it("renders score value", () => {
    render(<DimensionBar label="Experience" value={85} />);
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("bar reflects score via ProgressBarFill", () => {
    render(<DimensionBar label="Culture Fit" value={60} />);
    const bar = screen.getByTestId("progress-bar");
    expect(bar).toHaveAttribute("data-value", "60");
  });

  it("handles score of 0", () => {
    render(<DimensionBar label="Salary" value={0} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    const bar = screen.getByTestId("progress-bar");
    expect(bar).toHaveAttribute("data-value", "0");
  });

  it("handles score of 100", () => {
    render(<DimensionBar label="Perfect" value={100} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    const bar = screen.getByTestId("progress-bar");
    expect(bar).toHaveAttribute("data-value", "100");
  });
});
