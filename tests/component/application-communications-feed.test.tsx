import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ApplicationCommunicationsFeed } from "@/components/dashboard/ApplicationCommunicationsFeed";

const mockUseApiQuery = vi.fn();

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

describe("ApplicationCommunicationsFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces the API error message instead of a generic failure", () => {
    mockUseApiQuery.mockReturnValue({
      data: null,
      loading: false,
      error: "Forbidden",
    });

    render(<ApplicationCommunicationsFeed applicationId="app-1" enabled />);

    expect(screen.getByRole("alert")).toHaveTextContent("Forbidden");
    expect(screen.queryByText("Could not load activity.")).not.toBeInTheDocument();
  });
});
