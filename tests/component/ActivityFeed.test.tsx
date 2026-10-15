import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("lucide-react", () => ({
  Bot: () => <span data-testid="icon-bot" />,
  CreditCard: () => <span data-testid="icon-creditcard" />,
  FileText: () => <span data-testid="icon-filetext" />,
  Star: () => <span data-testid="icon-star" />,
  Unlock: () => <span data-testid="icon-unlock" />,
  UserCheck: () => <span data-testid="icon-usercheck" />,
  UserPlus: () => <span data-testid="icon-userplus" />,
}));

import ActivityFeed from "@/components/dashboard/ActivityFeed";
import type { ActivityEvent } from "@/types";

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "evt-1",
    type: "candidate_detected",
    title: "New Candidate",
    description: "A new candidate was detected",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("ActivityFeed", () => {
  it("renders nothing when events is empty array", () => {
    const { container } = render(<ActivityFeed events={[]} />);
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(0);
  });

  it("renders events with titles and descriptions", () => {
    const events = [
      makeEvent({ id: "1", title: "First Event", description: "First desc" }),
      makeEvent({ id: "2", title: "Second Event", description: "Second desc" }),
    ];
    render(<ActivityFeed events={events} />);
    expect(screen.getByText("First Event")).toBeInTheDocument();
    expect(screen.getByText("First desc")).toBeInTheDocument();
    expect(screen.getByText("Second Event")).toBeInTheDocument();
    expect(screen.getByText("Second desc")).toBeInTheDocument();
  });

  it("shows relative time formatting", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const events = [makeEvent({ id: "1", timestamp: twoHoursAgo })];
    render(<ActivityFeed events={events} />);
    expect(screen.getByText("2h ago")).toBeInTheDocument();
  });

  it("renders different icons for different event types", () => {
    const events = [
      makeEvent({ id: "1", type: "candidate_detected" }),
      makeEvent({ id: "2", type: "fitscore_ready" }),
      makeEvent({ id: "3", type: "job_posted" }),
    ];
    render(<ActivityFeed events={events} />);
    expect(screen.getByTestId("icon-userplus")).toBeInTheDocument();
    expect(screen.getByTestId("icon-star")).toBeInTheDocument();
    expect(screen.getByTestId("icon-filetext")).toBeInTheDocument();
  });
});
