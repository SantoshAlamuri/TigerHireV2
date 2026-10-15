import { describe, it, expect } from "vitest";
import {
  evaluateScreeningAnswers,
  parseScreeningOptions,
  type JobScreeningQuestionRow,
  type ScreeningOption,
} from "@/lib/screening/job-screening";
import { parseOptionReply } from "@/lib/prescreen/interactive";

const Q = (id: string, fail: boolean, order = 0): JobScreeningQuestionRow => ({
  id,
  question_text: "Q",
  fail_on_yes: fail,
  sort_order: order,
  is_active: true,
  answer_type: "yes_no",
  options: null,
});

const SEL = (id: string, options: ScreeningOption[], order = 0): JobScreeningQuestionRow => ({
  id,
  question_text: "Q",
  fail_on_yes: false,
  sort_order: order,
  is_active: true,
  answer_type: "single_select",
  options,
});

describe("evaluateScreeningAnswers", () => {
  it("allows empty when no questions", () => {
    const r = evaluateScreeningAnswers([], null);
    expect(r).toEqual({ ok: true });
  });

  it("fails on incomplete", () => {
    const r = evaluateScreeningAnswers(
      [Q("a1", true), Q("a2", true)],
      [{ questionId: "a1", answerYes: false }],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("incomplete");
    }
  });

  it("fails knockout when fail_on_yes and user answers yes", () => {
    const r = evaluateScreeningAnswers([Q("a1", true)], [{ questionId: "a1", answerYes: true }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("knockout");
    }
  });

  it("passes when fail_on_yes and user answers no", () => {
    const r = evaluateScreeningAnswers([Q("a1", true)], [{ questionId: "a1", answerYes: false }]);
    expect(r).toEqual({ ok: true });
  });

  it("fails knockout when fail_on_no and user answers no (fail_on_yes false)", () => {
    const r = evaluateScreeningAnswers(
      [Q("a1", false)], // "No" fails
      [{ questionId: "a1", answerYes: false }],
    );
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate question ids in payload", () => {
    const r = evaluateScreeningAnswers(
      [Q("a1", true)],
      [
        { questionId: "a1", answerYes: false },
        { questionId: "a1", answerYes: false },
      ],
    );
    expect(r.ok).toBe(false);
  });
});

describe("evaluateScreeningAnswers — single_select", () => {
  const opts: ScreeningOption[] = [
    { label: "Citizen", knockout: false },
    { label: "PR", knockout: false },
    { label: "Needs sponsorship", knockout: true },
  ];

  it("passes when a non-knockout option is chosen", () => {
    const r = evaluateScreeningAnswers([SEL("s1", opts)], [{ questionId: "s1", answerText: "PR" }]);
    expect(r).toEqual({ ok: true });
  });

  it("knocks out when a knockout option is chosen", () => {
    const r = evaluateScreeningAnswers(
      [SEL("s1", opts)],
      [{ questionId: "s1", answerText: "Needs sponsorship" }],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("knockout");
  });

  it("is incomplete when the answer matches no option", () => {
    const r = evaluateScreeningAnswers(
      [SEL("s1", opts)],
      [{ questionId: "s1", answerText: "Maybe" }],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("incomplete");
  });

  it("matches option labels case-insensitively", () => {
    const r = evaluateScreeningAnswers(
      [SEL("s1", opts)],
      [{ questionId: "s1", answerText: "citizen" }],
    );
    expect(r).toEqual({ ok: true });
  });
});

describe("parseScreeningOptions", () => {
  it("parses valid options and drops blanks", () => {
    const parsed = parseScreeningOptions([
      { label: "A", knockout: true },
      { label: "  ", knockout: false },
      { label: "B" },
    ]);
    expect(parsed).toEqual([
      { label: "A", knockout: true },
      { label: "B", knockout: false },
    ]);
  });

  it("returns [] for non-arrays", () => {
    expect(parseScreeningOptions(null)).toEqual([]);
    expect(parseScreeningOptions("x")).toEqual([]);
  });
});

describe("parseOptionReply", () => {
  const labels = ["Citizen", "PR", "Needs sponsorship"];
  it("parses a 1-based number to the label", () => {
    expect(parseOptionReply("2", labels)).toBe("PR");
  });
  it("parses the option text case-insensitively", () => {
    expect(parseOptionReply("needs sponsorship", labels)).toBe("Needs sponsorship");
  });
  it("returns null for out-of-range or unknown", () => {
    expect(parseOptionReply("9", labels)).toBeNull();
    expect(parseOptionReply("nope", labels)).toBeNull();
  });
});
