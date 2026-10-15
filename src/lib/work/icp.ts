/**
 * The ideal candidate profile (ICP): what the agent scores every CV against.
 *
 * Pure helpers for the must-haves editor, so the panel stays about the
 * conversation and the shape the backend expects lives in one tested place.
 */

export interface IdealCandidateProfile {
  summary: string;
  must_haves: string[];
  nice_to_haves: string[];
  years_range: string;
  benchmarks: Record<string, string>;
  traits?: string[];
  background_preferences?: string[];
}

export interface IcpDraft {
  summary: string;
  mustHaves: string;
  niceToHaves: string;
  years: string;
}

/** One item per line; bullets and blanks dropped, duplicates removed. */
export function linesToList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const t = raw.replace(/^[-*•\s]+/, "").trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function draftFromProfile(p: Partial<IdealCandidateProfile> | null | undefined): IcpDraft {
  return {
    summary: p?.summary ?? "",
    mustHaves: (p?.must_haves ?? []).filter(Boolean).join("\n"),
    niceToHaves: (p?.nice_to_haves ?? []).filter(Boolean).join("\n"),
    years: p?.years_range ?? "",
  };
}

/**
 * The profile to PUT. Keeps whatever the person did not edit (benchmarks,
 * traits, background) so saving here never wipes the agent's other work.
 */
export function profileFromDraft(
  d: IcpDraft,
  existing: Partial<IdealCandidateProfile> | null | undefined,
  fallbackSummary: string,
): IdealCandidateProfile {
  const summary = d.summary.trim() || existing?.summary?.trim() || fallbackSummary.trim() || "Role";
  const out: IdealCandidateProfile = {
    summary,
    must_haves: linesToList(d.mustHaves),
    nice_to_haves: linesToList(d.niceToHaves),
    years_range: d.years.trim(),
    benchmarks: existing?.benchmarks ?? {},
  };
  if (existing?.traits) out.traits = existing.traits;
  if (existing?.background_preferences)
    out.background_preferences = existing.background_preferences;
  return out;
}

/** What stops the profile being saved. Empty means ready. */
export function icpProblems(d: IcpDraft): string[] {
  const out: string[] = [];
  if (linesToList(d.mustHaves).length === 0) out.push("Add at least one must-have.");
  if (linesToList(d.mustHaves).length > 12)
    out.push("Keep it to 12 must-haves or fewer; move the rest to nice-to-haves.");
  return out;
}

export function draftChanged(a: IcpDraft, b: IcpDraft): boolean {
  return (
    a.summary.trim() !== b.summary.trim() ||
    linesToList(a.mustHaves).join("\n") !== linesToList(b.mustHaves).join("\n") ||
    linesToList(a.niceToHaves).join("\n") !== linesToList(b.niceToHaves).join("\n") ||
    a.years.trim() !== b.years.trim()
  );
}

/** The shortlist bar moves in fives and stays inside the backend's 0–100. */
export function nudgeFloor(current: number, delta: number): number {
  const v = Math.round((current + delta) / 5) * 5;
  return Math.max(0, Math.min(95, v));
}

/** Screening questions: one per line, at least 3 characters, capped per stage. */
export function questionsFromText(text: string, max: number): { list: string[]; problem?: string } {
  const list = linesToList(text);
  const short = list.find((q) => q.length < 3);
  if (short) return { list, problem: `"${short}" is too short to ask.` };
  const long = list.find((q) => q.length > 500);
  if (long) return { list, problem: "Keep each question under 500 characters." };
  if (list.length > max) return { list, problem: `Ask at most ${max} questions here.` };
  return { list };
}
