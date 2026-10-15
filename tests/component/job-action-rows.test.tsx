import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ActionRows } from "@/app/(dashboard)/recruit/jobs/[id]/ActionRows";
import { capabilitiesFor } from "@/lib/v2/seat-capabilities";
afterEach(cleanup);
describe("job outstanding actions", () => {
  it("does not invent work when counts are unknown or zero", () => {
    for (const count of [null, 0]) {
      const view = render(
        <ActionRows
          jobId="j1"
          caps={capabilitiesFor("recruiter")}
          gate={{ loading: false, canScore: true }}
          newCount={count}
        />,
      );
      expect(screen.queryByText("Action required")).not.toBeInTheDocument();
      expect(screen.queryByText("Offers")).not.toBeInTheDocument();
      view.unmount();
    }
  });
  it("shows only confirmed review work and the scoring blocker", () => {
    render(
      <ActionRows
        jobId="j1"
        caps={capabilitiesFor("recruiter")}
        gate={{ loading: false, canScore: false }}
        newCount={3}
      />,
    );
    expect(screen.getByText("Applications to review")).toBeInTheDocument();
    expect(screen.getByText("Review candidate evaluation")).toBeInTheDocument();
    expect(screen.queryByText("Interview feedback")).not.toBeInTheDocument();
  });
});
