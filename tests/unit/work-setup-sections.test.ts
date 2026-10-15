import { describe, expect, it } from "vitest";
import { SETUP_SECTIONS, setupFor } from "@/lib/work/setup-sections";

const hrefs = (sections: ReturnType<typeof setupFor>) =>
  sections.flatMap((s) => s.links.map((l) => l.href));

describe("setup sections", () => {
  it("gives every section an id the job screens can link to", () => {
    expect(SETUP_SECTIONS.map((s) => s.id)).toEqual(
      expect.arrayContaining(["calendars", "process", "channels", "team"]),
    );
  });

  it("hides org-wide settings from a recruiter who is not an org admin", () => {
    const links = hrefs(setupFor("recruiter", false));
    expect(links).toContain("/work/setup/availability");
    expect(links).not.toContain("/work/setup/team");
  });

  it("shows org-wide settings to an org admin with a leadership role", () => {
    expect(hrefs(setupFor("leadership", true))).toContain("/work/setup/team");
  });

  it("drops sections that end up empty", () => {
    for (const s of setupFor("recruiter", false)) expect(s.links.length).toBeGreaterThan(0);
  });
});
