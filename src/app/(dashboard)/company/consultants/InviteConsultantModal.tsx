"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

const FIELD =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-amber-500";
const LABEL = "mb-1.5 block text-xs font-medium text-[var(--text-muted)]";

export function InviteConsultantModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/company/consultants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          agencyName: agencyName.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(payload.error ?? "Failed to send invitation");
        return;
      }
      onSent(payload.message ?? "Invitation sent");
    } catch {
      setError("Failed to send invitation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">Invite a consulting firm</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              They keep their own workspace and candidate pool. Nothing is shared until they accept.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-muted)] transition hover:text-[var(--text)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="consultant-email" className={LABEL}>
              Their work email
            </label>
            <input
              id="consultant-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@recruitingfirm.com"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="consultant-firm" className={LABEL}>
              Firm name <span className="text-[var(--text-muted)]">(optional)</span>
            </label>
            <input
              id="consultant-firm"
              type="text"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="Acme Talent Partners"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="consultant-note" className={LABEL}>
              Note <span className="text-[var(--text-muted)]">(optional)</span>
            </label>
            <textarea
              id="consultant-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Hi — we'd like you on the backend roles this quarter."
              className={`${FIELD} resize-none`}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || !email.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send invitation
          </button>
        </div>
      </div>
    </div>
  );
}
