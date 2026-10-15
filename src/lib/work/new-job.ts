/**
 * New job: turning the agent's reading of a messy note into a hiring request.
 *
 * Pure helpers, so the page stays about the conversation and the rules about
 * what counts as a must-have live in one tested place.
 */

export interface DraftSection {
  label: string;
  type?: string;
  value: string | string[];
}

export interface DraftMetadata {
  title?: string;
  location?: string;
  remoteAllowed?: boolean;
  /** Rupees per year, as the generate endpoint returns them. */
  compensationMin?: number;
  compensationMax?: number;
  experienceMin?: number | null;
  experienceMax?: number | null;
  summary?: string;
}

export interface Understood {
  title: string;
  location: string;
  experience: string;
  payMinLpa: string;
  payMaxLpa: string;
  mustHaves: string;
  niceToHaves: string;
  description: string;
}

const NICE = /nice|preferred|bonus|plus|good to have|desirable/i;
const MUST =
  /must|required|requirement|qualification|you.?ll need|what you need|skills|experience/i;

function items(v: string | string[]): string[] {
  const list = Array.isArray(v) ? v : v.split(/\n|•/);
  return list.map((s) => s.replace(/^[-*•\s]+/, "").trim()).filter((s) => s.length > 1);
}

/** Must-haves and nice-to-haves from the draft's sections, at most eight each. */
export function requirementsFromSections(sections: DraftSection[]): {
  must: string[];
  nice: string[];
} {
  const must: string[] = [];
  const nice: string[] = [];
  for (const s of sections) {
    if (NICE.test(s.label)) nice.push(...items(s.value));
    else if (MUST.test(s.label)) must.push(...items(s.value));
  }
  const uniq = (xs: string[]) => [...new Set(xs)].slice(0, 8);
  return { must: uniq(must), nice: uniq(nice) };
}

const lpa = (rupees: number | undefined) =>
  rupees && rupees > 0 ? String(Math.round((rupees / 100_000) * 10) / 10) : "";

export function understoodFromDraft(
  rawText: string,
  meta: DraftMetadata,
  sections: DraftSection[],
): Understood {
  const { must, nice } = requirementsFromSections(sections);
  const min = meta.experienceMin ?? null;
  const max = meta.experienceMax ?? null;
  const experience =
    min != null && max != null ? `${min} to ${max} years` : min != null ? `${min}+ years` : "";
  return {
    title: meta.title?.trim() ?? "",
    location: [meta.location?.trim(), meta.remoteAllowed ? "remote possible" : ""]
      .filter(Boolean)
      .join(", "),
    experience,
    payMinLpa: lpa(meta.compensationMin),
    payMaxLpa: lpa(meta.compensationMax),
    mustHaves: must.join("\n"),
    niceToHaves: nice.join("\n"),
    description: rawText.trim(),
  };
}

const toRupees = (lpaText: string): number | null => {
  const n = Number(lpaText.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100_000) : null;
};

/** The body for POST /api/hiring-requests, sent for approval (not as a draft). */
export function requestBody(u: Understood, note: string) {
  return {
    title: u.title.trim(),
    description: u.description.slice(0, 10_000) || null,
    mustHaves: u.mustHaves.trim().slice(0, 4000) || null,
    niceToHaves: u.niceToHaves.trim().slice(0, 4000) || null,
    idealExperience: u.experience.trim().slice(0, 200) || null,
    locationCity: u.location.trim().slice(0, 200) || null,
    budgetCtcMin: toRupees(u.payMinLpa),
    budgetCtcMax: toRupees(u.payMaxLpa),
    notes: note.trim().slice(0, 2000) || null,
    saveDraft: false,
  };
}

/** What is missing before the request can go. Empty means ready. */
export function missingForRequest(u: Understood): string[] {
  const out: string[] = [];
  if (!u.title.trim()) out.push("a title");
  if (!u.mustHaves.trim()) out.push("at least one must-have");
  return out;
}
