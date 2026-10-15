import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

/** Discover all route.ts files under src/app/api/cron so new cron routes are automatically asserted. */
function getCronRoutePaths(): string[] {
  const projectRoot = process.cwd();
  const cronDir = join(projectRoot, "src", "app", "api", "cron");
  if (!existsSync(cronDir)) return [];
  const routes: string[] = [];
  for (const name of readdirSync(cronDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const routePath = join("src", "app", "api", "cron", name.name, "route.ts");
    if (existsSync(join(projectRoot, routePath))) routes.push(routePath);
  }
  return routes;
}

describe("Cron routes use validateCronSecret", () => {
  const projectRoot = process.cwd();
  const cronRoutes = getCronRoutePaths();

  it("finds at least one cron route", () => {
    expect(cronRoutes.length).toBeGreaterThan(0);
  });

  for (const routePath of cronRoutes) {
    it(`${routePath} imports and uses validateCronSecret`, () => {
      const fullPath = join(projectRoot, routePath);
      const content = readFileSync(fullPath, "utf-8");
      expect(content).toContain("validateCronSecret");
      expect(content).toMatch(/validateCronSecret\s*\(\s*request\s*\)/);
    });
  }
});
