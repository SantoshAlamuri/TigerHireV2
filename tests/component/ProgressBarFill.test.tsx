import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { ProgressBarFill } from "@/components/dashboard/ProgressBarFill";

describe("ProgressBarFill", () => {
  it("renders with correct width style via CSS variable", () => {
    const { container } = render(<ProgressBarFill value={65} />);
    const track = container.firstElementChild as HTMLElement;
    expect(track.style.getPropertyValue("--progress-pct")).toBe("65%");
  });

  it("handles 0 percent", () => {
    const { container } = render(<ProgressBarFill value={0} />);
    const track = container.firstElementChild as HTMLElement;
    expect(track.style.getPropertyValue("--progress-pct")).toBe("0%");
  });

  it("handles 100 percent", () => {
    const { container } = render(<ProgressBarFill value={100} />);
    const track = container.firstElementChild as HTMLElement;
    expect(track.style.getPropertyValue("--progress-pct")).toBe("100%");
  });

  it("applies custom fill class", () => {
    const { container } = render(<ProgressBarFill value={50} fillClassName="bg-blue-500" />);
    const fill = container.querySelector(".progress-bar-fill");
    expect(fill).toBeInTheDocument();
    expect(fill?.classList.contains("bg-blue-500")).toBe(true);
  });
});
