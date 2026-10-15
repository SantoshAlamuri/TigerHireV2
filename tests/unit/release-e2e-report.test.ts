// @vitest-environment node
import { describe, expect, it } from "vitest";
import { verifyReleaseReport } from "../../scripts/check-release-e2e.mjs";
const report = (status = "passed", expectedStatus = "passed") => ({
  suites: [{ specs: [{ tests: [{ expectedStatus, results: [{ status }] }] }] }],
});
describe("release browser gate", () => {
  it("accepts executed passing tests", () => expect(verifyReleaseReport(report())).toBe(1));
  it.each(["skipped", "failed", "timedOut", "interrupted"])("rejects %s", (status) =>
    expect(() => verifyReleaseReport(report(status))).toThrow(),
  );
  it("rejects expected failures", () =>
    expect(() => verifyReleaseReport(report("failed", "failed"))).toThrow());
  it("rejects empty or errored runs", () => {
    expect(() => verifyReleaseReport({ suites: [] })).toThrow();
    expect(() => verifyReleaseReport({ ...report(), errors: [{}] })).toThrow();
  });
});
