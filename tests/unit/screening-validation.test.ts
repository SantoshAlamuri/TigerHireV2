import { describe, expect, it } from "vitest";
import { screeningOverrideSchema, screeningSettingsSchema } from "@/lib/validations/screening";

describe("screeningOverrideSchema", () => {
  it("accepts valid mode override payload", () => {
    const parsed = screeningOverrideSchema.safeParse({
      job_id: "11111111-1111-4111-8111-111111111111",
      new_mode: "whatsapp",
      reason: "Prefer text mode",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("screeningSettingsSchema", () => {
  it("rejects invalid calling hour ranges", () => {
    const parsed = screeningSettingsSchema.safeParse({
      screening_default_mode: "whatsapp",
      voice_screening_enabled: false,
      voice_screening_free_credits_per_month: 10,
      voice_screening_monthly_cap_inr: null,
      screening_fitscore_threshold: 75,
      screening_calling_hours_start: "19:00",
      screening_calling_hours_end: "10:00",
      screening_auto_trigger: true,
    });
    expect(parsed.success).toBe(false);
  });
});
