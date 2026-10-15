import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every value the edit-job form SUBMITS must have an input that collects it.
 *
 * The salary inputs went missing during a layout restructure while handleSubmit
 * kept reading compensationMin/Max out of the FormData. The payload carried
 * undefined, the request succeeded, and the field looked saved. Nothing failed:
 * not typecheck, because a FormData key is just a string; not any test, because
 * none read the markup.
 *
 * This compares what the submit handler reads against what the form renders, so
 * a dropped field is a failing test rather than a silent data loss.
 */
const EDIT_DIRECTORY = "src/app/(dashboard)/recruit/jobs/[id]/edit";
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const PAGE = source(`${EDIT_DIRECTORY}/page.tsx`);
const EDITOR = source(`${EDIT_DIRECTORY}/JobEditor.tsx`);
const HANDLER = source(`${EDIT_DIRECTORY}/useJobEditor.ts`);
const ROLE_FIELDS = source(`${EDIT_DIRECTORY}/JobRoleFields.tsx`);
// Follow the rendered component tree: role inputs and visibility toggles are
// extracted children; the submit handler now lives in the editor's hook.
const VISIBILITY_FIELDS = source("src/components/dashboard/JobListingVisibilityFields.tsx");
const SRC = `${EDITOR}\n${ROLE_FIELDS}\n${VISIBILITY_FIELDS}`;

describe("edit job form", () => {
  it("connects the route, submit handler, and extracted form fields", () => {
    expect(PAGE).toMatch(/<JobEditor\s*\/>/);
    expect(EDITOR).toMatch(/useJobEditor\(\)/);
    expect(EDITOR).toMatch(/<form[^>]*onSubmit=\{handleSubmit\}/);
    expect(EDITOR).toMatch(/<JobRoleFields\s+state=\{state\}/);
    expect(ROLE_FIELDS).toMatch(/<JobListingVisibilityFields\b/);
  });
  it("renders an input for every field the submit handler reads", () => {
    const read = [...HANDLER.matchAll(/form\.get\("([a-zA-Z]+)"\)/g)].map((m) => m[1]);
    const rendered = new Set([...SRC.matchAll(/name="([a-zA-Z]+)"/g)].map((m) => m[1]));
    expect(read.length).toBeGreaterThan(3);
    expect(read.filter((f) => !rendered.has(f))).toEqual([]);
  });

  it("still collects the salary band", () => {
    // The specific regression: both bounds, as numbers, inside the form.
    expect(SRC).toMatch(/name="compensationMin"/);
    expect(SRC).toMatch(/name="compensationMax"/);
  });
});
