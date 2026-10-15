// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useApiQuery, invalidateQueries } from "@/lib/hooks/use-api";
afterEach(() => {
  vi.unstubAllGlobals();
  invalidateQueries("/api/test-search-race");
});
it("keeps the latest search when an older request finishes last", async () => {
  const pending = new Map<string, (response: Response) => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => new Promise<Response>((resolve) => pending.set(url, resolve))),
  );
  const { result, rerender } = renderHook(
    ({ search }) => useApiQuery<{ name: string }>("/api/test-search-race", { search }),
    { initialProps: { search: "old" } },
  );
  await waitFor(() => expect(pending.has("/api/test-search-race?search=old")).toBe(true));
  rerender({ search: "new" });
  await waitFor(() => expect(pending.has("/api/test-search-race?search=new")).toBe(true));
  await act(async () =>
    pending.get("/api/test-search-race?search=new")!(new Response(JSON.stringify({ name: "new" }))),
  );
  await waitFor(() => expect(result.current.data?.name).toBe("new"));
  await act(async () =>
    pending.get("/api/test-search-race?search=old")!(new Response(JSON.stringify({ name: "old" }))),
  );
  expect(result.current.data?.name).toBe("new");
});

it("settles loading when a silent refetch supersedes a visible fetch", async () => {
  const requests: Array<(response: Response) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((resolve) => requests.push(resolve))),
  );
  const { result } = renderHook(() => useApiQuery<{ name: string }>("/api/test-search-race"));
  await waitFor(() => expect(requests).toHaveLength(1));
  let refresh: Promise<void>;
  act(() => {
    refresh = result.current.refetch({ silent: true });
  });
  await act(async () => {
    requests[1](new Response(JSON.stringify({ name: "latest" })));
    await refresh;
  });
  expect(result.current.data?.name).toBe("latest");
  expect(result.current.loading).toBe(false);
  await act(async () => requests[0](new Response(JSON.stringify({ name: "old" }))));
});

it.each([false, true])(
  "does not restore old same-key cache (persist=%s)",
  async (persistToSessionStorage) => {
    const requests: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => requests.push(resolve))),
    );
    const first = renderHook(() =>
      useApiQuery<{ name: string }>("/api/test-search-race", undefined, {
        persistToSessionStorage,
      }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    let refresh: Promise<void>;
    act(() => {
      refresh = first.result.current.refetch();
    });
    await act(async () => {
      requests[1](new Response(JSON.stringify({ name: "latest" })));
      await refresh;
    });
    await act(async () => requests[0](new Response(JSON.stringify({ name: "old" }))));
    if (persistToSessionStorage) {
      const cached = JSON.parse(
        sessionStorage.getItem("tigerhire.queryCache./api/test-search-race")!,
      );
      expect(cached.data.name).toBe("latest");
    }
    first.unmount();
    const second = renderHook(() =>
      useApiQuery<{ name: string }>("/api/test-search-race", undefined, {
        persistToSessionStorage,
      }),
    );
    expect(second.result.current.data?.name).toBe("latest");
  },
);

it("keeps a replacement request shared when the aborted predecessor settles", async () => {
  const requests: Array<{ resolve: (response: Response) => void; reject: (error: Error) => void }> =
    [];
  const fetchMock = vi.fn(
    () => new Promise<Response>((resolve, reject) => requests.push({ resolve, reject })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const first = renderHook(() => useApiQuery<{ name: string }>("/api/test-search-race"));
  await waitFor(() => expect(requests).toHaveLength(1));
  let refresh: Promise<void>;
  act(() => {
    refresh = first.result.current.refetch();
  });
  await act(async () =>
    requests[0].reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
  );
  const second = renderHook(() => useApiQuery<{ name: string }>("/api/test-search-race"));
  await act(async () => {});
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => {
    requests[1].resolve(new Response(JSON.stringify({ name: "latest" })));
    await refresh;
  });
  expect(second.result.current.data?.name).toBe("latest");
});
