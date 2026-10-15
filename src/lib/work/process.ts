/**
 * The hiring process screen: the stages every new job starts with.
 *
 * Stages come in three bands. The automatic start (Applied, FitScore Review)
 * and the outcomes at the end (Hired, Rejected, Withdrawn) are fixed. Only the
 * middle is yours to rename, reorder, add to or trim.
 */

export type StageType =
  | "system_auto"
  | "screening"
  | "interview"
  | "assessment"
  | "offer"
  | "terminal_hired"
  | "terminal_reject";

export interface StageRow {
  id?: string;
  stage_name: string;
  stage_order: number;
  stage_type?: StageType | null;
  is_locked?: boolean | null;
  sla_days?: number | null;
  notify_candidate?: boolean | null;
  color?: string | null;
  notify_email_body?: string | null;
  interviewer_email?: string | null;
  interviewer_name?: string | null;
}

export interface EditableStage {
  key: string;
  id?: string;
  name: string;
  type: StageType;
  /** The saved row, so settings this screen doesn't show (SLA, emails) survive a save. */
  base?: StageRow;
}

export interface StageBands {
  start: StageRow[];
  middle: EditableStage[];
  end: StageRow[];
}

/** The kinds people add, in their own words. */
export const STAGE_KINDS: { type: StageType; name: string }[] = [
  { type: "screening", name: "Screen" },
  { type: "interview", name: "Interview" },
  { type: "assessment", name: "Assessment" },
  { type: "offer", name: "Offer" },
];

export function kindName(type: StageType | null | undefined): string {
  return STAGE_KINDS.find((k) => k.type === type)?.name ?? "Stage";
}

export function splitStages(rows: StageRow[]): StageBands {
  const sorted = [...rows].sort((a, b) => a.stage_order - b.stage_order);
  const firstOpen = sorted.findIndex((s) => !s.is_locked);
  const startEnd = firstOpen === -1 ? sorted.length : firstOpen;
  const start = sorted.slice(0, startEnd);
  const rest = sorted.slice(startEnd);
  return {
    start,
    middle: rest
      .filter((s) => !s.is_locked)
      .map((s) => ({
        key: s.id ?? `${s.stage_name}-${s.stage_order}`,
        id: s.id,
        name: s.stage_name,
        type: (s.stage_type as StageType) ?? "screening",
        base: s,
      })),
    end: rest.filter((s) => s.is_locked),
  };
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Settings kept from the saved row; nulls dropped so the API's defaults apply. */
function kept(base: StageRow | undefined) {
  if (!base) return { notify_candidate: true };
  const out: Record<string, unknown> = {};
  for (const k of [
    "sla_days",
    "notify_candidate",
    "color",
    "notify_email_body",
    "interviewer_email",
    "interviewer_name",
  ] as const) {
    if (base[k] !== undefined && base[k] !== null) out[k] = base[k];
  }
  return out;
}

/**
 * What to save: your middle stages in order, then any fixed end stage whose
 * position moved because the middle grew or shrank. The fixed start never moves.
 */
export function toPayload(b: StageBands) {
  const startLen = b.start.length;
  const middle = b.middle.map((s, i) => ({
    ...kept(s.base),
    ...(s.id ? { id: s.id } : {}),
    stage_name: s.name.trim(),
    stage_order: startLen + i,
    stage_type: s.type,
  }));
  const end = b.end
    .map((s, i) => ({
      id: s.id,
      stage_name: s.stage_name,
      stage_order: startLen + middle.length + i,
      was: s.stage_order,
    }))
    .filter((s) => s.stage_order !== s.was)
    .map(({ was: _was, ...rest }) => rest);
  return [...middle, ...end];
}

export function stagesProblem(b: StageBands): string | null {
  if (b.middle.some((s) => !s.name.trim())) return "Every stage needs a name.";
  if (b.middle.length === 0) return "Keep at least one stage between applying and the outcome.";
  return null;
}
