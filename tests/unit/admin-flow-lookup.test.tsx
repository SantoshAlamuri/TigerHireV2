import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FlowLookupSection } from "@/app/(dashboard)/admin/_home/FlowLookupSection";

const refetch = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: (url: string | null) => ({
    data:
      url === "/api/jobs"
        ? { jobs: [{ id: "job-1", title: "Engineer" }] }
        : url === "/api/candidates"
          ? { candidates: [{ id: "candidate-1", name: "Asha" }] }
          : null,
    loading: false,
    error: null,
    refetch,
  }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("admin screening lookup", () => {
  it("resolves names to IDs without requiring the operator to type IDs", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ whatsappOptIn: true, timeline: [] }) });
    vi.stubGlobal("fetch", request);
    render(<FlowLookupSection />);
    expect(screen.getByRole("button", { name: "Check flow status" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Find job" }));
    fireEvent.change(screen.getByLabelText(/Choose job/), { target: { value: "job-1" } });
    fireEvent.change(screen.getByLabelText("Candidate name"), { target: { value: "Asha" } });
    fireEvent.click(screen.getByRole("button", { name: "Find candidate" }));
    fireEvent.change(screen.getByLabelText(/Choose candidate/), {
      target: { value: "candidate-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check flow status" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/whatsapp/flow-status?jobId=job-1&candidateId=candidate-1",
        expect.objectContaining({ credentials: "include", signal: expect.any(AbortSignal) }),
      ),
    );
    await waitFor(() => expect(screen.getByText("Yes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Find job" }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByLabelText(/Choose job/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Check flow status" })).toBeDisabled();
    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
  });
});
