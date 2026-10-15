#!/usr/bin/env node
/**
 * Fail fast if package.json is invalid or still contains merge conflict markers.
 * Tailwind/PostCSS reads package.json and surfaces a confusing CssSyntaxError otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const raw = fs.readFileSync(pkgPath, "utf8");

if (raw.includes("<<<<<<<") || raw.includes("=======") || raw.includes(">>>>>>>")) {
  console.error(
    "package.json still has Git merge conflict markers (<<<<<<< / ======= / >>>>>>>).\n" +
      "Fix: remove them by hand, or reset the file:\n" +
      "  git checkout HEAD -- package.json\n",
  );
  process.exit(1);
}

try {
  JSON.parse(raw);
} catch (e) {
  console.error("package.json is not valid JSON:", e instanceof Error ? e.message : e);
  process.exit(1);
}
