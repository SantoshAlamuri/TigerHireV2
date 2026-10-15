"use client";

import { Download, Gift } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";

const CARD_CLASS = "card-lifted rounded-xl p-5";

const ACTION_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)]/30 hover:bg-white/[0.04]";

export default function AdminReferralToolsPage() {
  return (
    <>
      <PageHeader title="Referral Tools" subtitle="Referral operations and exports" />
      <div className="grid gap-4">
        <section className={CARD_CLASS}>
          <div className="mb-4 flex items-center gap-2">
            <Gift size={18} className="text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text)]">Referral exports</h2>
          </div>
          <p className="mb-4 text-sm text-white/60">
            Download platform-level CSV exports for referrers and payout records.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/admin/export/referrers"
              target="_blank"
              rel="noopener noreferrer"
              className={ACTION_CLASS}
            >
              <Download size={16} />
              Export referrers CSV
            </a>
            <a
              href="/api/admin/export/payouts"
              target="_blank"
              rel="noopener noreferrer"
              className={ACTION_CLASS}
            >
              <Download size={16} />
              Export payouts CSV
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
