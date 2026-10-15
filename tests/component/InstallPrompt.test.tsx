import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

vi.mock("lucide-react", () => ({
  Download: () => React.createElement("span", { "data-testid": "icon-download" }),
  X: () => React.createElement("span", { "data-testid": "icon-x" }),
}));

import { InstallPrompt } from "@/components/dashboard/InstallPrompt";

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
  writable: true,
});

beforeEach(() => {
  sessionStorageMock.clear();
  vi.clearAllMocks();
});

describe("InstallPrompt", () => {
  it("renders nothing initially (no beforeinstallprompt event)", () => {
    const { container } = render(<InstallPrompt />);
    expect(container.innerHTML).toBe("");
  });

  it("renders install button after beforeinstallprompt event", () => {
    render(<InstallPrompt />);

    // Simulate the browser firing a beforeinstallprompt event
    act(() => {
      const event = new Event("beforeinstallprompt", {
        bubbles: true,
        cancelable: true,
      });
      Object.assign(event, {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });

    expect(screen.getByText("Install TigerHire")).toBeInTheDocument();
    expect(screen.getByText("Install")).toBeInTheDocument();
  });

  it("hides after dismiss", () => {
    const { container } = render(<InstallPrompt />);

    // Fire beforeinstallprompt
    act(() => {
      const event = new Event("beforeinstallprompt", {
        bubbles: true,
        cancelable: true,
      });
      Object.assign(event, {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });

    expect(screen.getByText("Install TigerHire")).toBeInTheDocument();

    // Click dismiss
    fireEvent.click(screen.getByLabelText("Dismiss install prompt"));

    expect(container.innerHTML).toBe("");
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith("pwa-install-dismissed", "1");
  });
});
