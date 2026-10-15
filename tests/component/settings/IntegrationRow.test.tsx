import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntegrationRow } from "@/components/settings/IntegrationRow";

const baseProps = {
  provider: "sendgrid" as const,
  name: "SendGrid",
  description: "Email provider",
  logoInitial: "S",
  logoColor: { bg: "bg-slate-500/20", text: "text-slate-300" },
  authType: "api_key" as const,
  onSave: vi.fn().mockResolvedValue(undefined),
  onDisconnect: vi.fn().mockResolvedValue(undefined),
};

describe("IntegrationRow", () => {
  it("renders connected state", () => {
    render(<IntegrationRow {...baseProps} status="connected" />);
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("renders disconnected state", () => {
    render(<IntegrationRow {...baseProps} status="disconnected" />);
    expect(screen.getByText("disconnected")).toBeInTheDocument();
  });

  it("renders error state with message", () => {
    render(<IntegrationRow {...baseProps} status="error" statusMessage="Invalid key" />);
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("Invalid key")).toBeInTheDocument();
  });
});
