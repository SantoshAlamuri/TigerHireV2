"use client";

import Link from "next/link";
import { CheckCircle2, FileText, Megaphone, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PayoutConfirmQueue } from "./_components/PayoutConfirmQueue";
import { StatementDownload } from "./_components/StatementDownload";

const CARD_CLASS = "card-lifted p-5";

const ACTION_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]";

export default function CompanyReferralToolsPage() {
  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Referrals"
        subtitle="Set the bonus on the job, confirm the hire, and TigerHire pays the referrer"
      />

      <section className={CARD_CLASS}>
        <div className="mb-1 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--text)]">Awaiting your confirmation</h2>
        </div>
        <p className="mb-4 text-sm text-white/60">
          Confirm the milestone actually happened. TigerHire pays the referrer directly — you never
          handle payee details or run a payment file.
        </p>
        <PayoutConfirmQueue />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CARD_CLASS}>
          <div className="mb-1 flex items-center gap-2">
            <FileText size={18} className="text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text)]">Statement for finance</h2>
          </div>
          <p className="mb-4 text-sm text-white/60">
            What TigerHire paid out on your jobs, by month, with payout-run and payment references
            to reconcile against the invoice.
          </p>
          <StatementDownload />
        </section>

        <section className={CARD_CLASS}>
          <div className="mb-1 flex items-center gap-2">
            <Settings2 size={18} className="text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text)]">Bonus rules</h2>
          </div>
          <p className="mb-4 text-sm text-white/60">
            Rates and the milestone that releases them are set per job, while creating or editing
            it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/company/hiring-requests/new" className={ACTION_CLASS}>
              Start via requisition
            </Link>
            <Link href="/company/jobs" className={ACTION_CLASS}>
              Open job list
            </Link>
          </div>
        </section>

        <section className={CARD_CLASS}>
          <div className="mb-1 flex items-center gap-2">
            <Megaphone size={18} className="text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text)]">Referral campaigns</h2>
          </div>
          <p className="mb-4 text-sm text-white/60">
            Launch and track WhatsApp referral drives for selected jobs.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/company/referrals/campaigns" className={ACTION_CLASS}>
              Open campaigns
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
