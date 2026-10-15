"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  FileText,
  Upload,
  Download,
  Loader2,
  Star,
  Plus,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import type { ResumeVersion } from "@/types";

interface ResumeVersionsData {
  versions: ResumeVersion[];
}

export default function CandidateResumesPage() {
  const params = useParams();
  const id = params.id as string;
  const [uploadFormOpen, setUploadFormOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: candidateData } = useApiQuery<{
    candidate: { name: string | null };
  }>(id ? `/api/candidates/${id}` : null);

  const {
    data: resumesData,
    loading,
    error,
    refetch,
  } = useApiQuery<ResumeVersionsData>(id ? `/api/candidates/${id}/resumes` : null);

  const { mutate: uploadResume } = useOptimisticMutation<
    { version: ResumeVersion },
    { file_url: string; file_name: string; is_default?: boolean }
  >(id ? `/api/candidates/${id}/resumes` : "", {
    method: "POST",
    onSuccess: () => {
      toast({ title: "CV uploaded", tone: "success" });
    },
    onError: (err) => {
      toast({ title: "Upload failed", description: err.message, tone: "error" });
    },
  });

  const handleSetDefaultResume = async (versionId: string) => {
    setSettingDefault(versionId);
    try {
      const res = await fetch(`/api/candidates/${id}/resumes/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Default CV updated", tone: "success" });
        await refetch();
      } else {
        toast({ title: "Failed to update default", tone: "error" });
      }
    } finally {
      setSettingDefault(null);
    }
  };

  const candidateName = candidateData?.candidate?.name ?? "Candidate";
  const versions = resumesData?.versions ?? [];

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileUrl.trim() || !fileName.trim()) {
      setUploadError("File URL and file name are required");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const result = await uploadResume({
        file_url: fileUrl.trim(),
        file_name: fileName.trim(),
        is_default: isDefault || versions.length === 0,
      });

      if (result) {
        setFileUrl("");
        setFileName("");
        setIsDefault(false);
        setUploadFormOpen(false);
        await refetch();
      } else {
        setUploadError("Failed to upload CV. Please try again.");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload CV");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="CV versions"
        subtitle={candidateName}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUploadFormOpen(!uploadFormOpen)}
              className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
            >
              <Plus size={16} />
              Upload Version
            </button>
            <Link
              href={`/recruit/candidates/${id}`}
              className="flex items-center gap-2 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
            >
              <ArrowLeft size={16} />
              Back
            </Link>
          </div>
        }
      />
      <div className="mx-auto max-w-4xl space-y-6">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Upload Form */}
        {uploadFormOpen && (
          <div className="card-lifted p-6">
            <h2 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
              <Upload size={20} className="text-[var(--accent)]" />
              Upload new CV version
            </h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  File URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="https://example.com/cv.pdf"
                  required
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-1 focus:ring-white/20"
                />
                <p className="text-body mt-1 text-xs text-white/45">
                  Enter the URL where the CV file is hosted
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  File Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="cv_v2.pdf"
                  required
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-default"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-1 focus:ring-white/20"
                />
                <label htmlFor="is-default" className="text-sm text-[var(--text)] cursor-pointer">
                  Set as default CV
                </label>
              </div>

              {uploadError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
                  {uploadError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadFormOpen(false);
                    setFileUrl("");
                    setFileName("");
                    setIsDefault(false);
                    setUploadError(null);
                  }}
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Upload
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Resume Versions List */}
        <div className="card-lifted p-6">
          <h2 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
            <FileText size={20} className="text-[var(--accent)]" />
            CV versions
          </h2>

          {loading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText size={40} className="mb-3 text-white/45" />
              <p className="text-sm text-white/65">No CV versions uploaded yet.</p>
              <p className="text-body mt-1 text-xs text-white/45">
                Upload the first version to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="card-lifted card-lifted-hover flex items-center justify-between gap-4 rounded-xl p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="shrink-0 text-[var(--accent)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="heading-card truncate text-sm font-semibold text-[var(--text)]">
                            {version.file_name}
                          </p>
                          {version.is_default && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/55 ring-1 ring-inset ring-white/[0.06]">
                              <Star size={10} className="fill-current" />
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-body mt-0.5 text-xs text-white/60">
                          Uploaded{" "}
                          {new Date(version.created_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!version.is_default && (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultResume(version.id)}
                        disabled={settingDefault === version.id}
                        className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {settingDefault === version.id ? "Saving..." : "Set Default"}
                      </button>
                    )}
                    <a
                      href={version.view_url ?? version.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black transition hover:opacity-90"
                    >
                      <Download size={14} />
                      View
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
