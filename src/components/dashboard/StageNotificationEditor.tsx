"use client";

import { useId, useState } from "react";
import { Mail, X } from "lucide-react";

type StageNotificationEditorProps = {
  stageName: string;
  message: string;
  notifyCandidate: boolean;
  disabled?: boolean;
  onChange: (message: string) => void;
};

const SAMPLE_CONTEXT = {
  candidateName: "Priya",
  jobTitle: "Senior Product Designer",
  companyName: "Acme Talent",
};

function applyVariables(message: string, stageName: string): string {
  return message
    .replaceAll("{candidateName}", SAMPLE_CONTEXT.candidateName)
    .replaceAll("{jobTitle}", SAMPLE_CONTEXT.jobTitle)
    .replaceAll("{companyName}", SAMPLE_CONTEXT.companyName)
    .replaceAll("{stageName}", stageName || "Interview");
}

export function StageNotificationEditor({
  stageName,
  message,
  notifyCandidate,
  disabled = false,
  onChange,
}: StageNotificationEditorProps) {
  const [open, setOpen] = useState(false);
  const textareaId = useId();
  const stageLabel = stageName.trim() || "this stage";
  const sampleStage = stageName.trim() || "Interview";
  const renderedMessage = applyVariables(message, sampleStage);
  const canEdit = notifyCandidate && !disabled;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canEdit}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 text-xs font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Mail size={14} />
        {message.trim() ? "Edit message" : "Default email"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <div className="card-lifted max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Candidate notification
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--text)]">{stageLabel}</h3>
                <p className="mt-1 text-sm text-white/60">
                  Candidates receive this when they are moved into this stage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-white/60 transition hover:bg-white/[0.04] hover:text-white"
                aria-label="Close notification editor"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <h4 className="text-sm font-semibold text-[var(--text)]">
                  What goes out by default
                </h4>
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-white/68">
                  <p>Subject: Application update</p>
                  <p>Hi {SAMPLE_CONTEXT.candidateName},</p>
                  <p>
                    Your application for <strong>{SAMPLE_CONTEXT.jobTitle}</strong> at{" "}
                    <strong>{SAMPLE_CONTEXT.companyName}</strong> has been updated.
                  </p>
                  <p>
                    You are now at the <strong>{sampleStage}</strong> stage.
                  </p>
                  <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">
                    TigerHire also includes the standard candidate dashboard button.
                  </p>
                </div>
              </section>

              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <label htmlFor={textareaId} className="text-sm font-semibold text-[var(--text)]">
                  Additional message
                </label>
                <p className="mt-1 text-xs text-white/55">
                  Plain text only. You can use {"{candidateName}"}, {"{jobTitle}"},{" "}
                  {"{companyName}"}, and {"{stageName}"}.
                </p>
                <textarea
                  id={textareaId}
                  value={message}
                  onChange={(event) => onChange(event.target.value)}
                  rows={7}
                  className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--text)] placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-white/20"
                  placeholder="Example: Please keep an eye on your inbox. Our team will share next steps shortly."
                />
              </section>
            </div>

            <section className="mt-3 rounded-xl border border-[var(--border)] bg-white/[0.02] p-4">
              <h4 className="text-sm font-semibold text-[var(--text)]">Preview</h4>
              <div className="mt-3 rounded-lg border border-white/10 bg-[var(--bg)] p-4 text-sm leading-relaxed text-white/70">
                <p>Hi {SAMPLE_CONTEXT.candidateName},</p>
                <p className="mt-2">
                  Your application for <strong>{SAMPLE_CONTEXT.jobTitle}</strong> at{" "}
                  <strong>{SAMPLE_CONTEXT.companyName}</strong> has been updated.
                </p>
                <p className="mt-2">
                  You are now at the <strong>{sampleStage}</strong> stage.
                </p>
                {renderedMessage.trim() ? (
                  <p className="mt-3 whitespace-pre-line">{renderedMessage}</p>
                ) : null}
              </div>
            </section>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.04] hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
