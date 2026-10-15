/** Sequential Yes/No prompt formatting + answer parsing (channel-agnostic, pure). */

import { prescreenQuestionText } from "@/lib/prescreen/messages";
import type { PrescreenQuestionRow } from "@/lib/prescreen/types";

const YES = new Set(["yes", "y", "yeah", "yep", "yup", "1", "true", "✅"]);
const NO = new Set(["no", "n", "nope", "nah", "2", "false", "❌"]);

/**
 * Parse a free-text or button reply into a yes/no.
 * Returns null when the reply is ambiguous (caller should re-prompt).
 */
/**
 * Idiomatic acknowledgements that START with a NO-word but usually signal
 * agreement ("no problem, yes I can", "no issues", "no doubt I have 5 years").
 * Treating them as NO wrongly gates candidates out; treat as ambiguous instead
 * so the caller re-prompts. Plain "no"/"nope"/"nah" still parse as NO.
 */
const AMBIGUOUS_NO_IDIOM = /^no\s+(problem|issues?|doubt)\b/;

export function parseYesNo(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (YES.has(t)) return true;
  if (NO.has(t)) return false;
  if (AMBIGUOUS_NO_IDIOM.test(t)) return null;
  // Button replies arrive as titles like "Yes" / "No"; also tolerate leading word.
  const first = t.split(/[\s,.!?]+/)[0];
  if (YES.has(first)) return true;
  if (NO.has(first)) return false;
  return null;
}

/**
 * Parse a reply to a single-select question into the chosen option LABEL.
 * Accepts a 1-based number ("2") or the option text itself (case-insensitive).
 * Returns null when it doesn't match any option (caller should re-prompt).
 */
export function parseOptionReply(raw: string, optionLabels: string[]): string | null {
  const t = raw.trim().toLowerCase();
  if (!t || optionLabels.length === 0) return null;
  const asNum = Number(t);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= optionLabels.length) {
    return optionLabels[asNum - 1];
  }
  const matched = optionLabels.find((o) => o.trim().toLowerCase() === t);
  return matched ?? null;
}

/** Format the prompt for the question at `index` of `questions`. */
export function formatQuestionPrompt(
  questions: PrescreenQuestionRow[],
  index: number,
): string | null {
  const q = questions[index];
  if (!q) return null;
  return prescreenQuestionText(index, questions.length, q.question_text);
}
