// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { candidateListState, patchWorkspaceQuery } from "@/lib/v2/workspace-query";
import { useReviewWorkspace } from "@/lib/v2/use-review-workspace";
beforeEach(() => sessionStorage.clear());
it("round-trips filter, page and expanded-job context without dropping the selected job", () => {
  const query = patchWorkspaceQuery("jobId=job-1", {
    search: "Asha",
    location: "Hyderabad",
    intent: "high",
    page: "3",
    expanded: "job-1,job-2",
  });
  expect(new URLSearchParams(query).get("jobId")).toBe("job-1");
  expect(candidateListState(new URLSearchParams(query))).toMatchObject({
    page: 3,
    search: "Asha",
    filters: { location: "Hyderabad", highIntentOnly: true },
    openJobs: ["job-1", "job-2"],
  });
});
it("restores review selection only for applications still in the authorized queue", async () => {
  const items = [
    { id: "app-1", name: "One", score: 90 },
    { id: "app-2", name: "Two", score: 0 },
  ];
  sessionStorage.setItem(
    "review-user-job",
    JSON.stringify({ current: "app-2", selected: ["app-2", "no-longer-visible"] }),
  );
  const { result, unmount } = renderHook(() => useReviewWorkspace(items, "review-user-job", null));
  await waitFor(() => expect(result.current[0].cursor).toBe(1));
  expect(result.current[0].selected).toEqual(["app-2"]);
  await act(async () => result.current[1]((previous) => ({ ...previous, selected: ["app-1"] })));
  unmount();
  const returned = renderHook(() => useReviewWorkspace(items, "review-user-job", null));
  await waitFor(() => expect(returned.result.current[0].selected).toEqual(["app-1"]));
});

it("stores the dashboard scroller rather than the non-scrolling window", async () => {
  const { useWorkspaceScroll } = await import("@/lib/v2/use-workspace-scroll");
  const main = document.createElement("main");
  main.id = "main-content";
  main.scrollTo = () => {};
  document.body.append(main);
  const hook = renderHook(() => useWorkspaceScroll("candidate-list", true));
  main.scrollTop = 420;
  main.dispatchEvent(new Event("scroll"));
  hook.unmount();
  expect(sessionStorage.getItem("tigerhire.scroll:candidate-list")).toBe("420");
  main.remove();
});
