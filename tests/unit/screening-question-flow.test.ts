import { describe, expect, it } from "vitest";
import { shouldRepromptOnInvalidAnswer, validateAnswerFormat } from "@/lib/screening/question-flow";

describe("validateAnswerFormat", () => {
  it("validates numeric answers", () => {
    expect(validateAnswerFormat({ answer: "60", expected: "number" })).toBe(true);
    expect(validateAnswerFormat({ answer: "around sixty", expected: "number" })).toBe(false);
  });

  it("validates enum answers", () => {
    expect(
      validateAnswerFormat({
        answer: "2",
        expected: "enum",
        enumValues: ["1", "2", "3"],
      }),
    ).toBe(true);
    expect(
      validateAnswerFormat({
        answer: "4",
        expected: "enum",
        enumValues: ["1", "2", "3"],
      }),
    ).toBe(false);
  });
});

describe("shouldRepromptOnInvalidAnswer", () => {
  it("reprompts on first invalid format", () => {
    expect(
      shouldRepromptOnInvalidAnswer({
        answer: "about twenty five",
        expected: "number",
        repromptCount: 0,
      }),
    ).toBe(true);
  });

  it("accepts second invalid response without reprompting again", () => {
    expect(
      shouldRepromptOnInvalidAnswer({
        answer: "still unsure",
        expected: "number",
        repromptCount: 1,
      }),
    ).toBe(false);
  });
});
