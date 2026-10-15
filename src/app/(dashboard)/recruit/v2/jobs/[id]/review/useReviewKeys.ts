"use client";

import { useEffect } from "react";
import { move, type Decision, type Queue } from "@/lib/v2/review-queue";

/**
 * Keyboard bindings for the review queue.
 *
 * One keystroke per candidate is the entire point — "too many clicks" is the
 * most common complaint recruiters make about incumbent tools. Modified keys
 * are ignored so browser shortcuts keep working, and while the reject-reason
 * menu is open only Escape is handled.
 */
export function useReviewKeys({
  disabled = false,
  askReason,
  setAskReason,
  act,
  setQ,
  undoHold,
}: {
  disabled?: boolean;
  askReason: boolean;
  setAskReason: (v: boolean) => void;
  act: (d: Decision, reason?: string) => void;
  setQ: (fn: (prev: Queue) => Queue) => void;
  undoHold?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (askReason) {
        if (k === "escape") setAskReason(false);
        return;
      }
      if (k === "j") setQ((p) => move(p, 1));
      else if (k === "k") setQ((p) => move(p, -1));
      else if (k === "a") act("advance");
      else if (k === "h") act("hold");
      else if (k === "r") setAskReason(true);
      else if (k === "u") undoHold?.();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, act, askReason, setAskReason, setQ, undoHold]);
}
