"use client";

import { useCallback, useState } from "react";
import { FileText, ExternalLink, Loader2, X } from "lucide-react";

export type ResumeVersionRow = { id: string; file_name: string; view_url?: string };

interface CandidateResumeAccessProps {
  candidateId: string;
  versions: ResumeVersionRow[];
  /** Parsed CV body from DB when no `resume_versions` row exists */
  cvRawText: string;
  /** Legacy `candidates.resume_url` or `cv_url` */
  legacyResumeUrl: string;
  /** `inline`: compact controls for placement next to the candidate name (no section heading). */
  variant?: "section" | "inline";
}

export function CandidateResumeAccess({
  candidateId,
  versions,
  cvRawText,
  legacyResumeUrl,
  variant = "section",
}: CandidateResumeAccessProps) {
  const [cvTextOpen, setCvTextOpen] = useState(false);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const hasLegacyUrl = legacyResumeUrl.length > 0;

  const openResumeFile = useCallback(
    async (versionId?: string) => {
      const key = versionId ?? "legacy";
      setOpeningKey(key);
      setOpenError(null);
      try {
        const tryEndpoint = async (endpoint: string) => {
          const res = await fetch(endpoint, { credentials: "include" });
          const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
          return { res, body };
        };

        const primaryEndpoint = versionId
          ? `/api/candidates/${candidateId}/resumes/${versionId}/signed-url`
          : `/api/candidates/${candidateId}/resume-view-url`;

        let { res, body } = await tryEndpoint(primaryEndpoint);

        if (!res.ok && versionId && hasLegacyUrl) {
          const fallback = await tryEndpoint(`/api/candidates/${candidateId}/resume-view-url`);
          res = fallback.res;
          body = fallback.body;
        }

        if (!res.ok) {
          setOpenError(
            body.error ??
              (res.status === 401
                ? "Session expired — sign in again, then retry."
                : "Could not open CV."),
          );
          return;
        }
        if (!body.url) {
          setOpenError("Could not open CV.");
          return;
        }
        window.open(body.url, "_blank", "noopener,noreferrer");
      } catch {
        setOpenError("Network error while opening CV.");
      } finally {
        setOpeningKey(null);
      }
    },
    [candidateId, hasLegacyUrl],
  );
  const hasVersions = versions.length > 0;
  const hasCvText = cvRawText.length > 0;
  const inline = variant === "inline";

  const primaryChip = inline
    ? "inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/45 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
    : "inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20";

  const secondaryChip = inline
    ? "inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
    : "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]";

  const iconSize = inline ? 13 : 12;
  const externalSize = inline ? 11 : 10;

  const hasResumeActions = hasVersions || hasLegacyUrl || hasCvText;

  const controlsRow = (
    <div
      className={
        inline
          ? "inline-flex max-w-full flex-wrap items-center gap-1.5"
          : "flex flex-wrap items-center gap-2"
      }
    >
      {hasVersions
        ? versions.map((rv) =>
            rv.view_url || rv.id ? (
              <button
                key={rv.id}
                type="button"
                onClick={() => void openResumeFile(rv.id)}
                disabled={openingKey === rv.id}
                className={`${primaryChip} max-w-[14rem] min-w-0 shrink disabled:opacity-60`}
                title={rv.file_name || "CV"}
              >
                {openingKey === rv.id ? (
                  <Loader2 size={iconSize} className="shrink-0 animate-spin" />
                ) : (
                  <FileText size={iconSize} className="shrink-0" />
                )}
                <span className="truncate">
                  {inline
                    ? versions.length > 1
                      ? rv.file_name?.trim() || "CV"
                      : "CV"
                    : `View ${rv.file_name || "CV"}`}
                </span>
                <ExternalLink size={externalSize} className="shrink-0 opacity-80" />
              </button>
            ) : (
              <span
                key={rv.id}
                className={`text-body text-xs ${inline ? "text-white/40" : "text-[var(--text-subtle)]"}`}
                title="Storage link could not be generated"
              >
                {(rv.file_name || "CV") + " (unavailable)"}
              </span>
            ),
          )
        : null}

      {!hasVersions && hasLegacyUrl ? (
        <button
          type="button"
          onClick={() => void openResumeFile()}
          disabled={openingKey === "legacy"}
          className={`${primaryChip} disabled:opacity-60`}
        >
          {openingKey === "legacy" ? (
            <Loader2 size={iconSize} className="animate-spin" />
          ) : (
            <FileText size={iconSize} />
          )}
          {inline ? "CV" : "Open CV file"}
          <ExternalLink size={externalSize} className="opacity-80" />
        </button>
      ) : null}

      {!hasVersions && !hasLegacyUrl && hasCvText ? (
        <button type="button" onClick={() => setCvTextOpen(true)} className={primaryChip}>
          <FileText size={iconSize} />
          {inline ? "CV text" : "View CV text"}
        </button>
      ) : null}

      {hasVersions && hasCvText ? (
        <button type="button" onClick={() => setCvTextOpen(true)} className={secondaryChip}>
          {inline ? "Extracted text" : "View extracted text"}
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      {!inline ? (
        <p className="text-body mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          CV
        </p>
      ) : null}

      {hasResumeActions ? (
        controlsRow
      ) : !inline ? (
        <p className="text-body text-xs text-[var(--text-subtle)]">
          No CV on file. Upload a CV on the candidate profile to attach a document.
        </p>
      ) : (
        <span className="text-xs text-white/35">No CV</span>
      )}

      {openError ? (
        <p
          className={`text-xs text-red-400 ${inline ? "mt-1 w-full basis-full" : "mt-2"}`}
          role="alert"
        >
          {openError}
        </p>
      ) : null}

      {cvTextOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-viewer-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close CV viewer"
            onClick={() => setCvTextOpen(false)}
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 id="cv-viewer-title" className="text-sm font-semibold text-[var(--text)]">
                CV text (extracted)
              </h2>
              <button
                type="button"
                onClick={() => setCvTextOpen(false)}
                className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-muted)]">
                {cvRawText}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
