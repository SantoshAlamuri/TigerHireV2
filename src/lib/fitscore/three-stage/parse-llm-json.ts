/**
 * Parse JSON from LLM response. Strips markdown code fences (e.g. ```json ... ```)
 * so that JSON.parse does not fail when the model returns wrapped output.
 * Handles trailing text after closing fence, missing closing fence, and truncated JSON.
 */
export function parseJsonFromLLM<T = unknown>(text: string): T {
  let trimmed = text.trim();
  // Strip leading fence: ```json or ``` plus optional newline
  const leadingFence = /^```(?:json)?\s*\n?/i;
  if (leadingFence.test(trimmed)) {
    trimmed = trimmed.replace(leadingFence, "").trim();
  }
  // Strip trailing fence and any text after it (model may add commentary)
  const closingFence = /\n?```\s*[\s\S]*$/;
  if (closingFence.test(trimmed)) {
    trimmed = trimmed.replace(closingFence, "").trim();
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Try to repair truncated JSON by appending closing chars (unterminated string / cut-off response)
    const repaired = tryRepairTruncatedJson(trimmed);
    if (repaired !== null) return JSON.parse(repaired) as T;
    throw new Error("LLM returned invalid or truncated JSON. Try again or shorten the CV content.");
  }
}

/** Try appending closing quotes/brackets so truncated JSON parses. */
function tryRepairTruncatedJson(str: string): string | null {
  const suffixes = ['"', '"}', '"}]', '"}]}', '"]', '"]}', '"},\n]}\n}', '"}\n]}\n}'];
  for (const suffix of suffixes) {
    try {
      const candidate = str + suffix;
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
