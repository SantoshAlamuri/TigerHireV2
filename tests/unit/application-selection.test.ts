import { expect, it } from "vitest";
import { resolveApplicationSelection } from "@/lib/v2/application-selection";
it("keeps the linked application through an empty loading phase", () => {
  let selected = resolveApplicationSelection("linked-application", [], true);
  selected = resolveApplicationSelection(
    selected,
    [{ id: "newest-other-role" }, { id: "linked-application" }],
    false,
  );
  expect(selected).toBe("linked-application");
});
it("falls back only once an authorized list confirms the linked application is absent", () => {
  expect(resolveApplicationSelection("missing", [{ id: "allowed" }], false)).toBe("allowed");
});
