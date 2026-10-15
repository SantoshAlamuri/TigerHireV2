import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiKeyForm } from "@/components/settings/ApiKeyForm";

describe("ApiKeyForm", () => {
  it("toggles secret visibility", () => {
    render(
      <ApiKeyForm
        provider="sendgrid"
        fields={[{ key: "apiKey", label: "API Key", secret: true }]}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = screen.getByPlaceholderText("Enter API Key");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByLabelText("Toggle API Key visibility"));
    expect(input).toHaveAttribute("type", "text");
  });

  it("submits values to callback", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ApiKeyForm
        provider="sendgrid"
        fields={[{ key: "apiKey", label: "API Key", secret: true }]}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
      target: { value: "SG.1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save integration key" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ apiKey: "SG.1234567890" });
    });
  });
});
