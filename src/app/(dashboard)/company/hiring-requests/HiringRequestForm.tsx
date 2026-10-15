"use client";
import { Loader2, Send, Save, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useHiringRequestForm } from "./useHiringRequestForm";
import { RequestEssentials } from "./RequestEssentials";
import { RequestDetails } from "./RequestDetails";
export function HiringRequestForm({
  requestId,
  initial = {},
}: {
  requestId?: string;
  initial?: Record<string, unknown>;
}) {
  const state = useHiringRequestForm(requestId, initial);
  const {
    title,
    step,
    setStep,
    stepHeading,
    saveError,
    loading,
    error,
    handleSubmit,
    continueToDetails,
  } = state;
  return (
    <div className="space-y-4 pb-28">
      <PageHeader
        title={requestId ? "Resume role request" : "Request a role"}
        subtitle="Save a draft or send it for approval."
      />
      <div className="mx-auto max-w-3xl">
        <Link
          href="/company/hiring-requests"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)]"
        >
          <ArrowLeft size={16} /> Back to requests
        </Link>
        <h2 ref={stepHeading} tabIndex={-1} className="sr-only">
          {step === 1 ? "Role essentials" : "Responsibilities and approval"}
        </h2>
        <ol aria-label="Request progress" className="mb-4 flex gap-3 text-sm">
          <li
            aria-current={step === 1 ? "step" : undefined}
            className={
              step === 1 ? "font-semibold text-[var(--accent)]" : "text-[var(--text-muted)]"
            }
          >
            1. Role essentials
          </li>
          <li
            aria-current={step === 2 ? "step" : undefined}
            className={
              step === 2 ? "font-semibold text-[var(--accent)]" : "text-[var(--text-muted)]"
            }
          >
            2. Responsibilities & approval
          </li>
        </ol>
        <form
          onSubmit={step === 1 ? continueToDetails : (e) => handleSubmit(e, false)}
          className="space-y-4"
        >
          {step === 1 ? (
            <>
              <RequestEssentials state={state} />
            </>
          ) : (
            <>
              <RequestDetails state={state} />
            </>
          )}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-end gap-3">
              {error && (
                <p
                  ref={saveError}
                  tabIndex={-1}
                  role="alert"
                  className="w-full text-sm text-[var(--status-danger-fg)]"
                >
                  {error}
                </p>
              )}
              {step === 2 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep(1)}
                  className="mr-auto rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)]"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                disabled={loading || !title.trim()}
                onClick={(e) => void handleSubmit(e, true)}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
              >
                <Save size={16} /> {loading ? "Saving…" : "Save draft"}
              </button>
              <button
                type="submit"
                disabled={loading || !title.trim()}
                className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {loading ? "Saving…" : step === 1 ? "Continue" : "Send for approval"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
