#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export function verifyReleaseReport(report) {
  const tests = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) tests.push(...(spec.tests ?? []));
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(report);
  if (!tests.length || report.errors?.length)
    throw new Error("Release E2E did not execute cleanly");
  if (
    tests.some(
      (test) =>
        test.expectedStatus !== "passed" ||
        test.results?.length !== 1 ||
        test.results[0].status !== "passed",
    )
  ) {
    throw new Error(
      "Release E2E requires every test to pass without skips, expected failures or retries",
    );
  }
  return tests.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(
    `Release E2E verified: ${verifyReleaseReport(JSON.parse(readFileSync(process.argv[2] ?? "test-results/release.json", "utf8")))} tests passed`,
  );
}
