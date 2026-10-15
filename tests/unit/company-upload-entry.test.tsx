// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CompanyBulkUploadModal } from "@/app/(dashboard)/recruit/candidates/components/CompanyBulkUploadModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("job-scoped company upload", () => {
  it("keeps successful batches and retries only unsaved files with the same key", async () => {
    const files = Array.from(
      { length: 12 },
      (_, i) => new File(["resume"], `resume-${i}.pdf`, { type: "application/pdf" }),
    );
    const success = (selected: File[]) => ({
      ok: true,
      json: async () => ({
        results: selected.map((file) => ({
          fileName: file.name,
          success: true,
          parsingPending: false,
        })),
        summary: { scoringQueued: 0 },
      }),
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(success(files.slice(0, 10)))
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce(success(files.slice(10)));
    vi.stubGlobal("fetch", fetch);
    render(
      <CompanyBulkUploadModal
        open
        onClose={vi.fn()}
        initialJobId="job-1"
        jobs={[{ id: "job-1", title: "Engineer", status: "open" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue to resumes" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Upload resume file(s) (PDF or Word)"), {
      target: { files },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload 12 profiles" }));
    await screen.findByText("Connection lost");
    expect(screen.getByText("10 succeeded, 0 failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry remaining files" }));
    await waitFor(() => expect(screen.getByText("12 succeeded, 0 failed")).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][1].headers["Idempotency-Key"]).toBe(
      fetch.mock.calls[1][1].headers["Idempotency-Key"],
    );
    expect(fetch.mock.calls[2][1].body.getAll("files")).toHaveLength(2);
  });

  it("retries one failed file with its required email and a new payload key", async () => {
    const files = [new File(["resume"], "failed.pdf"), new File(["resume"], "saved.pdf")];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { fileName: "failed.pdf", success: false, error: "Temporary failure" },
            { fileName: "saved.pdf", success: true, parsingPending: false },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ fileName: "failed.pdf", success: true, parsingPending: false }],
        }),
      });
    vi.stubGlobal("fetch", fetch);
    render(
      <CompanyBulkUploadModal
        open
        onClose={vi.fn()}
        initialJobId="job-1"
        jobs={[{ id: "job-1", title: "Engineer", status: "open" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue to resumes" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Upload resume file(s) (PDF or Word)"), {
      target: { files },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload 2 profiles" }));
    fireEvent.change(await screen.findByLabelText("Email for failed.pdf"), {
      target: { value: "candidate@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry remaining files" }));
    await screen.findByText("2 succeeded, 0 failed");
    expect(fetch.mock.calls[1][1].body.getAll("files").map((file: File) => file.name)).toEqual([
      "failed.pdf",
    ]);
    expect(fetch.mock.calls[1][1].body.get("email")).toBe("candidate@example.com");
    expect(fetch.mock.calls[1][1].headers["Idempotency-Key"]).not.toBe(
      fetch.mock.calls[0][1].headers["Idempotency-Key"],
    );
  });

  it("keeps distinct emails for singleton failures from separate batches", async () => {
    const files = Array.from(
      { length: 20 },
      (_, index) => new File(["resume"], `person-${index}.pdf`),
    );
    const fetch = vi.fn(async (_url: string, options: { body: FormData }) => {
      const sent = options.body.getAll("files") as File[];
      return {
        ok: true,
        json: async () => ({
          results: sent.map((file, index) => ({
            fileName: file.name,
            success: sent.length === 1 || index !== 0,
            parsingPending: false,
          })),
        }),
      };
    });
    vi.stubGlobal("fetch", fetch);
    render(
      <CompanyBulkUploadModal
        open
        onClose={vi.fn()}
        initialJobId="job-1"
        jobs={[{ id: "job-1", title: "Engineer", status: "open" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue to resumes" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Upload resume file(s) (PDF or Word)"), {
      target: { files },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload 20 profiles" }));
    fireEvent.change(await screen.findByLabelText("Email for person-0.pdf"), {
      target: { value: "first@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Email for person-10.pdf"), {
      target: { value: "second@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry remaining files" }));
    await screen.findByText("20 succeeded, 0 failed");
    expect(
      fetch.mock.calls.slice(2).map(([, options]) => ({
        file: (options.body.get("files") as File).name,
        email: options.body.get("email"),
      })),
    ).toEqual([
      { file: "person-0.pdf", email: "first@example.com" },
      { file: "person-10.pdf", email: "second@example.com" },
    ]);
  });

  it("preselects the job and reaches the real file input", () => {
    render(
      <CompanyBulkUploadModal
        open
        onClose={vi.fn()}
        initialJobId="job-1"
        jobs={[{ id: "job-1", title: "Engineer", status: "open" }]}
      />,
    );
    expect((screen.getByRole("combobox", { name: "Target role" }) as HTMLSelectElement).value).toBe(
      "job-1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue to resumes" }));
    expect(screen.getByLabelText("Upload resume file(s) (PDF or Word)")).toBeTruthy();
  });
});
