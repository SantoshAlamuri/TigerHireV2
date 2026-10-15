"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ATTENTION_CARD_CLASS, REPORT_CARD_CLASS } from "./helpers";

type AttentionCard = {
  key: string;
  title: string;
  value: number | null;
  description: string;
  href: string;
  cta: string;
  icon: ReactNode;
};

export function AttentionSection({ attentionCards }: { attentionCards: AttentionCard[] }) {
  return (
    <div className={`${REPORT_CARD_CLASS} border border-[var(--border)]`}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">Needs attention</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Choose a queue to review.</p>
        </div>
        <Link
          href="/admin/audit-log"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
        >
          Audit trail
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {attentionCards.map((card) => (
          <div key={card.key} className={ATTENTION_CARD_CLASS}>
            <div className="mb-2 inline-flex rounded-md border border-[var(--border)] p-1.5 text-[var(--text-muted)]">
              {card.icon}
            </div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{card.title}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{card.value ?? "—"}</p>
            <p className="mt-1 min-h-[2.5rem] text-xs text-[var(--text-muted)]">
              {card.description}
            </p>
            <Link
              href={card.href}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]"
            >
              {card.cta}
              <ArrowRight size={14} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
