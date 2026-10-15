import { createHash } from "node:crypto";

const SOURCE_PRIORITY: Record<string, number> = {
  greenhouse: 4,
  lever: 3,
  adzuna: 2,
  jsearch: 1,
  tigerhire: 10,
};

export function buildDedupFingerprint(input: {
  title: string;
  company: string;
  city: string;
  description: string;
}): string {
  const payload = [
    normalize(input.title),
    normalize(input.company),
    input.city,
    normalize(input.description).slice(0, 200),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function choosePreferredRecord<T extends { posted_at: string | null; source: string }>(
  records: T[],
): T {
  return [...records].sort((a, b) => {
    const aTs = a.posted_at ? new Date(a.posted_at).getTime() : 0;
    const bTs = b.posted_at ? new Date(b.posted_at).getTime() : 0;
    if (aTs !== bTs) return bTs - aTs;
    const aPriority = SOURCE_PRIORITY[a.source] ?? 0;
    const bPriority = SOURCE_PRIORITY[b.source] ?? 0;
    return bPriority - aPriority;
  })[0];
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
