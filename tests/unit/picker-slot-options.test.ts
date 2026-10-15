import { describe, expect, it } from "vitest";
import { MAX_PICKER_SLOTS, PICKER_SLOT_MINUTES } from "@/lib/interviews/picker-slot-options";

describe("picker slot options constants", () => {
  it("exposes Phase C picker limits", () => {
    expect(MAX_PICKER_SLOTS).toBe(5);
    expect(PICKER_SLOT_MINUTES).toBe(60);
  });
});
