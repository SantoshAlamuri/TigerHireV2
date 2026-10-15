import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { capabilitiesFor, type Capabilities } from "@/lib/v2/seat-capabilities";

/**
 * Does every screen in the v2 tree decide for itself who may read it?
 *
 * Route policy used to be the only boundary: /recruit/v2/candidates,
 * /candidates/pool, /setup and /setup/benchmarks did no role check, so a single
 * line in the policy table was all that stood between an agency and the
 * client's candidate database. On 2026-07-30 an edit to that line briefly
 * handed it over, and nothing in CI noticed because nothing was checking.
 *
 * Agency now has route access — the seat is finished and it needs the tree. The
 * condition attached to granting it was that every screen gate its own content,
 * so this asserts that condition holds rather than trusting it to.
 */
const APP = join(process.cwd(), "src/app/(dashboard)/recruit/v2");

function pages(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (e === "page.tsx") out.push(full);
  }
  return out;
}

/**
 * Screens an agency is MEANT to reach. Everything else must gate.
 *
 * Listed explicitly, so adding a screen to the tree without deciding who may
 * see it fails here instead of shipping open.
 */
const AGENCY_FACING = new Set([
  "jobs/[id]/submit/page.tsx", // ag:submit — their own submissions
  "candidates/[id]/submission/page.tsx", // ag:candidate — one of their own
]);

/**
 * Being reached through a job is NOT a boundary.
 *
 * These were briefly treated as safe because they live under jobs/[id] and an
 * agency only reaches jobs it works. But an agency works those jobs — so the
 * review queue would have shown it the client's entire scored applicant list,
 * every other agency's submissions included. Nesting is not scoping. Only
 * integrations is exempt, and only because it gates on the seat inline.
 */
const GATES_INLINE = new Set(["setup/integrations/page.tsx"]);
/** Canonical workspace is gated; this page only preserves the v2 bookmark. */
const REDIRECTS = new Set(["jobs/[id]/setup/page.tsx"]);

describe("v2 seat gating", () => {
  it("gates every screen that is not deliberately agency-facing", () => {
    const ungated: string[] = [];
    for (const file of pages(APP)) {
      const rel = file.slice(APP.length + 1);
      if (AGENCY_FACING.has(rel) || GATES_INLINE.has(rel) || REDIRECTS.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      // Either the shared gate, or an inline capability check — both decide.
      if (!src.includes("SeatGate") && !src.includes("capabilitiesFor")) ungated.push(rel);
    }
    expect(ungated).toEqual([]);
  });

  it("gates the agency-facing screens too, just on a capability they hold", () => {
    for (const rel of AGENCY_FACING) {
      const src = readFileSync(join(APP, rel), "utf8");
      expect(src).toContain("capabilitiesFor");
    }
  });
});

/**
 * The capability table is the thing SeatGate consults, so a leak can equally
 * come from the table quietly granting an agency something. These are the
 * boundaries that matter, asserted as facts rather than left to review.
 */
describe("what an agency may never hold", () => {
  const agency = capabilitiesFor("agency");

  it("cannot read the org candidate database or the talent pool", () => {
    expect(agency.viewAllCandidates).toBe(false);
  });

  it("cannot read or change hiring setup", () => {
    expect(agency.editJobSetup).toBe(false);
    expect(agency.editIntegrations).toBe(false);
  });

  it("cannot review the client's applicant queue", () => {
    expect(agency.reviewApplications).toBe(false);
  });

  it("cannot read the portfolio or approve a rubric", () => {
    // Both would expose the client's bar and where their hiring is failing.
    expect(agency.viewPortfolio).toBe(false);
    expect(agency.approveRubrics).toBe(false);
  });

  it("holds only what its own work needs", () => {
    const granted = (Object.keys(agency) as Array<keyof Capabilities>).filter((k) => agency[k]);
    expect(granted.sort()).toEqual(["submitCandidates", "viewJobs", "viewOwnSubmissions"]);
  });
});
