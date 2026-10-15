/**
 * Pre-build: move debug and seed API routes out of the app tree so they are
 * not included in the production bundle. Restore in postbuild so the repo stays intact.
 * Only runs when NODE_ENV=production (e.g. during `next build`).
 */
import { mkdirSync, renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const backupDir = join(root, ".dev-routes-backup");
const apiDir = join(root, "src", "app", "api");
const debugSrc = join(apiDir, "debug");
const seedSrc = join(apiDir, "seed");
const debugBackup = join(backupDir, "debug");
const seedBackup = join(backupDir, "seed");

if (process.env.NODE_ENV !== "production") {
  process.exit(0);
}

try {
  if (existsSync(debugSrc)) {
    mkdirSync(backupDir, { recursive: true });
    renameSync(debugSrc, debugBackup);
    console.log("[prebuild] Moved src/app/api/debug to .dev-routes-backup/");
  }
  if (existsSync(seedSrc)) {
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    renameSync(seedSrc, seedBackup);
    console.log("[prebuild] Moved src/app/api/seed to .dev-routes-backup/");
  }
} catch (err) {
  console.error("[prebuild] Failed to move dev routes:", err.message);
  process.exit(1);
}
