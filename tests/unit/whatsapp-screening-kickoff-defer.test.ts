import { describe, it, expect } from "vitest";
import { shouldDeferScreeningKickoff } from "@/lib/whatsapp/screening-qa-flow";

/**
 * #340 — a candidate messaging multiple orgs/jobs shares one WhatsApp session.
 * A new screening kickoff must NOT clobber an in-progress screening for a
 * different application, or the next reply is recorded against the wrong job.
 */
describe("shouldDeferScreeningKickoff", () => {
  it("defers when actively screening a DIFFERENT application", () => {
    expect(shouldDeferScreeningKickoff("screening_questions", "app-A", "app-B")).toBe(true);
  });

  it("does NOT defer for the SAME application (idempotent re-kick)", () => {
    expect(shouldDeferScreeningKickoff("screening_questions", "app-A", "app-A")).toBe(false);
  });

  it("does NOT defer when no screening is active (no active application)", () => {
    expect(shouldDeferScreeningKickoff("screening_questions", null, "app-B")).toBe(false);
    expect(shouldDeferScreeningKickoff("screening_questions", undefined, "app-B")).toBe(false);
    expect(shouldDeferScreeningKickoff("screening_questions", "", "app-B")).toBe(false);
  });

  it("does NOT defer when the session is not in the screening state", () => {
    expect(shouldDeferScreeningKickoff("active_alerts", "app-A", "app-B")).toBe(false);
    expect(shouldDeferScreeningKickoff("cv_received", "app-A", "app-B")).toBe(false);
    expect(shouldDeferScreeningKickoff("new", "app-A", "app-B")).toBe(false);
  });
});
