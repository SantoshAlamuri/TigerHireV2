import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "@/components/settings/StatusPill";

describe("StatusPill", () => {
  it("renders connected variant", () => {
    render(<StatusPill status="connected" />);
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("renders disconnected variant", () => {
    render(<StatusPill status="disconnected" />);
    expect(screen.getByText("disconnected")).toBeInTheDocument();
  });

  it("renders error variant", () => {
    render(<StatusPill status="error" />);
    expect(screen.getByText("error")).toBeInTheDocument();
  });
});
