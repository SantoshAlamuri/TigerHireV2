"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { BRAND } from "@/lib/brand";

export type OverrideReason = "strong_interview" | "cultural_fit" | "referral" | "other";

interface OverrideReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: OverrideReason, reasonText?: string) => void;
  candidateName: string;
  fitScore: number;
  action: "promote" | "reject";
  loading?: boolean;
}

const OVERRIDE_OPTIONS: Array<{ value: OverrideReason; label: string }> = [
  { value: "strong_interview", label: "Strong interview performance" },
  { value: "cultural_fit", label: "Better cultural fit than score suggests" },
  { value: "referral", label: "Trusted referral / recommendation" },
  { value: "other", label: "Other reason" },
];

export function OverrideReasonModal({
  isOpen,
  onClose,
  onConfirm,
  candidateName,
  fitScore,
  action,
  loading = false,
}: OverrideReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState<OverrideReason | null>(null);
  const [reasonText, setReasonText] = useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedReason) return;
    onConfirm(selectedReason, reasonText.trim() || undefined);
    // Reset state
    setSelectedReason(null);
    setReasonText("");
  };

  const handleClose = () => {
    if (loading) return;
    setSelectedReason(null);
    setReasonText("");
    onClose();
  };

  const actionText = action === "promote" ? "promoting" : "rejecting";
  const scoreContext =
    action === "promote"
      ? `This candidate has a ${BRAND.score} of ${fitScore}, which is below the typical threshold.`
      : `This candidate has a ${BRAND.score} of ${fitScore}, which is above the typical threshold.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-500/15 p-2">
              <AlertTriangle size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">{BRAND.overrideHeading}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                You&apos;re {actionText} <strong>{candidateName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-lg p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-[var(--text-muted)]">{scoreContext}</p>
        <p className="mb-4 text-sm font-medium text-[var(--text)]">{BRAND.overrideFeedback}</p>

        <div className="mb-4 space-y-2">
          {OVERRIDE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] p-3 transition hover:bg-[var(--surface)]"
            >
              <input
                type="radio"
                name="override_reason"
                value={option.value}
                checked={selectedReason === option.value}
                onChange={() => setSelectedReason(option.value)}
                disabled={loading}
                className="mt-0.5"
              />
              <span className="text-sm text-[var(--text)]">{option.label}</span>
            </label>
          ))}
        </div>

        {selectedReason === "other" && (
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[var(--text)]">
              Please explain (optional)
            </label>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              disabled={loading}
              placeholder="Share any additional context..."
              maxLength={500}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {reasonText.length}/500 characters
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedReason || loading}
            className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent)]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Processing..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
