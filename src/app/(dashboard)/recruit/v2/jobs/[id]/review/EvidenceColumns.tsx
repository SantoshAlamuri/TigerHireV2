"use client";

import type { EvidenceItem, EvidencePack } from "@/lib/v2/evidence-pack";

/**
 * Three columns instead of one mixed list: a reviewer scans the one they care
 * about. Every line carries its citation, because a quote you cannot source is
 * a quote you should not act on.
 */
function Column({
  tone,
  title,
  items,
  empty,
}: {
  tone: "for" | "verify" | "against";
  title: string;
  items: EvidenceItem[];
  empty: string;
}) {
  const head =
    tone === "for"
      ? "text-emerald-300 bg-emerald-500/[0.07]"
      : tone === "verify"
        ? "text-amber-300 bg-amber-500/[0.07]"
        : "text-red-300 bg-red-500/[0.06]";

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]/40">
      <h3
        className={`flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5 text-xs font-medium uppercase tracking-wider ${head}`}
      >
        <span>{title}</span>
        <span className="font-mono tabular-nums">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-[var(--text-muted)]">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2 px-3 py-2.5">
          {items.map((it, i) => (
            <li
              key={`${it.kind}-${i}`}
              className="text-sm leading-relaxed text-[var(--text-muted)]"
            >
              <span className={it.kind === "unevidenced-must-have" ? "" : "text-[var(--text)]"}>
                {it.kind === "quote" || it.kind === "screening-answer" ? `“${it.quote}”` : it.quote}
              </span>
              <span className="mt-0.5 block font-mono text-xs text-[var(--text-muted)]">
                {it.citation}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EvidenceColumns({ pack }: { pack: EvidencePack }) {
  return (
    <div>
      <div className="grid gap-2 md:grid-cols-3">
        <Column tone="for" title="✓ Evidence for" items={pack.for} empty="Nothing matched yet." />
        <Column
          tone="verify"
          title="⚠ Verify in interview"
          items={pack.verify}
          empty="Nothing to probe."
        />
        <Column tone="against" title="✗ Gaps" items={pack.against} empty="No blocking gaps." />
      </div>
      {pack.droppedUnattributed > 0 ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {pack.droppedUnattributed} unattributed item
          {pack.droppedUnattributed === 1 ? "" : "s"} hidden — quotes are only shown when we can
          cite the source.
        </p>
      ) : null}
    </div>
  );
}
