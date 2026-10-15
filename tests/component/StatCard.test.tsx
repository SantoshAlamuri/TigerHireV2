import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatCard from "@/components/dashboard/StatCard";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Total" value={42} />);
    expect(screen.getByText(/total/i)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<StatCard label="Status" value="Active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders trend when provided", () => {
    render(<StatCard label="Growth" value={10} trend={{ value: "+5%", positive: true }} />);
    expect(screen.getByText("+5%")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<StatCard label="Users" value={100} icon={<span data-testid="icon">I</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});
