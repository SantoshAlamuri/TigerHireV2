"use client";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  hasCriticalDeliveryFailure,
  listFailedChannelLabels,
  type SlotDeliveryFields,
} from "@/lib/interviews/delivery-status";

export function InviteDeliveryBanner({
  delivery,
  onResend,
  resending,
}: {
  delivery: SlotDeliveryFields;
  onResend: () => void;
  resending?: boolean;
}) {
  if (!hasCriticalDeliveryFailure(delivery)) return null;

  const failed = listFailedChannelLabels(delivery);

  return (
    <div
      className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
        <div className="flex-1 space-y-2">
          <p>
            Invites failed for: <strong className="font-medium">{failed.join(", ")}</strong>.
          </p>
          <button
            type="button"
            onClick={onResend}
            disabled={resending}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-50 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw size={14} aria-hidden />
            )}
            Resend invites
          </button>
        </div>
      </div>
    </div>
  );
}
