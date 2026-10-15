import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

/**
 * Guards for the transparent-popup / invisible-dropdown bug cluster
 * (Bug Report: Pipeline #1/#4, Notification #1, Candidates #1).
 */
describe("CSS popup/dropdown regression guards", () => {
  it("has no invalid `card-lifted/NN` opacity-modifier tokens (they render transparent)", () => {
    // The slash opacity modifier only works on Tailwind color utilities, not the
    // custom .card-lifted class — written as card-lifted/60 it matches nothing,
    // leaving the panel with no background (see-through with backdrop-blur).
    const out = execSync(
      "grep -rln 'card-lifted/[0-9]' src --include='*.tsx' --include='*.ts' || true",
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });

  it("globals.css gives native <select> options an opaque background + readable colour", () => {
    const css = readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf8");
    expect(css).toMatch(/select option/);
    expect(css).toMatch(/select option,\s*\n?\s*select optgroup\s*\{[^}]*background-color/);
  });

  it("globals.css .card-lifted background has a literal fallback (never transparent)", () => {
    const css = readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.card-lifted\s*\{[^}]*background:\s*var\(--card,\s*#/);
  });
});
