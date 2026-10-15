import { describe, expect, it } from "vitest";
import { isMissingOfferTemplateCustomMergeColumn } from "@/lib/offers/offer-custom-merge-fields";

describe("isMissingOfferTemplateCustomMergeColumn", () => {
  it("detects Postgres undefined column errors", () => {
    expect(
      isMissingOfferTemplateCustomMergeColumn({
        message: "column offer_pdf_templates.custom_merge_field_defs does not exist",
        code: "42703",
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(
      isMissingOfferTemplateCustomMergeColumn({
        message: "permission denied for table offer_pdf_templates",
        code: "42501",
      }),
    ).toBe(false);
  });
});
