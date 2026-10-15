/** Quick name guess from resume text — no LLM (tryout fast path). */
export function inferNameFromResumeText(text: string, fallback: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 60);

  for (const line of lines.slice(0, 10)) {
    if (/^(curriculum vitae|resume|cv|profile|summary)$/i.test(line)) continue;
    if (/^\d/.test(line) || line.includes("@") || line.includes("http")) continue;
    if (/^[A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){1,3}$/.test(line)) return line;
  }

  return fallback;
}
