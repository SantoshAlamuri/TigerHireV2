"use client";

import { FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatementDownload } from "../../referrals/_components/StatementDownload";

export default function FinanceReferralStatementPage() {
  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Referral statement"
        subtitle="Referral bonuses TigerHire paid on your jobs"
      />
      <section className="card-lifted p-5">
        <div className="mb-1 flex items-center gap-2">
          <FileText size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--text)]">Download by month</h2>
        </div>
        <p className="mb-4 max-w-2xl text-sm text-white/60">
          Each row is a bonus already disbursed by TigerHire, with the job it was earned on, the
          payout run, and the payment reference — reconcile the total against the invoice for the
          same period. This is a record of settled payments, not a payment instruction: nothing here
          needs paying by you.
        </p>
        <StatementDownload />
      </section>
    </div>
  );
}
