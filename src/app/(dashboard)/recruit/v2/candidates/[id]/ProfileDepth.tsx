"use client";

import type { ScoreRow } from "@/lib/v2/score-index";

/**
 * The parts of the profile the approved design calls for beyond the score: the
 * evidence columns, and the three logs a recruiter asks for before a call.
 *
 * The evidence columns are For / Verify / Gaps, and the middle one is the one
 * that matters. "Verify" is a probe for the interview — a claim the CV makes
 * that nothing corroborates — not an accusation. Collapsing it into Gaps would
 * turn "we have not checked this" into "they do not have this", which is how a
 * screening tool starts rejecting people for the wrong reason.
 */
function Column({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: "g" | "a" | "r";
  items: string[];
  empty: string;
}) {
  const colour =
    tone === "g"
      ? "text-emerald-300 border-emerald-400/25"
      : tone === "a"
        ? "text-amber-300 border-amber-400/25"
        : "text-red-300 border-red-400/25";
  return (
    <div className={`rounded-lg border bg-[var(--surface)]/40 p-3 ${colour.split(" ")[1]}`}>
      <h4 className={`flex items-center justify-between text-xs font-bold ${colour.split(" ")[0]}`}>
        <span>{title}</span>
        <b className="font-mono tabular-nums">{items.length}</b>
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-[11px] text-white/35">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((t) => (
            <li key={t} className="text-[12px] leading-snug text-white/70">
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const clean = (xs: (string | null)[] | null | undefined) =>
  (xs ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);

/**
 * ICP match and market rank sit under the headline score. They are the two
 * numbers that say whether a 79 means "strong for this role" or "strong in
 * general" — the design puts all three together for that reason.
 */
export function ScoreSubStats({ score }: { score: ScoreRow | null }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-2">
      <div>
        <div className="text-[9px] font-medium uppercase tracking-wider text-white/40">
          ICP match
        </div>
        <div className="font-mono text-sm font-semibold tabular-nums text-white/80">
          {score?.ideal_match_pct == null ? "—" : `${score.ideal_match_pct}%`}
        </div>
      </div>
      <div>
        <div className="text-[9px] font-medium uppercase tracking-wider text-white/40">Market</div>
        <div className="font-mono text-sm font-semibold tabular-nums text-white/80">
          {score?.market_label?.trim() || "—"}
        </div>
      </div>
    </div>
  );
}

export function EvidenceColumnsProfile({ score }: { score: ScoreRow | null }) {
  return (
    <div className="mb-3 grid gap-2 md:grid-cols-3">
      <Column
        title="✓ For"
        tone="g"
        items={clean(score?.green_flags)}
        empty="Nothing recorded in favour yet."
      />
      <Column
        title="⚠ Verify"
        tone="a"
        items={clean(score?.amber_flags)}
        empty="Nothing flagged to probe in interview."
      />
      <Column
        title="✗ Gaps"
        tone="r"
        items={clean(score?.red_flags)}
        empty="No gaps against the rubric recorded."
      />
    </div>
  );
}

type IntelligenceApp = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  notice_period_days?: number | null;
  current_ctc_lpa?: number | null;
  expected_ctc_lpa?: number | null;
  offers_in_hand?: number | null;
  jobs?: { title?: string | null } | null;
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtNotice(days: number | null | undefined): string {
  if (days == null) return "-";
  if (days === 0) return "Immediate";
  return `${days} days`;
}

function fmtLpa(value: number | null | undefined): string {
  return value == null ? "-" : `Rs ${value}L`;
}

function statusCounts(apps: IntelligenceApp[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const app of apps) {
    const key = app.status?.trim() || "applied";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

function firstFilled<T>(items: (T | null | undefined)[]): T | null {
  for (const item of items) if (item != null) return item;
  return null;
}

export function CandidateIntelligenceRecord({
  apps,
  score,
}: {
  apps: IntelligenceApp[];
  score: ScoreRow | null;
}) {
  const latest = apps[0] ?? null;
  const statuses = statusCounts(apps);
  const scoreUpdated = score?.created_at ?? latest?.created_at ?? null;
  const salaryExpectation = firstFilled(apps.map((a) => a.expected_ctc_lpa));
  const notice = firstFilled(apps.map((a) => a.notice_period_days));
  const offers = firstFilled(apps.map((a) => a.offers_in_hand));
  const evidenceCount =
    clean(score?.green_flags).length +
    clean(score?.amber_flags).length +
    clean(score?.red_flags).length;

  const cells = [
    {
      k: "Known roles",
      v: String(apps.length),
      d: latest?.jobs?.title ? `latest: ${latest.jobs.title}` : "no role history yet",
    },
    {
      k: "Evidence depth",
      v: String(evidenceCount),
      d:
        score?.overall_score == null
          ? "score pending"
          : `${score.overall_score}/100 score last refreshed ${fmtDate(scoreUpdated)}`,
    },
    {
      k: "Availability",
      v: fmtNotice(notice),
      d: `expected ${fmtLpa(salaryExpectation)}${offers == null ? "" : `, ${offers} offer${offers === 1 ? "" : "s"}`}`,
    },
    {
      k: "Outcome loop",
      v: statuses.find((s) => s.label === "hired") ? "Hired" : "Open",
      d:
        statuses.length > 0
          ? statuses.map((s) => `${s.count} ${s.label}`).join(", ")
          : "no decisions recorded",
    },
  ];

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">Candidate Intelligence Record</h2>
          <p className="mt-0.5 text-xs text-white/45">
            CV evidence, role history, logistics, and decisions in one reusable record.
          </p>
        </div>
        <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white/45">
          {score?.job_id ? "role-scored" : "profile-only"}
        </span>
      </div>
      <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.k} className="bg-[var(--surface)] px-4 py-3">
            <div className="text-[9.5px] font-medium uppercase tracking-wider text-white/40">
              {cell.k}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{cell.v}</div>
            <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/45">
              {cell.d}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Activity, comms and notes.
 *
 * None of these have an endpoint v2 can read yet. They are shown as named,
 * empty sections rather than omitted, because a recruiter who cannot see where
 * the call history lives assumes it was never captured — and the WhatsApp
 * history in particular does exist, just not here.
 */
export function ProfileLogs({
  appliedAt,
  status,
}: {
  appliedAt?: string | null;
  status?: string | null;
}) {
  const sections: { title: string; body: string }[] = [
    {
      title: "Activity",
      body: appliedAt
        ? `Applied ${new Date(appliedAt).toLocaleDateString()}${status ? ` · now ${status}` : ""}. Stage changes are not timestamped yet, so this is the only event on record.`
        : "No activity recorded.",
    },
    {
      title: "Comms log",
      body: "WhatsApp and email history is captured against the candidate's phone number but is not exposed to this screen yet.",
    },
    {
      title: "Notes & assessment",
      body: "No notes or assessment results are wired into this view yet.",
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {sections.map((s) => (
        <div
          key={s.title}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4"
        >
          <h2 className="text-sm font-bold text-[var(--text)]">{s.title}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-white/45">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
