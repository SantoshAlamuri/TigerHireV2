import type { JdSectionsView } from "@/types";

export type JdSectionEntry = [keyof JdSectionsView, string | string[]];

export function getJdSectionEntries(jdSections: JdSectionsView | undefined): JdSectionEntry[] {
  if (!jdSections) return [];
  return Object.entries(jdSections).filter(
    ([, value]) =>
      value != null && (Array.isArray(value) ? value.length > 0 : String(value).trim() !== ""),
  ) as JdSectionEntry[];
}

/** Raw `description` duplicates structured `jd_sections` when both are populated. */
export function shouldShowRawJobDescription(
  jdTextRaw: string,
  sectionsEntries: JdSectionEntry[],
): boolean {
  return Boolean(jdTextRaw.trim()) && sectionsEntries.length === 0;
}

/** Skill pills duplicate content already rendered from structured `jd_sections`. */
export function shouldShowSkillPills(sectionsEntries: JdSectionEntry[]): boolean {
  return sectionsEntries.length === 0;
}

/**
 * Hiring-request must/nice fields duplicate generated JD text when the full
 * `description` is already shown, or when structured `jd_sections` exist.
 * Only surface them when they are the sole extra detail (short/empty description).
 */
export function shouldShowHiringRequestSections(
  showRawDescription: boolean,
  sectionsEntries: JdSectionEntry[],
): boolean {
  if (sectionsEntries.length > 0) return false;
  if (showRawDescription) return false;
  return true;
}
