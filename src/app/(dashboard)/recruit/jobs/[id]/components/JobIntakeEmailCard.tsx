"use client";

import { useState } from "react";
import { Mail, Copy, Check } from "lucide-react";
import { buildJobIntakeAddress } from "@/lib/config/email-intake";
import { copyToClipboard } from "@/lib/utils/clipboard";

/**
 * Surfaces the per-job CV email-intake address so recruiters can point external
 * boards (Naukri's "email applications" response address) or forward candidate
 * CVs at it. The Resend Inbound webhook parses the embedded job id and attaches
 * each CV to this job automatically (source = email_intake).
 */
export function JobIntakeEmailCard({ jobId }: { jobId: string }) {
  const address = buildJobIntakeAddress(jobId);
  const [copied, setCopied] = useState(false);
  if (!address) return null;

  async function handleCopy() {
    if (!address) return;
    await copyToClipboard(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-4">
      <div className="flex items-center gap-2">
        <Mail size={16} className="shrink-0 text-[var(--accent)]" />
        <span className="text-sm font-medium text-[var(--text)]">Email CVs to this job</span>
      </div>
      <p className="mt-1.5 text-sm text-white/60">
        Set this as the response email on Naukri (or any job board), or forward candidate CVs here —
        every attachment is parsed and added to this job automatically.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="select-all rounded-md border border-[var(--border)] bg-[var(--bg)]/60 px-2.5 py-1.5 text-xs text-[var(--text)]">
          {address}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--surface-hover)]"
          aria-label="Copy intake email address"
        >
          {copied ? (
            <>
              <Check size={13} className="text-[var(--accent)]" />
              Copied
            </>
          ) : (
            <>
              <Copy size={13} />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}
