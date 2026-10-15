import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOME_TILES, HOME_UNEVALUATED_BY_ROLE } from "@/lib/home/tile-registry";
import type { UserRole } from "@/types/database";

const SHELL_ROLES: UserRole[] = [
  "leadership",
  "recruiter",
  "hiring_manager",
  "interviewer",
  "finance",
  "employee",
];

const ROUTE = readFileSync(join(process.cwd(), "src/app/api/home/tiles/route.ts"), "utf8");

/** The body of one `case "<id>": { … }` block in the tiles route. */
function caseBody(tileId: string): string | null {
  const start = ROUTE.indexOf(`case "${tileId}": {`);
  if (start === -1) return null;
  const next = ROUTE.indexOf('\n      case "', start + 1);
  return ROUTE.slice(start, next === -1 ? ROUTE.length : next);
}

describe("HOME_TILES registry", () => {
  it("gives every customer-shell role at least one tile", () => {
    // Deliberately one, not three. The previous floor was three, and three is
    // what produced four tiles that served a hardcoded zero forever — two of
    // them the interviewer's, whose Home therefore always read "nothing needs
    // you". A seat with two honest tiles is in better shape than one with
    // three where one is fiction.
    for (const role of SHELL_ROLES) {
      const n = HOME_TILES.filter((t) => t.visibleTo({ role, is_org_admin: false })).length;
      expect(n, role).toBeGreaterThanOrEqual(1);
    }
  });

  it("backs every tile with a handler that actually reads something", () => {
    // The ratchet that replaces the tile-count floor. A tile whose handler
    // never touches the database is reporting a number nobody measured, and
    // that reads to the user exactly like a real zero.
    const fake: string[] = [];
    for (const tile of HOME_TILES) {
      const body = caseBody(tile.id);
      if (body == null) {
        fake.push(`${tile.id}: no handler in /api/home/tiles`);
        continue;
      }
      if (!body.includes(".from(") && !body.includes("listActionableTasksForUser")) {
        fake.push(`${tile.id}: handler returns a constant, never queries`);
      }
    }
    expect(fake).toEqual([]);
  });

  it("names what a seat's Home cannot check instead of rendering it as zero", () => {
    // The four deleted tiles measured real things the product does not track
    // yet. Dropping them silently would leave the seat unaware the signal is
    // missing, so each is named on the page.
    for (const [role, signals] of Object.entries(HOME_UNEVALUATED_BY_ROLE)) {
      expect(signals.length, role).toBeGreaterThan(0);
      for (const s of signals) expect(s.trim()).not.toBe("");
    }
    expect(Object.keys(HOME_UNEVALUATED_BY_ROLE)).toContain("interviewer");
  });

  it("has no tile left whose handler was one of the hardcoded zeros", () => {
    for (const dead of ["iv-feedback-open", "iv-recent-done", "fn-hires-6m", "em-vouches"]) {
      expect(HOME_TILES.map((t) => t.id)).not.toContain(dead);
      expect(ROUTE).not.toContain(`case "${dead}"`);
    }
  });

  it("separates what needs the seat from what is only context", () => {
    for (const tile of HOME_TILES) {
      expect(["action", "context"], tile.id).toContain(tile.kind);
    }
    // Every seat that has an actionable signal should surface it as one.
    const actionable = HOME_TILES.filter((t) => t.kind === "action");
    expect(actionable.length).toBeGreaterThan(0);
  });

  it("home page composes from registry only (no inline role conditionals)", () => {
    const pagePath = join(process.cwd(), "src/app/(dashboard)/home/page.tsx");
    const src = readFileSync(pagePath, "utf8");
    expect(src).not.toMatch(/if\s*\(\s*user\.role/);
    expect(src).not.toMatch(/role\s*===/);
  });
});
