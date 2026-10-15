/**
 * Component tests: settings page UI components
 * File: tests/component/settings/IntegrationRow.test.tsx
 * Run: npx vitest run tests/component/settings/
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { IntegrationRow } from "@/components/settings/IntegrationRow";
import { ApiKeyForm } from "@/components/settings/ApiKeyForm";
import { StatusPill } from "@/components/settings/StatusPill";

// ─── StatusPill ───────────────────────────────────────────────────────────────

describe("StatusPill", () => {
  it("renders connected state with correct text and color class", () => {
    const { container } = render(<StatusPill status="connected" />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass(/green/i);
  });

  it("renders disconnected state", () => {
    render(<StatusPill status="disconnected" />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("renders error state", () => {
    render(<StatusPill status="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });
});

// ─── IntegrationRow ───────────────────────────────────────────────────────────

describe("IntegrationRow — connected state", () => {
  const defaultProps = {
    provider: "zoom" as const,
    name: "Zoom",
    description: "Create meetings · cloud recording webhook",
    logoInitial: "Z",
    logoColor: { bg: "#E6F1FB", text: "#0C447C" },
    authType: "api_key" as const,
    status: "connected" as const,
    maskedKey: "••••••xyz9",
    config: {},
    onSave: vi.fn(),
    onDisconnect: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it("renders the integration name and status", () => {
    render(<IntegrationRow {...defaultProps} />);
    expect(screen.getByText("Zoom")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows Configure and Disconnect buttons when connected", () => {
    render(<IntegrationRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /configure/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("expands the form when Configure is clicked", async () => {
    render(<IntegrationRow {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: /configure/i }));
    expect(screen.getByLabelText(/client id/i)).toBeInTheDocument();
  });

  it("collapses form when Configure is clicked again", async () => {
    render(<IntegrationRow {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /configure/i });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(screen.queryByLabelText(/client id/i)).not.toBeInTheDocument();
  });

  it("calls onDisconnect when Disconnect is clicked", async () => {
    render(<IntegrationRow {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(defaultProps.onDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe("IntegrationRow — disconnected state", () => {
  const props = {
    provider: "assemblyai" as const,
    name: "AssemblyAI",
    description: "Speaker labels · sentiment · PII redaction",
    logoInitial: "A",
    logoColor: { bg: "#FAEEDA", text: "#633806" },
    authType: "api_key" as const,
    status: "disconnected" as const,
    config: {},
    onSave: vi.fn(),
    onDisconnect: vi.fn(),
  };

  it("shows Connect button, not Configure", () => {
    render(<IntegrationRow {...props} />);
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /configure/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disconnect/i })).not.toBeInTheDocument();
  });
});

describe("IntegrationRow — error state", () => {
  const props = {
    provider: "sendgrid" as const,
    name: "SendGrid",
    description: "Transactional email",
    logoInitial: "S",
    logoColor: { bg: "#E6F1FB", text: "#0C447C" },
    authType: "api_key" as const,
    status: "error" as const,
    statusMessage: "API key was rejected by SendGrid.",
    config: {},
    onSave: vi.fn(),
    onDisconnect: vi.fn(),
  };

  it("auto-expands form when status is error", () => {
    render(<IntegrationRow {...props} />);
    // Form should be open by default in error state
    expect(screen.getByText(/API key was rejected/i)).toBeInTheDocument();
  });

  it("displays the status message from the provider", () => {
    render(<IntegrationRow {...props} />);
    expect(screen.getByText("API key was rejected by SendGrid.")).toBeInTheDocument();
  });
});

// ─── ApiKeyForm ───────────────────────────────────────────────────────────────

describe("ApiKeyForm", () => {
  const fields = [
    { key: "accountId", label: "Account ID" },
    { key: "clientSecret", label: "Client Secret", helpText: "Keep this private" },
  ];
  const onSave = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it("renders all fields", () => {
    render(<ApiKeyForm provider="zoom" fields={fields} onSave={onSave} />);
    expect(screen.getByLabelText("Account ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Client Secret")).toBeInTheDocument();
  });

  it("masks secret fields by default (type=password)", () => {
    render(<ApiKeyForm provider="zoom" fields={fields} onSave={onSave} />);
    const secretInput = screen.getByLabelText("Client Secret");
    expect(secretInput).toHaveAttribute("type", "password");
  });

  it("reveals secret field on Show click", async () => {
    render(<ApiKeyForm provider="zoom" fields={fields} onSave={onSave} />);
    const showBtns = screen.getAllByRole("button", { name: /show/i });
    await userEvent.click(showBtns[0]);
    const secretInput = screen.getByLabelText("Client Secret");
    expect(secretInput).toHaveAttribute("type", "text");
  });

  it("calls onSave with all field values", async () => {
    render(<ApiKeyForm provider="zoom" fields={fields} onSave={onSave} />);
    await userEvent.type(screen.getByLabelText("Account ID"), "acct_test123");
    await userEvent.type(screen.getByLabelText("Client Secret"), "secret_xyz");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      accountId: "acct_test123",
      clientSecret: "secret_xyz",
    });
  });

  it("does not call onSave if a required field is empty", async () => {
    render(<ApiKeyForm provider="zoom" fields={fields} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it("shows saving state while onSave is pending", async () => {
    onSave.mockImplementation(() => new Promise((r) => setTimeout(r, 200)));
    render(<ApiKeyForm provider="zoom" fields={fields} onSave={onSave} />);
    await userEvent.type(screen.getByLabelText("Account ID"), "acct_test");
    await userEvent.type(screen.getByLabelText("Client Secret"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled());
  });
});
