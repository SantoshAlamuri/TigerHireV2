import type { JdSectionsLegacy } from "@/lib/validations/jobs";
import type { JdSection } from "@/components/dashboard/JDWizard/types";
import { normalizeSections } from "@/lib/jobs/normalize-sections";

/**
 * Build a job description string from legacy fixed-schema JD sections.
 * Kept for backward compatibility with old data.
 */
export function buildDescription(sections: JdSectionsLegacy | undefined | null): string {
  if (!sections) return "";
  const parts: string[] = [];

  if (sections.aboutCompany && sections.aboutCompany !== "Not specified") {
    parts.push(`About the Company:\n${sections.aboutCompany}`);
  }
  if (sections.designation) {
    parts.push(`Designation: ${sections.designation}`);
  }
  if (sections.reportingTo && sections.reportingTo !== "Not specified") {
    parts.push(`Reporting To: ${sections.reportingTo}`);
  }
  if (sections.rolesAndResponsibilities?.length) {
    parts.push(
      `Roles & Responsibilities:\n${sections.rolesAndResponsibilities.map((r) => `• ${r}`).join("\n")}`,
    );
  }
  const allSkills: string[] = [];
  if (sections.technicalSkills?.length)
    allSkills.push(`Technical: ${sections.technicalSkills.join(", ")}`);
  if (sections.leadershipSkills?.length)
    allSkills.push(`Leadership: ${sections.leadershipSkills.join(", ")}`);
  if (sections.softSkills?.length) allSkills.push(`Soft Skills: ${sections.softSkills.join(", ")}`);
  if (allSkills.length) parts.push(`Skills Required:\n${allSkills.join("\n")}`);
  if (sections.preferredSkills?.length)
    parts.push(`Preferred Skills:\n${sections.preferredSkills.map((s) => `• ${s}`).join("\n")}`);
  if (sections.niceToHave?.length)
    parts.push(`Nice to Have:\n${sections.niceToHave.map((s) => `• ${s}`).join("\n")}`);
  if (sections.educationRequirements && sections.educationRequirements !== "Not specified")
    parts.push(`Education: ${sections.educationRequirements}`);
  if (sections.benefits?.length)
    parts.push(`Benefits & Perks:\n${sections.benefits.map((b) => `• ${b}`).join("\n")}`);

  return parts.join("\n\n");
}

/**
 * Build a job description string from dynamic v2 sections.
 */
export function buildDescriptionFromDynamic(sections: JdSection[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    if (section.type === "text") {
      const text = typeof section.value === "string" ? section.value.trim() : "";
      if (text && text !== "Not specified") {
        parts.push(`${section.label}:\n${text}`);
      }
    } else if (section.type === "list") {
      const items = Array.isArray(section.value) ? section.value : [];
      if (items.length) {
        parts.push(`${section.label}:\n${items.map((item) => `• ${item}`).join("\n")}`);
      }
    } else if (section.type === "tags") {
      const tags = Array.isArray(section.value) ? section.value : [];
      if (tags.length) {
        parts.push(`${section.label}: ${tags.join(", ")}`);
      }
    }
  }

  return parts.join("\n\n");
}

/**
 * Auto-detect format and build description from raw jd_sections JSONB.
 */
export function buildDescriptionAuto(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const obj = raw as Record<string, unknown>;

  if (obj.version === 2 && Array.isArray(obj.sections)) {
    return buildDescriptionFromDynamic(obj.sections as JdSection[]);
  }

  const normalized = normalizeSections(raw);
  if (normalized.length > 0) {
    return buildDescriptionFromDynamic(normalized);
  }

  return "";
}
