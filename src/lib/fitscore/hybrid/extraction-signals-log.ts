/**
 * Structured extraction signals for training / audit (logged on every score, no scoring impact).
 */

import type { IdealCandidateProfile } from "./ideal-profile";
import type { CandidateExtraction } from "./types";

export interface ExtractionSignalsLog {
  must_haves_matched: string[];
  must_haves_missed: string[];
  nice_to_haves_matched: string[];
  nice_to_haves_missed: string[];
  certifications_found: string[];
  traits_evidenced: string[];
  traits_not_evidenced: string[];
  background_signals_evidenced: string[];
  background_signals_not_evidenced: string[];
  years_relevant: number;
  quantified_achievements: number;
  average_tenure_months: number | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

function textBlob(extraction: CandidateExtraction, resumeText?: string): string {
  const parts = [
    extraction.summary ?? "",
    ...(extraction.green_flags ?? []),
    ...(extraction.quantified_impact ?? []),
    resumeText ?? "",
  ];
  return normalize(parts.join(" "));
}

function matchesRequirement(blob: string, requirement: string): boolean {
  const req = normalize(requirement.trim());
  if (!req || req.length < 3) return false;
  if (blob.includes(req)) return true;
  const tokens = req.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => blob.includes(t)).length;
  return hits >= Math.min(2, tokens.length) || hits / tokens.length >= 0.6;
}

function traitEvidenceLabel(trait: string, blob: string): string | null {
  const t = normalize(trait);
  const ownership =
    /\b(owned|ownership|initiated|proposed|led|drove|without being asked)\b/.test(blob) &&
    /(own|lead|initiat|responsib)/.test(t);
  const communication =
    /\b(wrote|documented|reported|stakeholder|communicat|email|present)\b/.test(blob) &&
    /(communicat|writ|verbal)/.test(t);
  const independent =
    /\b(independently|autonomous|self-directed|solo)\b/.test(blob) &&
    /(independent|autonom)/.test(t);
  if (ownership) return `${trait} (ownership language detected)`;
  if (communication) return `${trait} (communication mentions)`;
  if (independent) return `${trait} (independent work mentions)`;
  if (matchesRequirement(blob, trait)) return trait;
  return null;
}

export function buildExtractionSignalsLog(params: {
  extraction: CandidateExtraction;
  idealProfile?: IdealCandidateProfile | null;
  resumeText?: string;
}): ExtractionSignalsLog {
  const { extraction, idealProfile } = params;
  const blob = textBlob(extraction, params.resumeText);
  const mustHaves = idealProfile?.must_haves ?? [];
  const niceToHaves = idealProfile?.nice_to_haves ?? [];
  const traits = idealProfile?.traits ?? [];
  const backgrounds = idealProfile?.background_preferences ?? [];

  const must_haves_matched: string[] = [];
  const must_haves_missed: string[] = [];
  for (const mh of mustHaves) {
    if (matchesRequirement(blob, mh)) must_haves_matched.push(mh);
    else must_haves_missed.push(mh);
  }

  const nice_to_haves_matched: string[] = [];
  const nice_to_haves_missed: string[] = [];
  for (const nh of niceToHaves) {
    if (matchesRequirement(blob, nh)) nice_to_haves_matched.push(nh);
    else nice_to_haves_missed.push(nh);
  }

  const traits_evidenced: string[] = [];
  const traits_not_evidenced: string[] = [];
  for (const tr of traits) {
    const label = traitEvidenceLabel(tr, blob);
    if (label) traits_evidenced.push(label);
    else traits_not_evidenced.push(tr);
  }

  const background_signals_evidenced: string[] = [];
  const background_signals_not_evidenced: string[] = [];
  for (const bg of backgrounds) {
    if (matchesRequirement(blob, bg)) background_signals_evidenced.push(bg);
    else background_signals_not_evidenced.push(bg);
  }

  const certsFromExtraction = extraction.certifications ?? [];
  const certFromBenchmarks = (idealProfile?.benchmarks?.certifications ?? "")
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const certifications_found = [
    ...new Set([
      ...certsFromExtraction,
      ...certFromBenchmarks.filter((c) => matchesRequirement(blob, c)),
    ]),
  ];

  return {
    must_haves_matched,
    must_haves_missed,
    nice_to_haves_matched,
    nice_to_haves_missed,
    certifications_found,
    traits_evidenced,
    traits_not_evidenced,
    background_signals_evidenced,
    background_signals_not_evidenced,
    years_relevant: extraction.total_years ?? 0,
    quantified_achievements: extraction.quantified_impact?.length ?? 0,
    average_tenure_months: null,
  };
}
