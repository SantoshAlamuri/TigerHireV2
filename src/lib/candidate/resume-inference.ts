/**
 * Heuristics that turn a parsed résumé title/seniority string into the app's
 * canonical onboarding values. These are best-guess *suggestions* the candidate
 * can override — kept here (and unit-tested) so the mappings are easy to tune.
 */

export const SENIORITY_LEVELS = [
  "Intern",
  "Junior",
  "Mid",
  "Senior",
  "Lead",
  "Manager",
  "Director",
  "VP",
  "C-Suite",
] as const;

export const ROLE_FUNCTIONS = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "HR",
  "Finance",
  "Operations",
  "Marketing",
] as const;

/** Snap a free-text seniority (e.g. "Sr. Software Engineer", "SDE II") to a valid level. */
export function normalizeSeniority(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toLowerCase();
  if (!s.trim()) return null;
  if (/\b(intern|trainee|apprentice)\b/.test(s)) return "Intern";
  if (/\b(chief|c-?suite|cxo|ceo|cto|cfo|coo|founder)\b/.test(s)) return "C-Suite";
  if (/\b(vp|vice[- ]president|svp|evp)\b/.test(s)) return "VP";
  if (/\b(director|head of|head,)\b/.test(s)) return "Director";
  if (/\b(manager|mgr|management)\b/.test(s)) return "Manager";
  if (/\b(lead|staff|principal|architect)\b/.test(s)) return "Lead";
  if (/\b(senior|sr\.?)\b/.test(s) || /\b(sde ?(2|3|ii|iii)|level ?[3-5])\b/.test(s))
    return "Senior";
  if (/\b(junior|jr\.?|entry|graduate|associate|fresher)\b/.test(s) || /\bsde ?(0|1|i)\b/.test(s))
    return "Junior";
  if (/\b(mid|intermediate)\b/.test(s)) return "Mid";
  const exact = SENIORITY_LEVELS.find((x) => x.toLowerCase() === s.trim());
  return exact ?? null;
}

/** Best-guess role function from a job title — a suggestion the candidate can change. */
export function inferRoleFunction(title: string | null | undefined): string | null {
  const t = (title ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (
    /(engineer|developer|programmer|sde|swe|devops|sre|backend|frontend|full[- ]?stack|data scientist|machine learning|\bml\b|\bqa\b|architect)/.test(
      t,
    )
  )
    return "Engineering";
  if (/(product manager|product owner|\bpm\b|product lead|head of product)/.test(t))
    return "Product";
  if (/(design|\bux\b|\bui\b|researcher)/.test(t)) return "Design";
  if (/(sales|account executive|business development|\bbd\b|revenue)/.test(t)) return "Sales";
  if (/(recruit|talent|\bhr\b|people ops|human resources)/.test(t)) return "HR";
  if (/(finance|account|controller|fp&a|treasury|audit)/.test(t)) return "Finance";
  if (/(operations|\bops\b|supply chain|logistics)/.test(t)) return "Operations";
  if (/(marketing|growth|brand|content|seo|demand gen)/.test(t)) return "Marketing";
  return null;
}
