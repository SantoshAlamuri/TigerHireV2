import { z } from "zod";
import { ParsedCVSchema, SeniorityLevel, type ParsedCV } from "@/lib/agents/schemas";
import { logger } from "@/lib/observability/logger";

/**
 * Repairs applied to the CV parser's LLM output BEFORE schema validation.
 *
 * Why this exists (2026-09-16, prod candidate 56692e3c): a 21-year architect CV
 * was parsed successfully by the model four times (~₹11 of spend) and rejected
 * by our own Zod schema every time — the profile stayed empty, the recruiter saw
 * "No skills data available", and Inngest retried a deterministic failure at
 * full price. Every rule here is element-level tolerance (no `.catch([])` on
 * the schema, per AGENTS.md): fix what can be fixed, drop what cannot, and
 * report exactly what was touched so the degraded path stays visible.
 */

const MAX_SKILLS = 50;
const MAX_SKILL_LEN = 60;
const MAX_YEARS = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Seniority = z.infer<typeof SeniorityLevel>;
type Availability = NonNullable<ParsedCV["availability"]>;

/** Titles the text prompt allows (or the model invents) that the enum does not. */
const SENIORITY_ALIASES: Record<string, Seniority> = {
  vp: "director",
  "vice president": "director",
  svp: "director",
  evp: "director",
  avp: "head",
  "senior manager": "head",
  manager: "lead",
  principal: "lead",
  staff: "lead",
  architect: "lead",
  "tech lead": "lead",
  "team lead": "lead",
  cto: "c-suite",
  ceo: "c-suite",
  cfo: "c-suite",
  coo: "c-suite",
  cxo: "c-suite",
  founder: "c-suite",
  "co-founder": "c-suite",
  executive: "c-suite",
  "mid-level": "mid",
  midlevel: "mid",
  middle: "mid",
  intermediate: "mid",
  sr: "senior",
  "senior-level": "senior",
  jr: "junior",
  entry: "junior",
  "entry-level": "junior",
  fresher: "junior",
  associate: "junior",
  trainee: "intern",
  internship: "intern",
};

const AVAILABILITY_ALIASES: Array<[RegExp, Availability]> = [
  [
    /immediate|right away|asap|serving notice|(?:^|\D)(?:1[0-5]|[1-9]) ?days?|2 ?weeks?/,
    "immediate",
  ],
  [/not (?:looking|available|open)|passive/, "not_looking"],
  [/(?:^|\D)(?:3|4|5|6) ?months?|90 ?days|3_plus|3\+/, "3_plus_months"],
  [/(?:^|\D)2 ?months?|60 ?days|45 ?days|8 ?weeks/, "2_months"],
  [/(?:^|\D)1 ?months?|30 ?days|4 ?weeks|one month/, "1_month"],
];

export type CvParseRepairReport = {
  value: Record<string, unknown>;
  repairs: string[];
};

function seniorityFromYears(years: unknown): Seniority {
  const y = typeof years === "number" && Number.isFinite(years) ? years : 0;
  if (y >= 5) return "senior";
  if (y >= 2) return "mid";
  return "junior";
}

function repairSkills(raw: unknown, repairs: string[]): string[] | unknown {
  if (!Array.isArray(raw)) return raw;
  const seen = new Set<string>();
  const out: string[] = [];
  let dropped = 0;
  for (const item of raw) {
    const name =
      typeof item === "string"
        ? item
        : item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string"
          ? (item as { name: string }).name
          : "";
    const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_SKILL_LEN);
    if (!trimmed) {
      dropped += 1;
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  if (dropped > 0) repairs.push(`skills_dropped_empty:${dropped}`);
  if (out.length > MAX_SKILLS) {
    repairs.push(`skills_capped:${out.length}->${MAX_SKILLS}`);
    return out.slice(0, MAX_SKILLS);
  }
  return out;
}

/**
 * Coerce the model's output into something the schema will accept, without
 * inventing data. Returns the repaired object plus a list of repair codes.
 */
export function repairParsedCvForSchema(raw: Record<string, unknown>): CvParseRepairReport {
  const repairs: string[] = [];
  const out: Record<string, unknown> = { ...raw };

  out.canonical_skills = repairSkills(out.canonical_skills, repairs);

  if (typeof out.email === "string") {
    const email = out.email.trim();
    if (!email) {
      out.email = null;
    } else if (!EMAIL_RE.test(email)) {
      repairs.push("email_invalid_dropped");
      out.email = null;
    } else {
      out.email = email;
    }
  }

  if (typeof out.years_experience === "string") {
    const n = Number.parseFloat(out.years_experience.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) {
      out.years_experience = n;
      repairs.push("years_coerced_from_string");
    }
  }
  if (typeof out.years_experience === "number") {
    if (out.years_experience > MAX_YEARS) {
      repairs.push(`years_clamped:${out.years_experience}->${MAX_YEARS}`);
      out.years_experience = MAX_YEARS;
    } else if (out.years_experience < 0) {
      repairs.push(`years_clamped:${out.years_experience}->0`);
      out.years_experience = 0;
    }
  }

  const seniorityRaw = typeof out.seniority_level === "string" ? out.seniority_level : "";
  const seniorityKey = seniorityRaw.trim().toLowerCase();
  if (!SeniorityLevel.safeParse(seniorityKey).success) {
    const alias = SENIORITY_ALIASES[seniorityKey];
    const derived = alias ?? seniorityFromYears(out.years_experience);
    repairs.push(
      `seniority_mapped:${seniorityKey || "missing"}->${derived}${alias ? "" : "(from_years)"}`,
    );
    out.seniority_level = derived;
  } else {
    out.seniority_level = seniorityKey;
  }

  const availabilityRaw = typeof out.availability === "string" ? out.availability : "";
  const availabilityKey = availabilityRaw.trim().toLowerCase();
  const validAvailability = ParsedCVSchema.shape.availability.safeParse(availabilityKey || null);
  if (!validAvailability.success) {
    const alias = AVAILABILITY_ALIASES.find(([re]) => re.test(availabilityKey))?.[1] ?? null;
    repairs.push(`availability_mapped:${availabilityKey || "missing"}->${alias ?? "null"}`);
    out.availability = alias;
  } else {
    out.availability = availabilityKey || null;
  }

  if (out.authenticity_flags != null && !Array.isArray(out.authenticity_flags)) {
    repairs.push("authenticity_flags_dropped_non_array");
    out.authenticity_flags = [];
  }

  return { value: out, repairs };
}

/**
 * Thrown when the model's output cannot be made to fit the schema. Deterministic
 * for a given CV at temperature 0, so callers must NOT retry it — that only
 * multiplies the LLM bill (see cv-parse-retry.ts).
 */
export class CvParseValidationError extends Error {
  readonly issues: Array<{ path: string; message: string }>;
  constructor(issues: Array<{ path: string; message: string }>) {
    super(
      `CV parser output rejected by schema: ${issues
        .map((i) => `${i.path || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "CvParseValidationError";
    this.issues = issues;
  }
}

/** Repair, then validate. Logs one warn event per repaired parse and one per rejection. */
export function parseCvOutputWithRepairs(
  raw: Record<string, unknown>,
  context: { candidateId?: string; organisationId?: string } = {},
): ParsedCV {
  const { value, repairs } = repairParsedCvForSchema(raw);
  if (repairs.length > 0) {
    logger.warn("cv_parse_output_repaired", { ...context, repairs });
  }
  const result = ParsedCVSchema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  logger.warn("cv_parse_schema_rejected", { ...context, repairs, issues });
  throw new CvParseValidationError(issues);
}

const NON_RETRIABLE_MESSAGE_MARKERS = [
  "no JSON object in Claude response",
  "Could not extract sufficient text",
  "PDF_PARSE_ERROR",
  "WORD_PARSE_ERROR",
  "central directory",
];

/**
 * True when re-running the parse on the same file would fail the same way:
 * schema rejection, malformed JSON at temperature 0, unreadable/corrupt file.
 * Transient failures (5xx, rate limit, network, budget gate) stay retriable.
 */
export function isNonRetriableCvParseError(err: unknown): boolean {
  if (err instanceof CvParseValidationError) return true;
  if (err instanceof SyntaxError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return NON_RETRIABLE_MESSAGE_MARKERS.some((marker) => message.includes(marker));
}
