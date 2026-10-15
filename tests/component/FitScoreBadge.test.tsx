import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FitRing from "@/components/ui/FitRing";

describe("FitRing", () => {
  it("renders score text", () => {
    render(<FitRing score={75} />);
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("fit")).toBeInTheDocument();
  });

  it("clamps score above 100", () => {
    render(<FitRing score={140} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("hides label when showLabel is false", () => {
    render(<FitRing score={60} showLabel={false} />);
    expect(screen.queryByText("fit")).not.toBeInTheDocument();
  });
});
