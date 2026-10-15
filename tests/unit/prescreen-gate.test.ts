import { describe, it, expect, afterEach } from "vitest";
import { resolveGateFromSignals } from "@/lib/prescreen/gate";
import { parseYesNo } from "@/lib/prescreen/interactive";
import { missingCvEvidence } from "@/lib/prescreen/cv-evidence";
import {
  prescreenReminderHours,
  prescreenTimeoutHours,
  prescreenPendingSweepBufferHours,
} from "@/lib/prescreen/config";

describe("resolveGateFromSignals (precedence form > whatsapp > cv)", () => {
  it("form answers decide and skip cv when present", () => {
    expect(
      resolveGateFromSignals({
        formAnswers: [{ passed: true }],
        whatsappAnswers: [{ passed: false }],
        cvMissingMustHaves: ["x"],
      }),
    ).toEqual({ status: "passed" });

    const failed = resolveGateFromSignals({ formAnswers: [{ passed: false }] });
    expect(failed.status).toBe("failed");
  });

  it("falls back to whatsapp when no form answers", () => {
    expect(resolveGateFromSignals({ whatsappAnswers: [{ passed: true }] })).toEqual({
      status: "passed",
    });
    expect(resolveGateFromSignals({ whatsappAnswers: [{ passed: false }] }).status).toBe("failed");
  });

  it("falls back to cv evidence only when no explicit answers", () => {
    expect(resolveGateFromSignals({ cvMissingMustHaves: ["AWS"] }).status).toBe("failed");
    expect(resolveGateFromSignals({ cvMissingMustHaves: [] })).toEqual({ status: "passed" });
    expect(resolveGateFromSignals({})).toEqual({ status: "passed" });
  });
});

describe("parseYesNo", () => {
  it.each([
    ["yes", true],
    ["Y", true],
    ["Yes please", true],
    ["no", false],
    ["NOPE", false],
    ["2", false],
  ])("parses %s", (input, expected) => {
    expect(parseYesNo(input)).toBe(expected);
  });

  it("returns null for ambiguous input", () => {
    expect(parseYesNo("maybe")).toBeNull();
    expect(parseYesNo("")).toBeNull();
  });

  it("treats idiomatic 'no problem/issues/doubt' acknowledgements as ambiguous, not NO", () => {
    // These usually signal agreement; parsing them as NO wrongly gates candidates out.
    expect(parseYesNo("no problem yes I can join")).toBeNull();
    expect(parseYesNo("No problem")).toBeNull();
    expect(parseYesNo("no issues, I have 5 years of experience")).toBeNull();
    expect(parseYesNo("no issue at all")).toBeNull();
    expect(parseYesNo("no doubt I can work onsite")).toBeNull();
    // Plain negatives still parse as NO.
    expect(parseYesNo("no")).toBe(false);
    expect(parseYesNo("nope")).toBe(false);
    expect(parseYesNo("no, I don't have that")).toBe(false);
  });
});

describe("missingCvEvidence", () => {
  it("flags must-haves absent from the resume", () => {
    const resume = "Senior backend engineer with kubernetes and postgres experience";
    const missing = missingCvEvidence(resume, [
      { text: "kubernetes" },
      { text: "salesforce administration" },
    ]);
    expect(missing).toEqual(["salesforce administration"]);
  });
});

describe("config timing knobs", () => {
  const keys = [
    "PRESCREEN_REMINDER_HOURS",
    "PRESCREEN_TIMEOUT_HOURS",
    "PRESCREEN_PENDING_SWEEP_BUFFER_HOURS",
  ];
  afterEach(() => {
    for (const k of keys) delete process.env[k];
  });

  it("uses defaults when unset", () => {
    expect(prescreenReminderHours()).toBe(24);
    expect(prescreenTimeoutHours()).toBe(48);
    expect(prescreenPendingSweepBufferHours()).toBe(6);
  });

  it("honours env overrides (fast-timeout soaks)", () => {
    process.env.PRESCREEN_REMINDER_HOURS = "0.01";
    process.env.PRESCREEN_TIMEOUT_HOURS = "0.02";
    expect(prescreenReminderHours()).toBeCloseTo(0.01);
    expect(prescreenTimeoutHours()).toBeCloseTo(0.02);
  });

  it("ignores invalid env values", () => {
    process.env.PRESCREEN_TIMEOUT_HOURS = "not-a-number";
    expect(prescreenTimeoutHours()).toBe(48);
  });
});
