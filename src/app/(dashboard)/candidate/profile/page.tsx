"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Save,
  Upload,
  X,
  Plus,
  FileText,
  Download,
  Loader2,
  Check,
  AlertCircle,
  Trash2,
  AlertTriangle,
  Link2,
  Globe,
  Code2,
  UserRound,
  BriefcaseBusiness,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery, useOptimisticMutation, invalidateQueries } from "@/lib/hooks/use-api";
import { CareerDetailsSection } from "./components/CareerDetailsSection";
import { CandidatePreferencesForm } from "../preferences/PreferencesForm";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { ReferrerDetailsSection } from "./components/ReferrerDetailsSection";

const COUNTRY_CODES = [
  { code: "+91", label: "India" },
  { code: "+1", label: "United States/Canada" },
  { code: "+44", label: "United Kingdom" },
  { code: "+61", label: "Australia" },
  { code: "+65", label: "Singapore" },
  { code: "+971", label: "UAE" },
] as const;

function splitWhatsappNumber(whatsappNumber: string): { countryCode: string; local: string } {
  const raw = whatsappNumber.trim();
  const matched = COUNTRY_CODES.find((opt) => raw.startsWith(opt.code));
  if (matched) {
    return {
      countryCode: matched.code,
      local: raw.slice(matched.code.length).replace(/\D/g, ""),
    };
  }
  return {
    countryCode: "+91",
    local: raw.replace(/\D/g, ""),
  };
}

interface ResumeVersionRow {
  id: string;
  file_url: string;
  file_name: string;
  is_default: boolean;
  created_at: string;
  /** Use for View/Download when present (signed URL for private bucket) */
  view_url?: string;
}

function ResumeVersionsSection({
  candidateId,
  refreshKey,
}: {
  candidateId: string | null;
  refreshKey?: number;
}) {
  const url =
    candidateId != null
      ? `/api/candidates/${candidateId}/resumes${refreshKey != null ? `?refresh=${refreshKey}` : ""}`
      : null;
  const { data, loading, refetch } = useApiQuery<{
    versions: ResumeVersionRow[];
  }>(url);
  const versions = data?.versions ?? [];
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (!candidateId) return null;

  const setDefault = async (versionId: string) => {
    setSettingDefault(versionId);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/resumes/${versionId}`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) await refetch();
    } finally {
      setSettingDefault(null);
    }
  };

  const deleteVersion = async (versionId: string) => {
    if (!confirm("Remove this resume version?")) return;
    setDeleting(versionId);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/resumes/${versionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) await refetch();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="card-lifted p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="heading-section text-base text-white">Resume versions</h3>
        {versions.length > 0 && (
          <span className="text-[10px] uppercase tracking-wider text-white/45">
            View links valid 1 hour
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : versions.length === 0 ? (
        <p className="text-body text-sm text-white/45">
          No resume versions yet. Upload a resume below to create one.
        </p>
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="shrink-0 text-white/55" />
                <a
                  href={v.view_url ?? v.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm font-medium text-white/80 hover:text-white hover:underline"
                >
                  {v.file_name}
                </a>
                {v.is_default && (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!v.is_default && (
                  <button
                    type="button"
                    disabled={!!settingDefault}
                    onClick={() => setDefault(v.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-white/65 hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {settingDefault === v.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      "Set default"
                    )}
                  </button>
                )}
                {!v.is_default && (
                  <button
                    type="button"
                    disabled={!!deleting}
                    onClick={() => deleteVersion(v.id)}
                    className="rounded-md p-1 text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Delete version"
                  >
                    {deleting === v.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <X size={14} />
                    )}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CandidateProfilePage() {
  const [activeTab, setActiveTab] = useState("personal");
  const [dirty, setDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedCandidateId, setSavedCandidateId] = useState<string | null>(null);

  const {
    data: profileData,
    loading,
    error: profileLoadError,
    refetch: refetchProfile,
  } = useApiQuery<{
    profile: Record<string, unknown>;
    candidate: Record<string, unknown> | null;
    referrer?: Record<string, unknown> | null;
  }>("/api/profiles");

  const profile = profileData?.profile;
  const candidateRecord = profileData?.candidate;
  const referrerRecord = profileData?.referrer ?? null;

  const {
    mutate: saveProfile,
    loading: saving,
    error: saveError,
  } = useOptimisticMutation<Record<string, unknown>, Record<string, unknown>>("/api/profiles", {
    method: "PATCH",
  });

  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [yearsExperience, setYearsExperience] = useState(0);
  const [seniorityLevel, setSeniorityLevel] = useState("Mid");
  const [visible, setVisible] = useState(true);
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [saved, setSaved] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [referrerType, setReferrerType] = useState<"individual" | "agency">("individual");
  const [referrerCountryCode, setReferrerCountryCode] =
    useState<(typeof COUNTRY_CODES)[number]["code"]>("+91");
  const [referrerLocalWhatsapp, setReferrerLocalWhatsapp] = useState("");
  const [referrerCity, setReferrerCity] = useState("");
  const [referrerWorkEmail, setReferrerWorkEmail] = useState("");
  const [referrerLinkedinUrl, setReferrerLinkedinUrl] = useState("");
  const [referrerUpiId, setReferrerUpiId] = useState("");
  const [referrerWhatsappVerified, setReferrerWhatsappVerified] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeListRefreshKey, setResumeListRefreshKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [erasureModalOpen, setErasureModalOpen] = useState(false);
  const [erasureLoading, setErasureLoading] = useState(false);
  const [erasureSuccess, setErasureSuccess] = useState(false);
  const [erasureError, setErasureError] = useState<string | null>(null);
  const [dataExportLoading, setDataExportLoading] = useState(false);
  const [dataExportSuccess, setDataExportSuccess] = useState(false);
  const [dataExportError, setDataExportError] = useState<string | null>(null);
  const referrerWhatsapp = `${referrerCountryCode}${referrerLocalWhatsapp}`;

  useEffect(() => {
    if (hydrated) return;
    if (profile) {
      setHydrated(true);
      setSavedCandidateId((candidateRecord?.id as string | undefined) ?? null);
      setName((profile.full_name as string) ?? "");
      setRoleTitle((profile.role_title as string) ?? "");
      setCurrentCompany((profile.current_company as string) ?? "");
      setLocationCity((profile.location as string) ?? "");
      setYearsExperience((profile.experience_years as number) ?? 0);
      setSeniorityLevel((profile.seniority_level as string) ?? "Mid");
      setVisible((profile.visibility as boolean) ?? true);
      setSkills((profile.skills as string[]) ?? []);
      setLinkedinUrl((profile.linkedin_url as string) ?? "");
      setPortfolioUrl((profile.portfolio_url as string) ?? "");
      setGithubUrl((profile.github_url as string) ?? "");
      setResumeUrl((profile.resume_url as string) ?? null);
    }
    if (referrerRecord) {
      const typeRaw = (referrerRecord.type as string | undefined) ?? "individual";
      setReferrerType(typeRaw === "agency" ? "agency" : "individual");
      const { countryCode, local } = splitWhatsappNumber(
        (referrerRecord.whatsapp_number as string | undefined) ?? "",
      );
      setReferrerCountryCode(countryCode as (typeof COUNTRY_CODES)[number]["code"]);
      setReferrerLocalWhatsapp(local);
      setReferrerCity((referrerRecord.city as string | undefined) ?? "");
      setReferrerWorkEmail((referrerRecord.work_email as string | undefined) ?? "");
      setReferrerLinkedinUrl((referrerRecord.linkedin_url as string | undefined) ?? "");
      setReferrerUpiId((referrerRecord.upi_id as string | undefined) ?? "");
      setReferrerWhatsappVerified(Boolean(referrerRecord.whatsapp_verified));
    }
  }, [profile, referrerRecord, candidateRecord, hydrated]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const handleResumeUpload = useCallback(
    async (file: File) => {
      setUploadError(null);
      setUploadSuccess(false);

      const allowed = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/plain",
      ];
      if (!allowed.includes(file.type)) {
        setUploadError("Only PDF, DOCX, DOC, or TXT files are allowed.");
        return;
      }
      if (file.size > MAX_STANDARD_UPLOAD_BYTES) {
        setUploadError(`File must be under ${MAX_STANDARD_UPLOAD_BYTES / 1024 / 1024}MB.`);
        return;
      }

      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/candidates/upload-resume", {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!res.ok) {
          setUploadError(json.error ?? "Upload failed");
        } else {
          setResumeUrl(json.viewUrl ?? json.resumeUrl ?? json.resume_url ?? null);
          setResumeListRefreshKey((k) => k + 1);
          setUploadSuccess(true);
          setTimeout(() => setUploadSuccess(false), 4000);
          await refetchProfile({ silent: true });
        }
      } catch {
        setUploadError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [refetchProfile],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleResumeUpload(file);
  }

  function addSkill() {
    const trimmed = newSkill.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
      setNewSkill("");
      setDirty(true);
    }
  }

  function removeSkill(skill: string) {
    setSkills(skills.filter((s) => s !== skill));
    setDirty(true);
  }

  async function sendWhatsappVerificationOtp() {
    const phone = referrerWhatsapp.trim();
    if (!phone) return;
    setOtpError(null);
    setOtpMessage(null);
    setSendingOtp(true);
    try {
      const res = await fetch("/api/refer/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        debug_code?: string;
        debug_delivery_failed?: boolean;
        debug_error?: string;
      };
      if (!res.ok) {
        setOtpError(json.error ?? "Could not send verification code.");
        return;
      }
      setOtpRequested(true);
      if (json.debug_code) {
        setOtpCode(json.debug_code);
        setOtpMessage(
          json.debug_delivery_failed
            ? `WhatsApp delivery failed (${json.debug_error ?? "check config"}). Code auto-filled.`
            : "Sandbox mode — code auto-filled.",
        );
      } else {
        setOtpCode("");
        setOtpMessage("Code sent to your WhatsApp");
      }
    } catch {
      setOtpError("Could not send verification code.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyWhatsappOtp() {
    const phone = referrerWhatsapp.trim();
    const code = otpCode.trim();
    if (!phone || code.length < 6) return;
    setOtpError(null);
    setOtpMessage(null);
    setVerifyingOtp(true);
    try {
      const res = await fetch("/api/refer/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ whatsapp_number: phone, otp_code: code }),
      });
      const json = (await res.json().catch(() => ({}))) as { verified?: boolean };
      if (!res.ok || !json.verified) {
        setOtpError("Invalid code. Try again.");
        return;
      }
      await refetchProfile({ silent: true });
      setOtpRequested(false);
      setOtpCode("");
      setOtpMessage("WhatsApp verified.");
      setReferrerWhatsappVerified(true);
    } catch {
      setOtpError("Invalid code. Try again.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function requestErasure() {
    setErasureError(null);
    setErasureLoading(true);
    try {
      const res = await fetch("/api/candidates/erasure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setErasureError(json.error ?? json.message ?? "Request failed");
      } else {
        setErasureSuccess(true);
        setErasureModalOpen(false);
        setTimeout(() => setErasureSuccess(false), 5000);
      }
    } catch {
      setErasureError("Request failed. Please try again.");
    } finally {
      setErasureLoading(false);
    }
  }

  async function exportMyData() {
    setDataExportError(null);
    setDataExportSuccess(false);
    setDataExportLoading(true);
    try {
      const res = await fetch("/api/candidates/data-export", {
        method: "GET",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
      };
      if (!res.ok) {
        setDataExportError(payload.error ?? "Data export failed. Please try again.");
        return;
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `tigerhire-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setDataExportSuccess(true);
      setTimeout(() => setDataExportSuccess(false), 5000);
    } catch {
      setDataExportError("Data export failed. Please try again.");
    } finally {
      setDataExportLoading(false);
    }
  }

  async function handleSave() {
    setSaved(false);
    const response = await saveProfile({
      name,
      roleTitle,
      currentCompany,
      location: locationCity,
      experienceYears: yearsExperience,
      seniorityLevel,
      visibility: visible,
      skills,
      linkedinUrl,
      portfolioUrl,
      githubUrl,
      ...(referrerRecord || referrerLocalWhatsapp.trim()
        ? {
            referrerType,
            referrerWhatsapp,
            referrerCity,
            referrerWorkEmail,
            referrerLinkedinUrl,
            referrerUpiId,
          }
        : {}),
    });
    if (response) {
      setSaved(true);
      setDirty(false);
      setSavedCandidateId((response.candidate as { id?: string } | null)?.id ?? null);
      invalidateQueries("/api/profiles");
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const inputClass =
    "w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-body text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15";

  const selectClass =
    "w-full appearance-none rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-body text-sm text-white focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15";

  if (loading && !hydrated) {
    return (
      <>
        <PageHeader title="Your Profile" subtitle="Loading..." />
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="card-lifted p-6">
            <Skeleton className="h-5 w-32" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="card-lifted p-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-4 h-28 w-full" />
          </div>
        </div>
      </>
    );
  }

  if (profileLoadError && !hydrated)
    return (
      <div role="alert" className="py-8 text-sm text-rose-300">
        {profileLoadError}
        <button type="button" className="ml-3 underline" onClick={() => void refetchProfile()}>
          Retry
        </button>
      </div>
    );

  return (
    <>
      <PageHeader title="Your Profile" />
      <div className="mx-auto max-w-4xl">
        {profileLoadError && (
          <div role="alert" className="mb-4 text-sm text-rose-300">
            Could not refresh your profile. Your unsaved edits are still here.
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => void refetchProfile({ silent: true })}
            >
              Retry
            </button>
          </div>
        )}
        <div
          role="tablist"
          aria-label="Profile sections"
          className="mb-6 flex flex-wrap gap-1 border-b border-white/15 pb-2"
        >
          {[
            { id: "personal", label: "Personal", Icon: UserRound },
            { id: "career", label: "Career", Icon: BriefcaseBusiness },
            { id: "preferences", label: "Preferences", Icon: SlidersHorizontal },
            { id: "documents", label: "Documents", Icon: FileText },
            { id: "account", label: "Account", Icon: ShieldCheck },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              id={`profile-tab-${id}`}
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`profile-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              onKeyDown={(event) => {
                const tabs = Array.from(
                  event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  ),
                );
                const index = tabs.indexOf(event.currentTarget);
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : -1;
                if (next >= 0) {
                  event.preventDefault();
                  tabs[next].focus();
                  tabs[next].click();
                }
              }}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition ${activeTab === id ? "bg-white/10 font-semibold text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white"}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div
          id="profile-panel-career"
          role="tabpanel"
          aria-labelledby="profile-tab-career"
          hidden={activeTab !== "career"}
        >
          <CareerDetailsSection
            candidateId={savedCandidateId ?? (candidateRecord?.id as string) ?? null}
          />
        </div>
        <div
          id="profile-panel-preferences"
          role="tabpanel"
          aria-labelledby="profile-tab-preferences"
          hidden={activeTab !== "preferences"}
        >
          <CandidatePreferencesForm embedded />
        </div>
        <fieldset
          disabled={saving}
          onChangeCapture={() => {
            if (activeTab !== "personal" && activeTab !== "account") return;
            setDirty(true);
            setSaved(false);
          }}
          className="min-w-0 space-y-6"
        >
          <section
            id="profile-panel-personal"
            role="tabpanel"
            aria-labelledby="profile-tab-personal"
            hidden={activeTab !== "personal"}
            className="border-b border-white/10 pb-6"
          >
            <h3 className="heading-section mb-4 text-base text-white">Basic Info</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="prof-name"
                  className="mb-1.5 block text-sm font-normal text-white/65"
                >
                  Full Name
                </label>
                <input
                  id="prof-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="prof-role"
                  className="mb-1.5 block text-sm font-normal text-white/65"
                >
                  Current Role
                </label>
                <input
                  id="prof-role"
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="prof-company"
                  className="mb-1.5 block text-sm font-normal text-white/65"
                >
                  Current Company
                </label>
                <input
                  id="prof-company"
                  type="text"
                  value={currentCompany}
                  onChange={(e) => setCurrentCompany(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="prof-city"
                  className="mb-1.5 block text-sm font-normal text-white/65"
                >
                  Location
                </label>
                <input
                  id="prof-city"
                  type="text"
                  value={locationCity}
                  onChange={(e) => setLocationCity(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section hidden={activeTab !== "personal"} className="border-b border-white/10 pb-6">
            <h3 className="heading-section mb-4 text-base text-white">Links</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="prof-linkedin"
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-normal text-white/65"
                >
                  <Link2 size={14} /> LinkedIn URL
                </label>
                <input
                  id="prof-linkedin"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/your-profile"
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="prof-portfolio"
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-normal text-white/65"
                >
                  <Globe size={14} /> Portfolio / Website
                </label>
                <input
                  id="prof-portfolio"
                  type="url"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                  placeholder="https://your-website.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="prof-github"
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-normal text-white/65"
                >
                  <Code2 size={14} /> GitHub
                </label>
                <input
                  id="prof-github"
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/your-username"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <div hidden={activeTab !== "account"}>
            <ReferrerDetailsSection
              referrerWhatsappVerified={referrerWhatsappVerified}
              referrerType={referrerType}
              setReferrerType={setReferrerType}
              referrerCountryCode={referrerCountryCode}
              setReferrerCountryCode={(value) =>
                setReferrerCountryCode(value as (typeof COUNTRY_CODES)[number]["code"])
              }
              referrerLocalWhatsapp={referrerLocalWhatsapp}
              setReferrerLocalWhatsapp={setReferrerLocalWhatsapp}
              otpRequested={otpRequested}
              setOtpRequested={setOtpRequested}
              otpCode={otpCode}
              setOtpCode={setOtpCode}
              otpMessage={otpMessage}
              setOtpMessage={setOtpMessage}
              otpError={otpError}
              setOtpError={setOtpError}
              sendingOtp={sendingOtp}
              verifyingOtp={verifyingOtp}
              sendWhatsappVerificationOtp={sendWhatsappVerificationOtp}
              verifyWhatsappOtp={verifyWhatsappOtp}
              referrerCity={referrerCity}
              setReferrerCity={setReferrerCity}
              referrerWorkEmail={referrerWorkEmail}
              setReferrerWorkEmail={setReferrerWorkEmail}
              referrerLinkedinUrl={referrerLinkedinUrl}
              setReferrerLinkedinUrl={setReferrerLinkedinUrl}
              referrerUpiId={referrerUpiId}
              setReferrerUpiId={setReferrerUpiId}
              inputClass={inputClass}
              selectClass={selectClass}
              countryCodes={COUNTRY_CODES}
            />
          </div>

          <section hidden={activeTab !== "personal"} className="border-b border-white/10 pb-6">
            <h3 className="heading-section mb-4 text-base text-white">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-body text-sm text-emerald-400"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    aria-label={`Remove ${skill}`}
                    className="ml-0.5 opacity-60 transition hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                aria-label="New skill"
                maxLength={100}
                placeholder="Add a skill..."
                className={inputClass}
              />
              <button
                type="button"
                onClick={addSkill}
                className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-4 py-2.5 text-body text-sm font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </section>

          <section hidden={activeTab !== "personal"} className="border-b border-white/10 pb-6">
            <h3 className="heading-section mb-4 text-base text-white">Experience</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="prof-yoe"
                  className="mb-1.5 block text-sm font-normal text-white/65"
                >
                  Years of Experience
                </label>
                <input
                  id="prof-yoe"
                  type="number"
                  min={0}
                  max={50}
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="prof-seniority"
                  className="mb-1.5 block text-sm font-normal text-white/65"
                >
                  Seniority Level
                </label>
                <select
                  id="prof-seniority"
                  value={seniorityLevel}
                  onChange={(e) => setSeniorityLevel(e.target.value)}
                  className={selectClass}
                >
                  {[
                    "Intern",
                    "Junior",
                    "Mid",
                    "Senior",
                    "Lead",
                    "Manager",
                    "Director",
                    "VP",
                    "C-Suite",
                  ].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section
            id="profile-panel-account"
            role="tabpanel"
            aria-labelledby="profile-tab-account"
            hidden={activeTab !== "account"}
            className="border-b border-white/10 pb-6"
          >
            <h3 className="heading-section mb-4 text-base text-white">Visibility</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body text-sm text-white">
                  Make my profile visible to recruiters
                </p>
                <p className="text-body mt-0.5 text-xs text-white/65">
                  When enabled, companies on TigerHire can discover your profile
                </p>
              </div>
              <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-within:ring-2 focus-within:ring-white/20 focus-within:ring-offset-2 focus-within:ring-offset-[var(--bg)]">
                {visible ? (
                  <input
                    type="checkbox"
                    checked
                    onChange={() => setVisible(!visible)}
                    aria-label="Toggle profile visibility"
                    aria-checked="true"
                    className="sr-only"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => setVisible(!visible)}
                    aria-label="Toggle profile visibility"
                    aria-checked="false"
                    className="sr-only"
                  />
                )}
                <span
                  className={`pointer-events-none absolute inset-0 rounded-full transition-colors ${visible ? "bg-[var(--accent)]" : "bg-white/15"}`}
                />
                <span
                  className={`pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${visible ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                />
              </label>
            </div>
          </section>

          <div
            id="profile-panel-documents"
            role="tabpanel"
            aria-labelledby="profile-tab-documents"
            hidden={activeTab !== "documents"}
          >
            <ResumeVersionsSection
              candidateId={(candidateRecord?.id as string) ?? null}
              refreshKey={resumeListRefreshKey}
            />
          </div>

          <section hidden={activeTab !== "documents"} className="border-b border-white/10 pb-6">
            <h3 className="heading-section mb-4 text-base text-white">Resume (primary)</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              aria-label="Upload resume (PDF, DOCX, DOC, or TXT)"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleResumeUpload(f);
                e.target.value = "";
              }}
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-10 transition ${dragActive ? "border-white/20 bg-white/[0.06]" : "border-white/10 bg-white/[0.04] hover:border-white/20"}`}
            >
              {uploading ? (
                <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
              ) : uploadSuccess ? (
                <Check size={28} className="text-emerald-400" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]">
                  <Upload size={24} />
                </div>
              )}
              <p className="text-body mt-3 text-sm text-white">
                {uploading
                  ? "Uploading..."
                  : uploadSuccess
                    ? "Resume uploaded!"
                    : "Drag your resume here or click to upload"}
              </p>
              <p className="text-body mt-1 text-xs text-white/65">
                PDF, DOCX, DOC, or TXT — max 10MB
              </p>
              {uploadError && (
                <p className="mt-2 flex items-center gap-1 text-sm text-rose-300">
                  <AlertCircle size={14} />
                  {uploadError}
                </p>
              )}
              {resumeUrl && !uploading && (
                <a
                  href={resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-xs text-[var(--accent)] underline"
                >
                  View current resume
                </a>
              )}
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-body text-sm font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText size={16} />
                Browse files
              </button>
            </div>
          </section>

          <section hidden={activeTab !== "account"} className="border-b border-white/10 pb-6">
            <h3 className="heading-section mb-4 text-base text-white">Data & Privacy</h3>
            <p className="text-body mb-4 text-sm text-white/65">
              Request deletion of all your personal data. This action is irreversible and may take
              up to 30 days to process.
            </p>
            <div className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-sm font-medium text-[var(--text)]">Download my data (JSON)</p>
              <p className="mt-1 text-xs text-white/60">
                Export your profile, applications, resume metadata, consent records, and related
                account history.
              </p>
              {dataExportSuccess ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
                  <Check size={16} />
                  Export downloaded successfully.
                </p>
              ) : null}
              {dataExportError ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-red-400">
                  <AlertTriangle size={16} />
                  {dataExportError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={exportMyData}
                disabled={dataExportLoading}
                className="mt-3 flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dataExportLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {dataExportLoading ? "Preparing export..." : "Export my data"}
              </button>
            </div>
            {erasureSuccess && (
              <p className="mb-4 flex items-center gap-2 text-sm text-emerald-400">
                <Check size={16} />
                Your data erasure request has been submitted. You will receive a confirmation email.
              </p>
            )}
            {erasureError && (
              <p className="mb-4 flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle size={16} />
                {erasureError}
              </p>
            )}
            <button
              type="button"
              onClick={() => setErasureModalOpen(true)}
              disabled={erasureLoading || erasureSuccess}
              className="flex items-center gap-2 rounded-md bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={16} />
              Delete My Data
            </button>
          </section>

          {erasureModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
              <div className="card-lifted relative w-full max-w-md p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                    <AlertTriangle size={20} className="text-red-400" />
                  </div>
                  <h4 className="heading-section text-base text-white">Are you sure?</h4>
                </div>
                <p className="text-body mb-6 text-sm text-white/65">
                  This will permanently delete all your data including resumes, scores, and
                  application history.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setErasureModalOpen(false);
                      setErasureError(null);
                    }}
                    disabled={erasureLoading}
                    className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={requestErasure}
                    disabled={erasureLoading}
                    className="flex items-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {erasureLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                    Confirm Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </fieldset>
        {(activeTab === "personal" || activeTab === "account") && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-white/15 bg-[var(--bg)] py-4">
            {dirty && !saveError && (
              <p className="mr-auto text-sm text-amber-300">Unsaved changes</p>
            )}
            {saveError && (
              <p role="alert" className="text-sm text-rose-300">
                {saveError}
              </p>
            )}
            {saved && (
              <p role="status" className="text-sm text-emerald-400">
                Profile saved!
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty || Boolean(profileLoadError)}
              className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
