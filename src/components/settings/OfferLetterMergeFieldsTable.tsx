"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { OFFER_TEMPLATE_MERGE_FIELDS } from "@/lib/offers/offer-template-merge-fields";

export function OfferLetterMergeFieldsTable() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 2000);
    } catch {
      setCopiedToken(null);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Merge fields</h3>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        Insert tokens into the letter; they are replaced with real data when the PDF is generated.
        Use <strong>Copy</strong> to paste into the editor.
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[320px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              <th className="px-3 py-2 font-medium text-[var(--text)]">Field</th>
              <th className="px-3 py-2 font-medium text-[var(--text)]">Token</th>
              <th className="px-3 py-2 font-medium text-[var(--text)]">Example</th>
              <th className="w-14 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {OFFER_TEMPLATE_MERGE_FIELDS.map((row) => (
              <tr
                key={row.token}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/40"
              >
                <td className="px-3 py-2 align-top text-[var(--text)]">
                  <div className="font-medium">{row.label}</div>
                  <div className="mt-0.5 text-[var(--text-muted)]">{row.description}</div>
                </td>
                <td className="px-3 py-2 align-top font-mono text-[11px] text-[var(--text)]">
                  {row.token}
                </td>
                <td className="px-3 py-2 align-top text-[var(--text-muted)]">
                  {row.exampleFilled}
                </td>
                <td className="px-2 py-2 align-top">
                  <button
                    type="button"
                    onClick={() => void copyToken(row.token)}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    title={`Copy ${row.token}`}
                  >
                    {copiedToken === row.token ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
