import { describe, expect, it } from "vitest";
import { readFileSync, globSync } from "node:fs";
import path from "node:path";

/**
 * Guardrail for the PGRST201 class of outage.
 *
 * `jobs` has two foreign keys to `organisations` (organisation_id and
 * client_organisation_id). Any PostgREST embed that reaches organisations
 * *through jobs* without naming the FK is ambiguous, and PostgREST answers
 * with an error instead of rows — which surfaced as a simultaneous 500 on
 * the jobs list, the applications list, fit scores, and the public job board.
 *
 * The failure is invisible to TypeScript and to unit tests that mock the
 * query builder, so it is asserted against the source text here.
 */
const SRC = path.join(process.cwd(), "src");

/**
 * `organisations(` not already pinned to a named FK via `!fk_name`.
 *
 * Requires a preceding `,` or `"`/`'`/`` ` `` (or newline inside a template
 * literal) so this matches embeds inside a PostgREST select string and not a
 * method or identifier named `organisations()` (e.g. the tenant-scoped
 * client's table accessor).
 *
 * Whitespace before `(` is allowed: multi-line template-literal selects are
 * commonly formatted `organisations ( name, slug )`, and an earlier version of
 * this guard missed exactly that, letting a live PGRST201 through.
 */
const UNQUALIFIED = /["'`,\n]\s*(?<!!)\borganisations\s*\(\s*[a-z_]/;

/**
 * A file touches jobs if it queries the jobs table or embeds through it.
 * Files that only read organisations directly (or embed from a table with a
 * single FK, like profiles) are unaffected by the ambiguity.
 */
const JOBS_CONTEXT = /\.from\(\s*["'`]jobs["'`]\s*\)|\bjobs!?\w*\(/;

function sourceFiles(): string[] {
  return globSync("**/*.{ts,tsx}", { cwd: SRC })
    .filter((f) => !f.endsWith(".d.ts"))
    .map((f) => path.join(SRC, f));
}

describe("PostgREST embed ambiguity (PGRST201)", () => {
  it("never embeds organisations through jobs without naming the foreign key", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      if (!UNQUALIFIED.test(text) || !JOBS_CONTEXT.test(text)) continue;

      // Scan the whole file, not line-by-line: multi-line template selects put
      // the embed on its own line (`\n        organisations ( name, slug ),`),
      // so the delimiter that proves it is a select entry lives on the PREVIOUS
      // line. A per-line test cannot see it and silently reports nothing.
      const re = new RegExp(UNQUALIFIED.source, "g");
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${path.relative(process.cwd(), file)}:${line}`);
      }
    }

    expect(
      offenders,
      "Ambiguous organisations embed in a file that queries jobs — pin the FK, " +
        `e.g. organisations!jobs_organisation_id_fkey(name):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
