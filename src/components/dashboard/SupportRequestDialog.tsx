"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, LifeBuoy, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { invalidateQueries } from "@/lib/hooks/use-api";
import {
  SUPPORT_REQUEST_CATEGORIES,
  SUPPORT_REQUEST_PRIORITIES,
  type CreateSupportRequestInput,
} from "@/lib/validations/support";

const CATEGORY_LABELS: Record<(typeof SUPPORT_REQUEST_CATEGORIES)[number], string> = {
  billing: "Billing",
  onboarding: "Onboarding",
  access: "Access",
  reliability: "Reliability",
  general: "General",
};

const PRIORITY_LABELS: Record<(typeof SUPPORT_REQUEST_PRIORITIES)[number], string> = {
  p1: "P1 - Critical",
  p2: "P2 - High",
  p3: "P3 - Normal",
  p4: "P4 - Low",
};
const SUBJECT_MIN_LENGTH = 5;
const DESCRIPTION_MIN_LENGTH = 10;

interface SupportRequestDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SupportRequestDialog({ open, onClose }: SupportRequestDialogProps) {
  const pathname = usePathname();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicketNumber, setSubmittedTicketNumber] = useState<string | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const [form, setForm] = useState<CreateSupportRequestInput>({
    category: "general",
    priority: "p3",
    subject: "",
    description: "",
    contextPath: "",
  });

  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
      if (autoCloseTimerRef.current !== null) {
        window.clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setSubmittedTicketNumber(null);
      if (autoCloseTimerRef.current !== null) {
        window.clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    }
  }, [open]);

  if (!open || !mounted) return null;

  async function submitRequest() {
    const subject = form.subject.trim();
    const description = form.description.trim();
    if (!subject || !description) {
      toast({ title: "Subject and description are required", tone: "warning" });
      return;
    }
    if (subject.length < SUBJECT_MIN_LENGTH || description.length < DESCRIPTION_MIN_LENGTH) {
      toast({
        title: `Subject must be at least ${SUBJECT_MIN_LENGTH} chars and description at least ${DESCRIPTION_MIN_LENGTH} chars.`,
        tone: "warning",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/support-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          subject,
          description,
          contextPath: pathname,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        ticketNumber?: string | null;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not submit support request.");
      }
      toast({
        title: payload.ticketNumber
          ? `Support request submitted (${payload.ticketNumber})`
          : "Support request submitted",
        tone: "success",
      });
      invalidateQueries("/api/support-requests");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("support-request:created"));
      }
      setSubmittedTicketNumber(payload.ticketNumber ?? null);
      setForm({
        category: "general",
        priority: "p3",
        subject: "",
        description: "",
        contextPath: "",
      });
      if (autoCloseTimerRef.current !== null) {
        window.clearTimeout(autoCloseTimerRef.current);
      }
      autoCloseTimerRef.current = window.setTimeout(() => {
        setSubmittedTicketNumber(null);
        onClose();
      }, 2200);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not submit support request.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex min-h-full items-start justify-center p-3 pt-14 sm:p-6 sm:pt-20">
        <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-2 text-white">
              <LifeBuoy size={18} className="text-[var(--accent)]" />
              <h2 className="text-lg font-semibold">
                {submittedTicketNumber ? "Support request submitted" : "Raise support request"}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close support request dialog"
              onClick={onClose}
              disabled={submitting}
              className="text-white/70 hover:text-white disabled:opacity-60"
            >
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">
            {submittedTicketNumber ? (
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="mt-0.5 text-emerald-300" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">
                      Your request has been submitted successfully.
                    </p>
                    <p className="mt-1 text-sm text-white/80">
                      Ticket number:{" "}
                      <span className="font-mono font-semibold text-white">
                        {submittedTicketNumber}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      You can track updates, resolution, and feedback from the support tickets page.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm text-white/60">
                  This creates a ticket in the platform admin support queue.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-white/70">
                    Category
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          category: e.target.value as (typeof SUPPORT_REQUEST_CATEGORIES)[number],
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      {SUPPORT_REQUEST_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {CATEGORY_LABELS[category]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-white/70">
                    Priority
                    <select
                      value={form.priority}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          priority: e.target.value as (typeof SUPPORT_REQUEST_PRIORITIES)[number],
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      {SUPPORT_REQUEST_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mt-3 block text-sm text-white/70">
                  Subject
                  <input
                    value={form.subject}
                    onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="Short summary of the issue"
                    minLength={SUBJECT_MIN_LENGTH}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                  <span className="mt-1 block text-xs text-white/45">
                    Minimum {SUBJECT_MIN_LENGTH} characters.
                  </span>
                </label>

                <label className="mt-3 block text-sm text-white/70">
                  Description
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={5}
                    placeholder="What happened, what you expected, and any blockers."
                    minLength={DESCRIPTION_MIN_LENGTH}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                  <span className="mt-1 block text-xs text-white/45">
                    Minimum {DESCRIPTION_MIN_LENGTH} characters.
                  </span>
                </label>

                <p className="mt-2 text-xs text-white/50">Current page: {pathname}</p>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
            <Link
              href="/support-requests"
              onClick={onClose}
              className="mr-auto inline-flex items-center rounded-full border border-[var(--border)] px-4 py-2 text-sm text-white/75 hover:bg-[var(--surface)]"
            >
              Track my tickets
            </Link>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-white/80 disabled:opacity-60"
            >
              {submittedTicketNumber ? "Close" : "Cancel"}
            </button>
            {submittedTicketNumber ? (
              <button
                type="button"
                onClick={() => setSubmittedTicketNumber(null)}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
              >
                Raise another request
              </button>
            ) : (
              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Submit request
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
