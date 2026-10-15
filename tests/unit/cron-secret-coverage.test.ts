import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * T17 from docs/TECH-DEBT-LOG.md — every cron route under `src/app/api/cron/*`
 * must call `validateCronSecret`. Forgetting the check would expose a route
 * that mutates production state to anyone on the internet. Reviewers can't
 * catch this in every PR; the test does.
 *
 * Scope: any `route.ts` file anywhere under `src/app/api/cron/`. The check
 * looks for the literal `validateCronSecret(` invocation so a stray import
 * that doesn't actually call the function fails the test.
 */
const CRON_ROOT = join(process.cwd(), "src", "app", "api", "cron");

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

describe("cron route secret coverage (T17)", () => {
  const routes = findRouteFiles(CRON_ROOT);

  it("finds at least one cron route (sanity check on test wiring)", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes.map((r) => [relative(process.cwd(), r), r]))(
    "%s calls validateCronSecret",
    (_label, abs) => {
      const src = readFileSync(abs, "utf8");
      const calls = (src.match(/validateCronSecret\s*\(/g) ?? []).length;
      expect(
        calls,
        `${relative(process.cwd(), abs)} must invoke validateCronSecret(...) to authenticate cron requests`,
      ).toBeGreaterThan(0);
    },
  );
});
