"use client";

import { useState, useRef } from "react";
import { Loader2, Upload, FileText, Sparkles, Link2, Type } from "lucide-react";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { inputClass } from "@/lib/styles/form";
import type { ParsedWizardData, JdSection } from "./types";

interface Step1InputProps {
  onParsed: (data: ParsedWizardData) => void;
}

type InputMode = null | "upload" | "type" | "ai" | "url";

export function Step1Input({ onParsed }: Step1InputProps) {
  const [mode, setMode] = useState<InputMode>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Type mode state
  const [pasteText, setPasteText] = useState("");

  // AI mode state
  const [aiPrompt, setAiPrompt] = useState("");
  const [companyTone, setCompanyTone] = useState("Professional and concise");
  const [companyContext, setCompanyContext] = useState("");
  const [mustInclude, setMustInclude] = useState("");

  // URL mode state
  const [jdUrl, setJdUrl] = useState("");

  async function handleApiCall(url: string, body: FormData | object) {
    setLoading(true);
    setError(null);
    try {
      const isFormData = body instanceof FormData;
      const res = await fetch(url, {
        method: "POST",
        ...(isFormData
          ? { body }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        return;
      }
      const data: ParsedWizardData = {
        metadata: json.metadata,
        sections: json.sections as JdSection[],
        rawText: json.rawText ?? "",
      };
      onParsed(data);
    } catch {
      setError("Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    if (file.size > MAX_STANDARD_UPLOAD_BYTES) {
      setError(`File too large. Maximum ${MAX_STANDARD_UPLOAD_BYTES / 1024 / 1024}MB.`);
      return;
    }
    const form = new FormData();
    form.append("file", file);
    await handleApiCall("/api/jobs/upload-jd", form);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleParseText() {
    const trimmed = pasteText.trim();
    if (trimmed.length < 50) {
      setError("Please paste at least a few sentences of job description text.");
      return;
    }
    await handleApiCall("/api/jobs/parse-jd-text", { text: trimmed });
  }

  async function handleGenerate() {
    const trimmed = aiPrompt.trim();
    if (!trimmed || trimmed.length < 10) {
      setError("Describe the role in at least 10 characters.");
      return;
    }
    await handleApiCall("/api/jobs/generate-jd", {
      prompt: trimmed,
      companyTone: companyTone.trim() || undefined,
      companyContext: companyContext.trim() || undefined,
      mustInclude: mustInclude
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    });
  }

  async function handleUrl() {
    const url = jdUrl.trim();
    if (!url) return;
    await handleApiCall("/api/jobs/parse-jd-url", { url });
  }

  if (mode === null) {
    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-[var(--text-muted)]">
          Choose how you want to create the job description
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ModeCard
            icon={<FileText className="h-6 w-6" />}
            title="Upload PDF / DOC"
            description="Upload an existing JD file and we'll parse it into editable sections"
            onClick={() => setMode("upload")}
          />
          <ModeCard
            icon={<Type className="h-6 w-6" />}
            title="Paste / Type Text"
            description="Paste or type the JD text and we'll structure it into sections"
            onClick={() => setMode("type")}
          />
          <ModeCard
            icon={<Sparkles className="h-6 w-6" />}
            title="Generate with AI"
            description="Describe the role briefly and AI will generate all sections"
            onClick={() => setMode("ai")}
          />
          <ModeCard
            icon={<Link2 className="h-6 w-6" />}
            title="Import from URL"
            description="Paste a public job URL (LinkedIn, Naukri) to extract the JD"
            onClick={() => setMode("url")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => {
          setMode(null);
          setError(null);
        }}
        className="text-sm text-[var(--accent)] hover:underline"
      >
        &larr; Back to input options
      </button>

      {/* Upload */}
      {mode === "upload" && (
        <div
          className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/40 p-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleUpload(file);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            aria-label="Upload job description document"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)]/15">
              <FileText className="h-7 w-7 text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text)]">
                Drop a PDF, DOCX, or TXT file here
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                or click the button below to browse (max {MAX_STANDARD_UPLOAD_BYTES / 1024 / 1024}{" "}
                MB)
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-2.5 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface)] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Parsing…
                </>
              ) : (
                <>
                  <Upload size={16} /> Choose file
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Type / Paste */}
      {mode === "type" && (
        <div className="space-y-3">
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setError(null);
            }}
            placeholder="Paste or type the full job description text here…"
            rows={12}
            className={`${inputClass} resize-y`}
            disabled={loading}
          />
          <button
            type="button"
            disabled={loading || pasteText.trim().length < 50}
            onClick={handleParseText}
            className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Parsing…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Parse into sections
              </>
            )}
          </button>
        </div>
      )}

      {/* AI Generate */}
      {mode === "ai" && (
        <div className="space-y-3">
          <textarea
            value={aiPrompt}
            onChange={(e) => {
              setAiPrompt(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Senior backend engineer, Bangalore, Java and Spring Boot, 20-30 LPA, remote allowed. Reports to Engineering Manager. 5+ years experience."
            rows={4}
            className={`${inputClass} resize-y`}
            disabled={loading}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={companyTone}
              onChange={(e) => setCompanyTone(e.target.value)}
              placeholder="Tone (e.g. Bold, founder-led)"
              className={inputClass}
              disabled={loading}
            />
            <input
              type="text"
              value={companyContext}
              onChange={(e) => setCompanyContext(e.target.value)}
              placeholder="Company context (industry, stage)"
              className={inputClass}
              disabled={loading}
            />
          </div>
          <textarea
            value={mustInclude}
            onChange={(e) => setMustInclude(e.target.value)}
            placeholder={
              "Must-include points (one per line)\ne.g. Experience with event-driven systems"
            }
            rows={3}
            className={`${inputClass} resize-y`}
            disabled={loading}
          />
          <button
            type="button"
            disabled={loading || !aiPrompt.trim()}
            onClick={handleGenerate}
            className="flex items-center justify-center gap-2 self-end rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Generate JD
              </>
            )}
          </button>
        </div>
      )}

      {/* URL */}
      {mode === "url" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={jdUrl}
              onChange={(e) => {
                setJdUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://www.linkedin.com/jobs/..."
              className={inputClass}
              disabled={loading}
            />
            <button
              type="button"
              disabled={loading || !jdUrl.trim()}
              onClick={handleUrl}
              className="flex shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Fetching…
                </>
              ) : (
                "Fetch & parse"
              )}
            </button>
          </div>
          <p className="text-xs text-[var(--text-subtle)]">
            Note: Some sites (e.g. LinkedIn) load content via JavaScript and may not return full JD
            text.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function ModeCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-center transition hover:border-[var(--accent)]/50 hover:shadow-lg"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
      </div>
    </button>
  );
}
