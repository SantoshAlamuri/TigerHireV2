import { describe, expect, it } from "vitest";
import {
  interpolateOfferTemplate,
  type OfferTemplateVariables,
} from "@/lib/offers/interpolate-offer-template";
import { resolvedCustomMergeValues } from "@/lib/offers/offer-custom-merge-fields";

const baseVars: OfferTemplateVariables = {
  company_name: "Acme",
  candidate_name: "Alex",
  role_title: "Engineer",
  start_date: "2026-06-01",
  compensation: "{}",
  compensation_breakdown: "",
  ctc_lpa: "",
  notes: "(none)",
  generated_date: "2026-04-16",
};

describe("interpolateOfferTemplate", () => {
  it("replaces built-in tokens", () => {
    const out = interpolateOfferTemplate("Hi {{ candidate_name }} at {{company_name}}", baseVars);
    expect(out).toBe("Hi Alex at Acme");
  });

  it("replaces custom tokens after built-ins", () => {
    const out = interpolateOfferTemplate("Loc: {{ work_location }} — {{role_title}}", baseVars, {
      work_location: "Remote (India)",
    });
    expect(out).toBe("Loc: Remote (India) — Engineer");
  });
});

describe("resolvedCustomMergeValues", () => {
  it("fills only declared keys and defaults missing", () => {
    const defs = [
      { key: "site", label: "Site", description: "Office" },
      { key: "team", label: "Team" },
    ];
    expect(resolvedCustomMergeValues(defs, { site: "BLR", extra: "ignored" })).toEqual({
      site: "BLR",
      team: "",
    });
  });
});
