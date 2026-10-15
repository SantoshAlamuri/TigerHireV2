// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/security/csrf-client", () => ({
  buildCsrfHeaders: async () => ({ "X-CSRF-Token": "test" }),
}));
import { useDecisionSync } from "@/app/(dashboard)/recruit/v2/jobs/[id]/review/useDecisionSync";
afterEach(() => vi.unstubAllGlobals());
describe("review decision persistence", () => {
  it("reports failure and clears it only after successful retry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useDecisionSync());
    await act(async () => {
      expect(await result.current.persist("app-1", "reject", "skills")).toBe(false);
    });
    expect(result.current.failed).toEqual(["app-1"]);
    await act(async () => {
      expect(await result.current.persist("app-1", "reject", "skills")).toBe(true);
    });
    expect(result.current.failed).toEqual([]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      status: "rejected",
      rejection_reason: "skills",
    });
  });
  it("does not report success while the server request is pending", async () => {
    let complete!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const { result } = renderHook(() => useDecisionSync());
    let settled = false;
    const pending = result.current.persist("app-1", "advance").then(() => {
      settled = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);
    await act(async () => {
      complete({ ok: true });
      await pending;
    });
    expect(settled).toBe(true);
  });
});
