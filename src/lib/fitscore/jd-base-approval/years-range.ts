export type RoleLevel = "junior" | "mid" | "senior" | "lead";

const LEVEL_TO_RANGE: Record<RoleLevel, { min: number; max: number; label: string }> = {
  junior: { min: 0, max: 2, label: "0-2 years" },
  mid: { min: 2, max: 5, label: "2-5 years" },
  senior: { min: 5, max: 8, label: "5-8 years" },
  lead: { min: 8, max: 15, label: "8+ years" },
};

export function roleLevelFromYearsRange(yearsRange: string): RoleLevel {
  const parsed = parseYearsRange(yearsRange);
  if (!parsed) return "mid";
  const mid = (parsed.min + parsed.max) / 2;
  if (mid < 2) return "junior";
  if (mid < 5) return "mid";
  if (mid < 8) return "senior";
  return "lead";
}

export function parseYearsRange(yearsRange: string): { min: number; max: number } | null {
  const t = yearsRange.trim().toLowerCase();
  const range = t.match(/(\d+)\s*[-–to]+\s*(\d+)/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const plus = t.match(/(\d+)\s*\+/);
  if (plus) return { min: Number(plus[1]), max: Number(plus[1]) + 7 };
  const single = t.match(/(\d+)/);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n + 2 };
  }
  return null;
}

export function formatYearsRange(min: number, max: number): string {
  if (min === max) return `${min} years`;
  return `${min}-${max} years`;
}

export function yearsRangeForLevel(level: RoleLevel): string {
  return LEVEL_TO_RANGE[level].label;
}

export function suggestLevelFromJobText(jobText: string): RoleLevel {
  const t = jobText.toLowerCase();
  if (/\b(junior|associate|entry[\s-]?level|0\s*[-–]\s*2|1\s*[-–]\s*2)\b/.test(t)) {
    return "junior";
  }
  if (/\b(lead|principal|staff|architect|head of)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
  const yr = t.match(/(\d+)\s*[-–]\s*(\d+)\s*years?/);
  if (yr) {
    const mid = (Number(yr[1]) + Number(yr[2])) / 2;
    if (mid < 2.5) return "junior";
    if (mid < 5) return "mid";
    if (mid < 8) return "senior";
  }
  return "mid";
}
