/**
 * Pre-deploy safety check: scan pending migrations for dangerous operations
 * on critical tables (auth.users, profiles, organisations).
 *
 * Usage: node scripts/check-migrations-safety.mjs
 * Add to CI or run before `supabase db push`.
 *
 * Exit code 1 if dangerous operations found (unless --allow-dangerous is passed).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const CRITICAL_TABLES = ["auth.users", "profiles", "organisations", "candidates"];

const DANGEROUS_PATTERNS = CRITICAL_TABLES.flatMap((table) => [
  {
    regex: new RegExp(`DELETE\\s+FROM\\s+${table.replace(".", "\\.")}`, "gi"),
    description: `DELETE FROM ${table}`,
  },
  {
    regex: new RegExp(`TRUNCATE\\s+${table.replace(".", "\\.")}`, "gi"),
    description: `TRUNCATE ${table}`,
  },
  {
    regex: new RegExp(`DROP\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?${table.replace(".", "\\.")}`, "gi"),
    description: `DROP TABLE ${table}`,
  },
]);

const allowDangerous = process.argv.includes("--allow-dangerous");

let issues = 0;

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const content = readFileSync(join(migrationsDir, file), "utf8");

  for (const pattern of DANGEROUS_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      issues++;
      console.error(
        `\x1b[31m[DANGER]\x1b[0m ${file}: contains ${pattern.description} (${matches.length} occurrence${matches.length > 1 ? "s" : ""})`,
      );
    }
  }
}

if (issues > 0) {
  console.error(
    `\n\x1b[31mFound ${issues} dangerous operation(s) in migrations targeting critical tables.\x1b[0m`,
  );
  console.error("Review carefully before applying. Use --allow-dangerous to bypass this check.\n");
  if (!allowDangerous) {
    process.exit(1);
  }
} else {
  console.log("\x1b[32m✓ No dangerous operations found in migrations.\x1b[0m");
}
