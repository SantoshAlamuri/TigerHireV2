"use client";

import { Check, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconTile } from "@/components/ui/IconTile";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WHATSAPP_CV_DROP_LINK } from "@/lib/config/whatsapp";
import { StepHeading } from "../primitives";
import type { OnboardingApi } from "../../_hooks/use-onboarding";

export function ResumeStep({ s }: { s: OnboardingApi }) {
  const {
    fileInputRef,
    dragActive,
    setDragActive,
    uploading,
    handleUpload,
    uploadError,
    resumeUrl,
    parseStatus,
    runParse,
  } = s;
  return (
    <div className="space-y-4">
      <StepHeading
        icon={<FileText size={18} />}
        title="Start with your résumé"
        hint="We read it and pre-fill the next steps — no retyping."
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleUpload(file);
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-dashed px-6 py-10 text-center transition-colors ${
          dragActive
            ? "border-[var(--accent)] bg-[var(--accent)]/5"
            : "border-[var(--border-hover)]"
        }`}
      >
        <IconTile size="lg">
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
        </IconTile>
        <p className="text-sm text-[var(--text-muted)]">Drag &amp; drop your résumé, or</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          Choose file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <p className="text-caption text-[var(--text-subtle)]">PDF, DOCX, DOC or TXT · up to 10MB</p>
      </div>
      <p className="text-center text-xs text-[var(--text-subtle)]">
        Prefer chat?{" "}
        <a
          href={WHATSAPP_CV_DROP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring rounded-[var(--radius-sm)] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          Send your CV on WhatsApp
        </a>{" "}
        and we&apos;ll match you automatically.
      </p>
      {uploadError ? (
        <p className="text-sm text-[color:var(--status-danger-fg)]">{uploadError}</p>
      ) : null}
      {resumeUrl ? (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="success" size="sm">
              <Check size={12} aria-hidden /> Résumé saved
            </StatusBadge>
            {parseStatus === "done" ? (
              <StatusBadge tone="info" size="sm">
                <Sparkles size={12} aria-hidden /> Details filled in
              </StatusBadge>
            ) : null}
          </div>
          {parseStatus === "parsing" ? (
            <p className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 size={14} className="animate-spin" /> Reading your résumé — this can take up
              to a minute…
            </p>
          ) : parseStatus === "failed" || parseStatus === "empty" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-[var(--text-subtle)]">
                {parseStatus === "empty"
                  ? "We couldn't read much from this file — try a text-based PDF, or just add your details in the next steps."
                  : "Couldn't auto-read it — try again, or just continue and fill the details manually."}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void runParse()}>
                Try again
              </Button>
            </div>
          ) : parseStatus === "done" ? (
            <button
              type="button"
              onClick={() => void runParse()}
              className="focus-ring rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-subtle)] hover:text-[var(--text)]"
            >
              Re-read résumé
            </button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => void runParse()}>
              Auto-fill from résumé
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
