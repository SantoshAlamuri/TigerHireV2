"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Share2, Check, ExternalLink, Link2, FileInput, ChevronDown } from "lucide-react";
import { copyToClipboard } from "@/lib/utils/clipboard";
import {
  buildLinkedInShareUrl,
  buildPublicApplyUrl,
  getSocialJobShareUrl,
} from "@/lib/jobs/job-share-urls";

type ShareJobButtonProps = {
  jobId: string;
  isActive: boolean;
  orgSlug?: string | null;
  jobTitle?: string;
  companyName?: string;
};

type CopiedItem = "social" | "apply" | "failed" | null;

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-white/[0.06]";

export function ShareJobButton({
  jobId,
  isActive,
  orgSlug,
  jobTitle,
  companyName,
}: ShareJobButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<CopiedItem>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const socialUrl = getSocialJobShareUrl(jobId);
  const applyUrl = orgSlug?.trim() ? buildPublicApplyUrl(jobId, orgSlug.trim()) : socialUrl;
  const title =
    jobTitle && companyName ? `${jobTitle} – ${companyName}` : (jobTitle ?? "Job opening");

  const flashCopied = useCallback((item: CopiedItem) => {
    setCopied(item);
    window.setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleCopySocialLink = useCallback(async () => {
    // Label says copy, so copy — the OS share sheet was surprising on desktop.
    const ok = await copyToClipboard(socialUrl);
    flashCopied(ok ? "social" : "failed");
  }, [socialUrl, flashCopied]);

  const handleCopyApplyLink = useCallback(async () => {
    const ok = await copyToClipboard(applyUrl);
    flashCopied(ok ? "apply" : "failed");
  }, [applyUrl, flashCopied]);

  if (!isActive) return null;

  const linkedInHref = buildLinkedInShareUrl(socialUrl);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Share this job — copy links or post to LinkedIn"
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
      >
        <Share2 size={16} aria-hidden />
        Share
        <ChevronDown size={14} aria-hidden className="text-white/45" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-60 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleCopySocialLink()}
            title="Copy the public job page link (best for LinkedIn and social posts)"
            className={MENU_ITEM_CLASS}
          >
            {copied === "social" ? (
              <Check size={16} aria-hidden className="text-emerald-300" />
            ) : (
              <Link2 size={16} aria-hidden className="text-white/55" />
            )}
            {copied === "social"
              ? "Copied!"
              : copied === "failed"
                ? "Copy failed"
                : "Copy job link"}
          </button>
          {applyUrl !== socialUrl ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleCopyApplyLink()}
              title="Copy the direct apply link (CV upload)"
              className={MENU_ITEM_CLASS}
            >
              {copied === "apply" ? (
                <Check size={16} aria-hidden className="text-emerald-300" />
              ) : (
                <FileInput size={16} aria-hidden className="text-white/55" />
              )}
              {copied === "apply"
                ? "Copied!"
                : copied === "failed"
                  ? "Copy failed"
                  : "Copy apply link"}
            </button>
          ) : null}
          <a
            href={linkedInHref}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            title="Share this role on LinkedIn (opens LinkedIn with the job link)"
            className={MENU_ITEM_CLASS}
          >
            <ExternalLink size={16} aria-hidden className="text-[#7CB8FF]" />
            Share on LinkedIn
          </a>
        </div>
      )}
    </div>
  );
}
