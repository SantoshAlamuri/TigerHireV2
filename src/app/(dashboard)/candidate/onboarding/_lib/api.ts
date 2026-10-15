"use client";

export type ParsedResume = {
  fullName?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  location?: string | null;
  experienceYears?: number | null;
  seniorityLevel?: string | null;
  skills?: string[];
};

export async function parseResumeRequest(
  signal: AbortSignal,
): Promise<{ ok: boolean; parsed?: ParsedResume }> {
  const pr = await fetch("/api/candidates/me/parse-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: "{}",
    signal,
  });
  const pj = (await pr.json().catch(() => ({}))) as { parsed?: ParsedResume };
  return { ok: pr.ok, parsed: pj.parsed };
}

type UploadResumeResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  viewUrl?: string;
  resumeUrl?: string;
  resume_url?: string;
};

export async function uploadResumeRequest(file: File): Promise<UploadResumeResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/candidates/upload-resume", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as UploadResumeResult;
  return { ...json, ok: res.ok };
}
