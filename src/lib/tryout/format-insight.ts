const STRUCTURED_SECTION_RE =
  /\n\s*(?:red\s*flags?|strengths?|gaps?|highlights?|insights?|key\s+(?:strengths|gaps|concerns)|watch[\s-]?items?)\s*:/i;

const FITSCORE_LEAD_RE = /^(?:FitScore|Score)\s+\d+/i;

/** Recruiter-facing blurb only — no embedded flag lists or FitScore lead lines. */
export function tryoutCardSummary(...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    const text = raw?.trim();
    if (!text) continue;

    const withoutLead = text
      .split(/\n\n+/)
      .filter((part) => !FITSCORE_LEAD_RE.test(part.trim()))
      .join("\n\n")
      .trim();

    const sectionIdx = withoutLead.search(STRUCTURED_SECTION_RE);
    const narrative = sectionIdx >= 0 ? withoutLead.slice(0, sectionIdx).trim() : withoutLead;

    const firstParagraph = narrative.split(/\n\n+/)[0]?.replace(/\s+/g, " ").trim();
    if (firstParagraph && firstParagraph.length >= 20) return firstParagraph;
  }

  return "";
}

export function tryoutExplanationPayload(params: {
  explanationText?: string;
  summary?: string | null;
  greenFlags: string[];
  redFlags: string[];
  verdict?: string | null;
}) {
  const narrative = tryoutCardSummary(
    params.summary,
    params.explanationText?.split(/\n\n+/).slice(1).join("\n\n"),
    params.explanationText,
  );

  return {
    one_line_summary: narrative,
    key_strengths: params.greenFlags.slice(0, 5),
    key_gaps: params.redFlags.slice(0, 5),
    verdict: params.verdict ?? null,
  };
}
