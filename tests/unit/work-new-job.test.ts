import { describe, expect, it } from "vitest";
import {
  missingForRequest,
  requestBody,
  requirementsFromSections,
  understoodFromDraft,
} from "@/lib/work/new-job";

const sections = [
  { label: "About the role", type: "text", value: "Build payment services." },
  { label: "Required skills", type: "list", value: ["Go in production", "Payments domain"] },
  { label: "Experience", type: "text", value: "- Postgres at scale\n- Distributed systems" },
  { label: "Nice to have", type: "list", value: ["Kubernetes"] },
];

describe("new job", () => {
  it("separates must-haves from nice-to-haves", () => {
    expect(requirementsFromSections(sections)).toEqual({
      must: ["Go in production", "Payments domain", "Postgres at scale", "Distributed systems"],
      nice: ["Kubernetes"],
    });
  });

  it("reads pay in lakhs and experience as a range", () => {
    const u = understoodFromDraft(
      "Full text",
      {
        title: "Senior Backend Engineer",
        location: "Bengaluru",
        compensationMin: 4_000_000,
        compensationMax: 4_500_000,
        experienceMin: 5,
        experienceMax: 8,
      },
      sections,
    );
    expect(u.payMinLpa).toBe("40");
    expect(u.payMaxLpa).toBe("45");
    expect(u.experience).toBe("5 to 8 years");
  });

  it("sends pay back in rupees and submits for approval", () => {
    const u = understoodFromDraft("Text", { title: "X", compensationMin: 4_000_000 }, sections);
    const body = requestBody({ ...u, payMaxLpa: "45.5" }, "note from Vikram");
    expect(body.budgetCtcMin).toBe(4_000_000);
    expect(body.budgetCtcMax).toBe(4_550_000);
    expect(body.saveDraft).toBe(false);
    expect(body.notes).toBe("note from Vikram");
  });

  it("asks for a title and a must-have before sending", () => {
    const u = understoodFromDraft("", {}, []);
    expect(missingForRequest(u)).toEqual(["a title", "at least one must-have"]);
  });
});
