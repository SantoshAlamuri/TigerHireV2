/**
 * Elite Standard v2.0 — File size limit (max lines per file).
 * Fails if any .ts/.tsx in src/ exceeds maxLines (default 250).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const MAX_LINES = 250;
const allowlistPath = path.join(__dirname, "size-check-allowlist.txt");

function loadAllowlist() {
  if (!fs.existsSync(allowlistPath)) return new Set();
  return new Set(
    fs
      .readFileSync(allowlistPath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#")),
  );
}

function getAllTsFiles(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let list = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      list = list.concat(getAllTsFiles(full, base));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      list.push(path.relative(base, full));
    }
  }
  return list;
}

function main() {
  const allowed = loadAllowlist();
  const srcDir = path.join(root, "src");
  if (!fs.existsSync(srcDir)) {
    console.log("size-check: no src/ directory.");
    return;
  }
  const files = getAllTsFiles(srcDir, path.join(root, "src"));
  const over = [];
  for (const rel of files) {
    const relJoined = path.join("src", rel).split(path.sep).join("/");
    if (allowed.has(relJoined)) continue;
    const full = path.join(root, "src", rel);
    const content = fs.readFileSync(full, "utf-8");
    const lines = content.split(/\n/).length;
    if (lines > MAX_LINES) {
      over.push({ rel: relJoined, lines });
    }
  }
  if (over.length > 0) {
    console.error(`Elite Standard v2.0: No file in src/ may exceed ${MAX_LINES} lines.`);
    console.error("Files over limit:");
    over
      .sort((a, b) => b.lines - a.lines)
      .forEach(({ rel, lines }) => console.error(`  - ${rel} (${lines} lines)`));
    process.exit(1);
  }
  if (allowed.size > 0) {
    console.log(
      `size-check: All non-allowlisted src files <= ${MAX_LINES} lines (${allowed.size} legacy file(s) exempt).`,
    );
  } else {
    console.log(`size-check: All src files <= ${MAX_LINES} lines.`);
  }
}

main();
