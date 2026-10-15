#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "vitest-behavior.json";

const raw = readFileSync(file, "utf8");
const parsed = JSON.parse(raw);

const testFiles = Array.isArray(parsed.testResults)
  ? parsed.testResults
  : Array.isArray(parsed.files)
    ? parsed.files
    : [];

const behaviorFiles = testFiles.filter((entry) => {
  const name = String(entry.name ?? entry.filepath ?? entry.file ?? "");
  return name.includes(".behavior.test.");
});

if (behaviorFiles.length === 0) {
  console.error("No behavior test files found in vitest output.");
  process.exit(1);
}

const statusOf = (test) =>
  String(test?.status ?? test?.state ?? test?.result?.state ?? "").toLowerCase();

const allAssertions = behaviorFiles.flatMap((fileEntry) => {
  if (Array.isArray(fileEntry.assertionResults)) return fileEntry.assertionResults;
  if (Array.isArray(fileEntry.tests)) return fileEntry.tests;
  if (Array.isArray(fileEntry.tasks)) return fileEntry.tasks;
  return [];
});

const executed = allAssertions.filter((t) => {
  const s = statusOf(t);
  return s === "pass" || s === "passed" || s === "fail" || s === "failed";
});

if (executed.length === 0) {
  console.error("Behavior tests ran zero assertions (all skipped/pending).");
  console.error("Check integration environment variables for CI.");
  process.exit(1);
}

console.log(`Behavior test assertions executed: ${executed.length}`);
