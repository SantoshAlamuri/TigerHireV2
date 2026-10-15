import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JdBaseApprovalWizard } from "@/components/fitscore/jd-base/JdBaseApprovalWizard";
import { DEFAULT_FIT_THRESHOLDS, DEFAULT_SCORE_FLOOR } from "@/lib/fitscore/hybrid/constants";

const mockFetch = vi.fn();

function renderWizard(extraProps: Partial<Parameters<typeof JdBaseApprovalWizard>[0]> = {}) {
  return render(
    <JdBaseApprovalWizard
      jobId="00000000-0000-4000-8000-000000000101"
      jobTitle="Backend Engineer"
      jobDescriptionText="Backend Engineer\nNode.js, PostgreSQL, REST APIs, 4+ years experience."
      initialWeights={{ backend_depth: 50, system_design: 30, communication: 20 }}
      initialThresholds={DEFAULT_FIT_THRESHOLDS}
      initialScoreFloor={DEFAULT_SCORE_FLOOR}
      initialContext=""
      initialIdealProfile={{
        summary: "Ideal backend hire with production ownership.",
        must_haves: ["Node.js", "System design", "APIs"],
        nice_to_haves: ["AWS"],
        years_range: "4-8 years",
        benchmarks: {},
      }}
      {...extraProps}
    />,
  );
}

function lastPutPayload(): Record<string, unknown> {
  const putCall = mockFetch.mock.calls.findLast(
    (c) => c[0] === "/api/fitscore/jd-base" && (c[1] as RequestInit)?.method === "PUT",
  );
  expect(putCall).toBeTruthy();
  return JSON.parse((putCall![1] as RequestInit).body as string);
}

describe("JdBaseApprovalWizard structured JD handling", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initialises need-to-haves from initialStructuredJd instead of wiping them", () => {
    renderWizard({
      initialStructuredJd: {
        must_haves: ["Node.js"],
        need_to_haves: ["Kafka experience"],
        nice_to_haves: [],
        responsibilities: ["Own service reliability"],
        role_basics: { title: "Old Title", location: "Remote" },
      },
    });
    expect(screen.getByText("Kafka experience")).toBeInTheDocument();
  });

  it("saves the latest need-to-have edits (no stale closure) and preserves responsibilities/role_basics", async () => {
    renderWizard({
      initialStructuredJd: {
        need_to_haves: ["Kafka experience"],
        responsibilities: ["Own service reliability"],
        role_basics: { title: "Old Title", location: "Remote" },
      },
    });

    // Last action before save: add a need-to-have (regression for stale closure)
    fireEvent.change(screen.getByPlaceholderText("Add a need-to-have"), {
      target: { value: "GraphQL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Add need-to-have" }));
    expect(screen.getByText("GraphQL")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save ICP & continue/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const payload = lastPutPayload();
    const structuredJd = payload.structuredJd as {
      role_basics: Record<string, unknown>;
      responsibilities: string[];
      must_haves: string[];
      need_to_haves: string[];
      nice_to_haves: string[];
    };
    expect(structuredJd.need_to_haves).toEqual(["Kafka experience", "GraphQL"]);
    // Fields the wizard does not edit are preserved, with title overridden.
    expect(structuredJd.responsibilities).toEqual(["Own service reliability"]);
    expect(structuredJd.role_basics).toEqual({ location: "Remote", title: "Backend Engineer" });
    expect(structuredJd.must_haves).toEqual(["Node.js", "System design", "APIs"]);
    expect(structuredJd.nice_to_haves).toEqual(["AWS"]);
  });

  it("saves latest must-have edits as the last action before save", async () => {
    renderWizard();

    fireEvent.change(screen.getByPlaceholderText("Add a must-have requirement"), {
      target: { value: "Kubernetes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Add requirement" }));

    fireEvent.click(screen.getByRole("button", { name: /Save ICP & continue/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const payload = lastPutPayload();
    const structuredJd = payload.structuredJd as { must_haves: string[] };
    expect(structuredJd.must_haves).toEqual(["Node.js", "System design", "APIs", "Kubernetes"]);
    const profile = payload.idealCandidateProfile as { must_haves: string[] };
    expect(profile.must_haves).toEqual(["Node.js", "System design", "APIs", "Kubernetes"]);
  });

  it("defaults structured JD fields when no initialStructuredJd is provided", async () => {
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: /Save ICP & continue/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const payload = lastPutPayload();
    const structuredJd = payload.structuredJd as {
      role_basics: Record<string, unknown>;
      responsibilities: string[];
      need_to_haves: string[];
    };
    expect(structuredJd.need_to_haves).toEqual([]);
    expect(structuredJd.responsibilities).toEqual([]);
    expect(structuredJd.role_basics).toEqual({ title: "Backend Engineer" });
  });
});
