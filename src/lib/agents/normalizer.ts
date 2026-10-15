import type { ParsedCV } from "@/lib/agents/schemas";

const SKILL_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  nodejs: "node.js",
  "node js": "node.js",
  reactjs: "react",
  "react js": "react",
  "next js": "next.js",
  postgres: "postgresql",
  gcp: "google cloud",
  aws: "amazon web services",
};

function normalizeSkillName(input: string): string {
  const base = input.trim().toLowerCase().replace(/\s+/g, " ");
  const canonical = SKILL_ALIASES[base] ?? base;
  return canonical.slice(0, 60);
}

function dedupeSkills(skills: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    const normalized = normalizeSkillName(skill);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 50) break;
  }
  return out;
}

function normalizeCompanyName(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .trim()
    .replace(/\b(pvt\.?\s*ltd\.?|private limited)\b/gi, "Pvt Ltd")
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

function normalizeLocation(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().replace(/\s+/g, " ").slice(0, 100);
}

export function normalizeParsedCV(parsed: ParsedCV): ParsedCV {
  const canonical_skills = dedupeSkills(parsed.canonical_skills);
  const salaryMin = parsed.salary_expectation_min ?? null;
  const salaryMax = parsed.salary_expectation_max ?? null;
  const phoneTrim =
    parsed.phone == null || typeof parsed.phone !== "string"
      ? null
      : parsed.phone.trim().slice(0, 40) || null;

  return {
    ...parsed,
    phone: phoneTrim,
    canonical_skills,
    current_company: normalizeCompanyName(parsed.current_company),
    location_city: normalizeLocation(parsed.location_city),
    salary_expectation_min: salaryMin,
    salary_expectation_max:
      salaryMax !== null && salaryMin !== null && salaryMax < salaryMin ? salaryMin : salaryMax,
  };
}
