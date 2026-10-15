"use client";

import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PayoutRunsPanel } from "./_components/PayoutRunsPanel";

export default function AdminPayoutRunsPage() {
  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Referral payout runs"
        subtitle="Disburse confirmed referral bonuses and record the payment"
      />
      <section className="card-lifted p-5">
        <div className="mb-1 flex items-center gap-2">
          <Wallet size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--text)]">Runs</h2>
        </div>
        <p className="mb-4 text-sm text-white/60">
          Generate sweeps every company-confirmed bonus into a run. Download the payee sheet, pay
          from it, then record the transaction reference — that is what marks the bonuses paid for
          the referrer, the leaderboard, and the company&apos;s statement.
        </p>
        <PayoutRunsPanel />
      </section>
    </div>
  );
}
