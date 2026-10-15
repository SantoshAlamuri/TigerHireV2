import { describe, it, expect } from "vitest";
import {
  parseJobDescriptionBlocks,
  renderPublicJdSectionValue,
} from "@/lib/jobs/format-job-description";

describe("parseJobDescriptionBlocks", () => {
  it("parses markdown headings without asterisks in output", () => {
    const blocks = parseJobDescriptionBlocks(
      "Intro paragraph.\n\n**Key Responsibilities**\n\nFirst duty.\n\nSecond duty.",
    );
    expect(blocks).toEqual([
      { type: "paragraph", lines: ["Intro paragraph."] },
      { type: "heading", text: "Key Responsibilities", listSection: true },
      { type: "list", items: ["First duty.", "Second duty."] },
    ]);
  });

  it("parses explicit bullet lines", () => {
    const blocks = parseJobDescriptionBlocks("- Item one\n- Item two");
    expect(blocks).toEqual([{ type: "list", items: ["Item one", "Item two"] }]);
  });

  it("keeps inline bold inside paragraphs", () => {
    const blocks = parseJobDescriptionBlocks("We need a **Lead Analyst** for the team.");
    expect(blocks).toEqual([
      { type: "paragraph", lines: ["We need a **Lead Analyst** for the team."] },
    ]);
  });

  it("treats single-newline responsibility lines as a bullet list", () => {
    const blocks = parseJobDescriptionBlocks(
      "Manage complete recruitment lifecycle from sourcing to onboarding\nHandle volume and niche hiring across functions\nCoordinate interviews, hiring drives, offers, and closures",
    );
    expect(blocks).toEqual([
      {
        type: "list",
        items: [
          "Manage complete recruitment lifecycle from sourcing to onboarding",
          "Handle volume and niche hiring across functions",
          "Coordinate interviews, hiring drives, offers, and closures",
        ],
      },
    ]);
  });
});

describe("renderPublicJdSectionValue", () => {
  it("renders skill sections as tag pills", () => {
    const node = renderPublicJdSectionValue(["SQL", "Python"], "technicalSkills");
    expect(node).toBeTruthy();
  });

  it("renders responsibilities as a bullet list", () => {
    const node = renderPublicJdSectionValue(["Build pipelines"], "rolesAndResponsibilities");
    expect(node).toBeTruthy();
  });
});
