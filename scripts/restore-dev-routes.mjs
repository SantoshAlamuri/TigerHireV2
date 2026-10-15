/**
 * Post-build: restore debug and seed API routes so the repo is unchanged.
 */
import { renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const backupDir = join(root, ".dev-routes-backup");
const apiDir = join(root, "src", "app", "api");
const debugBackup = join(backupDir, "debug");
const seedBackup = join(backupDir, "seed");
const debugSrc = join(apiDir, "debug");
const seedSrc = join(apiDir, "seed");

if (process.env.NODE_ENV !== "production") {
  process.exit(0);
}

try {
  if (existsSync(debugBackup)) {
    renameSync(debugBackup, debugSrc);
    console.log("[postbuild] Restored src/app/api/debug");
  }
  if (existsSync(seedBackup)) {
    renameSync(seedBackup, seedSrc);
    console.log("[postbuild] Restored src/app/api/seed");
  }
} catch (err) {
  console.error("[postbuild] Failed to restore dev routes:", err.message);
  process.exit(1);
}
