import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CompactMoatBadges,
  PipelineMoatBadges,
  VerdictMoatPanel,
} from "@/components/dashboard/CandidateMoatSignals";

describe("PipelineMoatBadges", () => {
  it("renders nothing when no vouches or referrer", () => {
    const { container } = render(<PipelineMoatBadges />);
    expect(container.firstChild).toBeNull();
  });

  it("shows vouch count and referrer with tooltip title", () => {
    render(
      <PipelineMoatBadges
        vouches={[{ voucher_name: "Priya Sharma", relationship_type: "Manager" }]}
        referrerName="Rajesh Kumar"
      />,
    );
    expect(screen.getByText("1 vouch")).toBeInTheDocument();
    expect(screen.getByText(/Referred by Rajesh Kumar/)).toBeInTheDocument();
    expect(screen.getByText("1 vouch").closest("span")).toHaveAttribute(
      "title",
      "Vouched by Priya Sharma (Manager)",
    );
  });
});

describe("CompactMoatBadges", () => {
  it("renders nothing when no signals", () => {
    const { container } = render(<CompactMoatBadges />);
    expect(container.firstChild).toBeNull();
  });

  it("shows reliability badge for MEDIUM ghost label only", () => {
    render(<CompactMoatBadges ghostLabel="MEDIUM" />);
    expect(screen.getByText("Reliability: MEDIUM")).toBeInTheDocument();
  });

  it("hides LOW reliability", () => {
    const { container } = render(<CompactMoatBadges ghostLabel="LOW" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("VerdictMoatPanel", () => {
  it("renders all three signal types when present", () => {
    render(
      <VerdictMoatPanel
        vouches={[{ voucher_name: "Anita Verma", relationship_type: "Peer" }]}
        referrerName="Nidhi Rao"
        ghostLabel="HIGH"
        authenticitySignal="likely_ai_generated"
        authenticityReasons={["Template phrasing"]}
      />,
    );
    expect(screen.getByText(/Trust & referral signals/)).toBeInTheDocument();
    expect(screen.getByText("1 vouch")).toBeInTheDocument();
    expect(screen.getByText("Anita Verma")).toBeInTheDocument();
    expect(screen.getByText("Referral")).toBeInTheDocument();
    expect(screen.getByText(/Direct referral from Nidhi Rao/)).toBeInTheDocument();
    expect(screen.getByText("Trust review")).toBeInTheDocument();
    expect(screen.getByText("Authenticity flag")).toBeInTheDocument();
  });
});
