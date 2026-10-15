/**
 * Candidate review in the work-driven UI: the pure rules behind the native
 * review block. Grouping by the agent's recommendation, the order people are
 * shown in, the evidence a criterion line may show, and the keyboard map.
 *
 * Queue state (decide, bulk, undo) stays in `@/lib/v2/review-queue` and the
 * decision payloads in `@/lib/v2/decision-sync`; this module never re-states
 * them, so the classic screen and this one cannot drift apart.
 */
import { isDisplayableEvidence } from "@/lib/v2/evidence-pack";
import { REJECT_REASONS, type Decision, type DecisionRecord } from "@/lib/v2/review-queue";
import { stripEmbeddedScore } from "@/lib/v2/score-display";
import { rubricLabel } from "@/lib/work/rubric-weights";

/* ---------- recommendation tiers ---------- */

export interface FitThresholds {
  strong: number;
  good: number;
  moderate: number;
  weak: number;
}

/**
 * Mirrors DEFAULT_FIT_THRESHOLDS in `@/lib/fitscore/hybrid/constants` (not
 * imported: that module pulls in server model config). Used only when the job's
 * own thresholds could not be read, and the UI says so.
 */
export const DEFAULT_REVIEW_THRESHOLDS: FitThresholds = {
  strong: 78,
  good: 60,
  moderate: 40,
  weak: 25,
};

export type Tier = "strong" | "borderline" | "below" | "unscored";

export const TIER_ORDER: Tier[] = ["strong", "borderline", "below", "unscored"];

export const TIER_LABEL: Record<Tier, string> = {
  strong: "Strong",
  borderline: "Borderline",
  below: "Below the bar",
  unscored: "Not scored yet",
};

export const TIER_NOTE: Record<Tier, string> = {
  strong: "The agent recommends an interview",
  borderline: "The agent is unsure. Your call matters most here",
  below: "The agent recommends passing",
  unscored: "Waiting for a score. Decide only if you have read the CV",
};

function isThresholds(v: unknown): v is FitThresholds {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return ["strong", "good", "moderate", "weak"].every(
    (k) => typeof t[k] === "number" && Number.isFinite(t[k]),
  );
}

/** The job's own cut-offs when the rubric carries them, else the defaults. */
export function resolveThresholds(raw: unknown): { t: FitThresholds; fromJob: boolean } {
  return isThresholds(raw)
    ? { t: raw, fromJob: true }
    : { t: DEFAULT_REVIEW_THRESHOLDS, fromJob: false };
}

/**
 * Strong = Good Fit or better on the job's scale; borderline = Moderate Fit;
 * below = Weak Fit or Not a Fit. The same stored score drives the number,
 * the order and the tier (AGENTS.md rule 4).
 */
export function tierFor(score: number | null | undefined, t: FitThresholds): Tier {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return "unscored";
  if (score >= t.good) return "strong";
  if (score >= t.moderate) return "borderline";
  return "below";
}

export interface TriageItem {
  id: string;
  name: string;
  score: number | null;
}

export interface TriageGroup<T extends TriageItem = TriageItem> {
  tier: Tier;
  items: T[];
}

/**
 * Undecided candidates grouped by tier, highest score first inside a group,
 * name as the tie-break so the list never reshuffles between renders.
 * Empty groups are dropped.
 */
export function groupForTriage<T extends TriageItem>(
  items: T[],
  decided: Iterable<string>,
  t: FitThresholds,
): TriageGroup<T>[] {
  const done = new Set(decided);
  const by = new Map<Tier, T[]>(TIER_ORDER.map((k) => [k, []]));
  for (const it of items) {
    if (done.has(it.id)) continue;
    by.get(tierFor(it.score, t))!.push(it);
  }
  return TIER_ORDER.map((tier) => ({
    tier,
    items: by
      .get(tier)!
      .slice()
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0);
}

/** Many waiting: start in the list. A handful: start one at a time. */
export const TRIAGE_FROM = 12;
export function defaultMode(waiting: number): "list" | "focus" {
  return waiting >= TRIAGE_FROM ? "list" : "focus";
}

/** The next few undecided after the cursor, wrapping to earlier ones. */
export function upNext<T extends { id: string }>(
  items: T[],
  cursor: number,
  decided: Iterable<string>,
  count = 5,
): T[] {
  const done = new Set(decided);
  const out: T[] = [];
  for (let step = 1; step < items.length && out.length < count; step++) {
    const it = items[(cursor + step) % items.length];
    if (!done.has(it.id)) out.push(it);
  }
  return out;
}

/* ---------- evidence ---------- */

/** Machine placeholders the scorer stores when no verbatim quote survived. */
const NOT_A_QUOTE = new Set(["NO_DEFENSIBLE_QUOTE", "No quote entry returned by model"]);

export interface VerifiedQuote {
  dimension: string;
  quote: string;
  where?: string;
}

export const dimensionKey = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * Quotes that passed verbatim validation. The scoring pipeline replaces any
 * quote that is not a substring of the CV with NO_DEFENSIBLE_QUOTE before it
 * persists (quote-validation.ts), so a stored quote that is not a placeholder
 * is verified. Anything else is withheld, never shown.
 */
export function verifiedQuotes(evidence: unknown): VerifiedQuote[] {
  const list = (evidence as { quotes?: unknown } | null | undefined)?.quotes;
  if (!Array.isArray(list)) return [];
  const out: VerifiedQuote[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw as Record<string, unknown>;
    const quote = typeof q.quote === "string" ? q.quote.trim() : "";
    if (!isDisplayableEvidence(quote) || NOT_A_QUOTE.has(quote)) continue;
    const dimension = typeof q.dimension === "string" ? q.dimension.trim() : "";
    const key = `${dimensionKey(dimension)}|${quote.toLowerCase().replace(/\s+/g, " ")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const where = typeof q.location_hint === "string" ? q.location_hint.trim() : "";
    out.push({
      dimension,
      quote,
      ...(where && !NOT_A_QUOTE.has(where) ? { where } : {}),
    });
  }
  return out;
}

export interface CriterionRow {
  key: string;
  label: string;
  /** Weight out of 100, when the rubric gives one. */
  weight: number | null;
  /** Shown as-is: "7/10", "B". Null when no per-criterion score was stored. */
  score: string | null;
  quote: VerifiedQuote | null;
}

interface BreakdownItem {
  criterion_id?: unknown;
  criterion_name?: unknown;
  weight?: unknown;
  grade?: unknown;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * One line per rubric criterion, heaviest first. Scores come from what was
 * stored: hybrid dimension values (1 to 10) or a three-stage letter grade.
 * Nothing is recomputed, and a missing score stays missing.
 */
export function criterionRows(input: {
  weights?: Record<string, number> | null;
  /** v2_score_breakdown.dimensions */
  dimensions?: unknown;
  /** criteria_breakdown (three-stage rows) */
  breakdown?: unknown;
  quotes: VerifiedQuote[];
}): CriterionRow[] {
  const rows = new Map<string, CriterionRow>();
  const ensure = (rawKey: string, label?: string) => {
    const key = dimensionKey(rawKey);
    if (!key) return null;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        label: label?.trim() || rubricLabel(rawKey),
        weight: null,
        score: null,
        quote: null,
      };
      rows.set(key, row);
    }
    return row;
  };

  const weights = input.weights ?? {};
  const sum = Object.values(weights).reduce((a, v) => a + (num(v) ?? 0), 0);
  const scale = sum > 0 && sum <= 1.5 ? 100 : 1;
  for (const [k, v] of Object.entries(weights)) {
    const w = num(v);
    const row = ensure(k);
    if (row && w !== null) row.weight = Math.round(w * scale);
  }

  if (input.dimensions && typeof input.dimensions === "object") {
    for (const [k, v] of Object.entries(input.dimensions as Record<string, unknown>)) {
      const value = num((v as { value?: unknown } | null)?.value);
      const row = ensure(k);
      if (row && value !== null) row.score = `${Math.round(Math.min(10, Math.max(0, value)))}/10`;
    }
  }

  if (Array.isArray(input.breakdown)) {
    for (const item of input.breakdown as BreakdownItem[]) {
      if (!item || typeof item !== "object") continue;
      const id = typeof item.criterion_id === "string" ? item.criterion_id : "";
      const name = typeof item.criterion_name === "string" ? item.criterion_name : "";
      const row = ensure(id || name, name);
      if (!row) continue;
      if (row.weight === null) {
        const w = num(item.weight);
        if (w !== null) row.weight = Math.round(w <= 1 ? w * 100 : w);
      }
      if (row.score === null && typeof item.grade === "string" && item.grade.trim())
        row.score = item.grade.trim().toUpperCase();
    }
  }

  for (const q of input.quotes) {
    const row = q.dimension ? ensure(q.dimension) : null;
    if (row && !row.quote) row.quote = q;
  }

  return [...rows.values()].sort(
    (a, b) => (b.weight ?? -1) - (a.weight ?? -1) || a.label.localeCompare(b.label),
  );
}

/** Red flags first, then the things to check. Placeholders and repeats removed. */
export function risks(
  red: (string | null)[] | null | undefined,
  amber: (string | null)[] | null | undefined,
): { text: string; tier: "red" | "amber" }[] {
  const out: { text: string; tier: "red" | "amber" }[] = [];
  const seen = new Set<string>();
  const add = (list: (string | null)[] | null | undefined, tier: "red" | "amber") => {
    for (const f of list ?? []) {
      const text = typeof f === "string" ? f.trim() : "";
      if (!isDisplayableEvidence(text)) continue;
      const k = text.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ text, tier });
    }
  };
  add(red, "red");
  add(amber, "amber");
  return out;
}

/** The agent's line without the frozen "FitScore 56 (…)" claim; the stored score is shown instead. */
export function agentSummary(text: string | null | undefined): string {
  return stripEmbeddedScore(text ?? "").trim();
}

export const isFallbackScore = (method: string | null | undefined) =>
  method === "deterministic_fallback";

/* ---------- logistics ---------- */

export interface LogisticsInput {
  notice_period_days?: number | null;
  expected_ctc_lpa?: number | null;
  offers_in_hand?: number | null;
  location?: string | null;
}

/** Only facts the candidate gave. Absent facts are left out, not dashed. */
export function logistics(row: LogisticsInput): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const n = row.notice_period_days;
  if (typeof n === "number" && n >= 0)
    out.push({ label: "Notice", value: n === 0 ? "Can start now" : `${n} days` });
  const loc = row.location?.trim();
  if (loc) out.push({ label: "Location", value: loc });
  const ctc = row.expected_ctc_lpa;
  if (typeof ctc === "number" && ctc > 0)
    out.push({ label: "Pay ask", value: `₹${ctc} lakh a year` });
  const offers = row.offers_in_hand;
  if (typeof offers === "number" && offers > 0)
    out.push({ label: "Other offers", value: String(offers) });
  return out;
}

/* ---------- decisions ---------- */

/** Reject reasons as the review asks them. Same ids as the classic menu. */
export function rejectChoices(): { id: string; label: string; keepsInPool: boolean }[] {
  return REJECT_REASONS.map((r) => ({
    id: r.id,
    label: r.label.replace(/\s*\(note required\)\s*$/i, ""),
    keepsInPool: r.poolable,
  }));
}

export function rejectLabel(id: string | null | undefined): string {
  return rejectChoices().find((r) => r.id === id)?.label ?? "No reason";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The "What just happened" line for a decision. */
export function decisionLog(decision: Decision, who: string | number, reason?: string): string {
  const subject = typeof who === "number" ? plural(who, "candidate") : who;
  if (decision === "advance") return `Moved ${subject} to interview`;
  if (decision === "hold") return `Put ${subject} on hold`;
  return `Marked ${subject} not a fit: ${rejectLabel(reason).toLowerCase()}`;
}

export function sessionSummary(records: DecisionRecord[]): string {
  if (!records.length) return "No decisions yet.";
  const c = { advance: 0, hold: 0, reject: 0 };
  for (const r of records) c[r.decision]++;
  const parts = [
    c.advance && `${c.advance} to interview`,
    c.hold && `${c.hold} on hold`,
    c.reject && `${c.reject} not a fit`,
  ].filter(Boolean);
  return `${plural(records.length, "decision")}: ${parts.join(", ")}.`;
}

/* ---------- keyboard ---------- */

export type KeyAction =
  | { kind: "next" | "prev" | "advance" | "hold" | "reject" | "undo" | "cancel" }
  | { kind: "reason"; id: string };

/**
 * The classic review keys (A/H/R/J/K/U, Escape), plus 1-5 to pick a reason
 * while the reason choice is open. Modified keys stay with the browser.
 */
export function keyAction(
  e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
  askingReason: boolean,
): KeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (askingReason) {
    if (k === "escape") return { kind: "cancel" };
    const i = Number(k);
    const choice = Number.isInteger(i) && i >= 1 ? rejectChoices()[i - 1] : undefined;
    return choice ? { kind: "reason", id: choice.id } : null;
  }
  const map: Record<string, KeyAction["kind"]> = {
    j: "next",
    k: "prev",
    a: "advance",
    h: "hold",
    r: "reject",
    u: "undo",
  };
  const kind = map[k];
  return kind ? ({ kind } as KeyAction) : null;
}

/** Typing in a field never triggers a decision. Checkboxes and buttons are not typing. */
export function isTypingTarget(el: Element | null): boolean {
  const field = el?.closest?.(
    "input, textarea, select, [contenteditable=''], [contenteditable=true]",
  );
  if (!field) return false;
  if (field.tagName === "INPUT") {
    const type = (field.getAttribute("type") ?? "text").toLowerCase();
    return !["checkbox", "radio", "button", "submit", "reset"].includes(type);
  }
  return true;
}
