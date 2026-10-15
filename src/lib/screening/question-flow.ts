export type QuestionExpectedFormat = "number" | "yes_no" | "free_text" | "enum";

export function validateAnswerFormat(args: {
  answer: string;
  expected?: QuestionExpectedFormat;
  enumValues?: string[];
}): boolean {
  const answer = args.answer.trim();
  if (!args.expected || args.expected === "free_text") return answer.length > 0;
  if (args.expected === "number") return /^-?\d+(\.\d+)?$/.test(answer);
  if (args.expected === "yes_no") return /^(yes|no|y|n)$/i.test(answer);
  if (args.expected === "enum") {
    if (!args.enumValues || args.enumValues.length === 0) return answer.length > 0;
    return args.enumValues.map((value) => value.toLowerCase()).includes(answer.toLowerCase());
  }
  return true;
}

export function shouldRepromptOnInvalidAnswer(args: {
  answer: string;
  expected?: QuestionExpectedFormat;
  enumValues?: string[];
  repromptCount: number;
}): boolean {
  const valid = validateAnswerFormat({
    answer: args.answer,
    expected: args.expected,
    enumValues: args.enumValues,
  });
  return !valid && args.repromptCount < 1;
}
