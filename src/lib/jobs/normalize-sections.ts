import { nanoid } from "nanoid";
import type { JdSection, DynamicJdSections } from "@/components/dashboard/JDWizard/types";

/**
 * Legacy key → label/type mapping for converting old fixed-schema jdSections
 * to the new dynamic array format.
 */
const LEGACY_KEY_MAP: Record<string, { label: string; type: "text" | "list" | "tags" }> = {
  designation: { label: "Designation", type: "text" },
  reportingTo: { label: "Reporting To", type: "text" },
  aboutCompany: { label: "About the Company", type: "text" },
  rolesAndResponsibilities: { label: "Roles & Responsibilities", type: "list" },
  technicalSkills: { label: "Technical Skills", type: "tags" },
  leadershipSkills: { label: "Leadership Skills", type: "tags" },
  softSkills: { label: "Soft Skills", type: "tags" },
  preferredSkills: { label: "Preferred Skills", type: "list" },
  niceToHave: { label: "Nice to Have", type: "list" },
  benefits: { label: "Benefits & Perks", type: "list" },
  educationRequirements: { label: "Education Requirements", type: "text" },
  employmentType: { label: "Employment Type", type: "text" },
  experienceRange: { label: "Experience Required", type: "text" },
  noticePeriod: { label: "Notice Period", type: "text" },
};

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim() || v === "Not specified";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Convert legacy fixed-schema jdSections object to dynamic section array.
 */
function legacyToSections(raw: Record<string, unknown>): JdSection[] {
  const sections: JdSection[] = [];
  for (const [key, mapping] of Object.entries(LEGACY_KEY_MAP)) {
    const value = raw[key];
    if (isEmptyValue(value)) continue;

    sections.push({
      id: nanoid(8),
      label: mapping.label,
      type: mapping.type,
      value: (mapping.type === "text" ? String(value) : value) as string | string[],
    });
  }
  return sections;
}

/**
 * Normalize raw jd_sections JSONB from DB into a JdSection array.
 * Handles both v2 (dynamic) and legacy (fixed-schema) formats.
 */
export function normalizeSections(raw: unknown): JdSection[] {
  if (!raw || typeof raw !== "object") return [];

  const obj = raw as Record<string, unknown>;

  if (obj.version === 2 && Array.isArray(obj.sections)) {
    return obj.sections as JdSection[];
  }

  return legacyToSections(obj);
}

/**
 * Wrap a section array into the DB-ready DynamicJdSections envelope.
 */
export function toDynamicJdSections(sections: JdSection[]): DynamicJdSections {
  return { version: 2, sections };
}

/**
 * Extract required/preferred skill arrays from dynamic sections.
 * Used at submit time and in hiring-request auto-generation.
 */
export function extractSkillsFromSections(sections: JdSection[]): {
  required: string[];
  preferred: string[];
} {
  const required: string[] = [];
  const preferred: string[] = [];
  for (const section of sections) {
    const lower = section.label.toLowerCase();
    const values = Array.isArray(section.value) ? section.value : [];
    if (
      lower.includes("technical") ||
      lower.includes("soft skill") ||
      lower.includes("leadership") ||
      (lower.includes("skill") && !lower.includes("prefer") && !lower.includes("nice"))
    ) {
      required.push(...values);
    } else if (lower.includes("preferred") || lower.includes("nice to have")) {
      preferred.push(...values);
    }
  }
  return { required: [...new Set(required)], preferred: [...new Set(preferred)] };
}

/**
 * Extract a legacy-compatible JdSectionsView object from dynamic sections,
 * matching labels to known legacy keys. Used by mappers and distribution connectors.
 */
export function toLegacyView(sections: JdSection[]): Record<string, unknown> {
  const view: Record<string, unknown> = {};

  const labelToKey: Record<string, string> = {};
  for (const [key, mapping] of Object.entries(LEGACY_KEY_MAP)) {
    labelToKey[mapping.label.toLowerCase()] = key;
  }

  for (const section of sections) {
    const lower = section.label.toLowerCase();
    const key = labelToKey[lower];
    if (key) {
      view[key] = section.value;
    }
    // Also try fuzzy matching for common variants
    if (!key) {
      if (lower.includes("technical") && lower.includes("skill"))
        view.technicalSkills = section.value;
      else if (lower.includes("leadership") && lower.includes("skill"))
        view.leadershipSkills = section.value;
      else if (lower.includes("soft") && lower.includes("skill")) view.softSkills = section.value;
      else if (lower.includes("responsibilit")) view.rolesAndResponsibilities = section.value;
      else if (lower.includes("about") && lower.includes("company"))
        view.aboutCompany = section.value;
      else if (lower.includes("benefit") || lower.includes("perk")) view.benefits = section.value;
      else if (lower.includes("education") || lower.includes("qualification"))
        view.educationRequirements = section.value;
      else if (lower.includes("nice to have") || lower.includes("bonus"))
        view.niceToHave = section.value;
      else if (lower.includes("preferred")) view.preferredSkills = section.value;
      else if (lower.includes("employment") && lower.includes("type"))
        view.employmentType = section.value;
      else if (lower.includes("experience")) view.experienceRange = section.value;
      else if (lower.includes("notice")) view.noticePeriod = section.value;
      else if (lower.includes("reporting")) view.reportingTo = section.value;
      else if (lower.includes("designation")) view.designation = section.value;
    }
  }

  return view;
}
