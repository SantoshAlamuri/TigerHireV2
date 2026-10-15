"use client";

import { ClipboardCopy, MessageCircle } from "lucide-react";
import { inviteJoinUrl, inviteJoinWhatsAppUrl } from "../_lib/helpers";

type NetworkTabSectionProps = {
  referrerId: string;
  inviteCopied: boolean;
  copyInviteLink: (parentReferrerId: string) => void;
};

export function NetworkTabSection({
  referrerId,
  inviteCopied,
  copyInviteLink,
}: NetworkTabSectionProps) {
  return (
    <section className="space-y-4">
      <div className="card-lifted border border-[var(--border)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text)]">Network & Invites</h2>
        <p className="mt-2 text-sm text-white/60">
          Expand your referral network and earn parent-level payouts when invitees place successful
          referrals.
        </p>
      </div>

      <div className="card-lifted rounded-xl border border-[var(--border)] p-4 text-sm text-white/60">
        <p className="font-medium text-[var(--text)]">How cascading payouts work</p>
        <p className="mt-1.5">
          In a two-level referral chain, when C applies through B and reaches the payout milestone,
          B receives the direct bonus and A receives the parent bonus, subject to the role&apos;s
          payout configuration.
        </p>
      </div>

      <div className="card-lifted rounded-xl border border-[var(--border)] p-4 text-sm text-white/60">
        <p className="font-medium text-[var(--text)]">Your invite link</p>
        <p className="mt-1.5">
          Share this link to add someone under your network as your child referrer.
        </p>
        <p className="mt-2 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-white/60">
          {inviteJoinUrl(referrerId)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => copyInviteLink(referrerId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text)]"
          >
            <ClipboardCopy size={14} />
            {inviteCopied ? "Invite link copied" : "Copy invite link"}
          </button>
          <a
            href={inviteJoinWhatsAppUrl(referrerId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text)]"
          >
            <MessageCircle size={14} className="text-[#25D366]" aria-hidden />
            Share invite on WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
