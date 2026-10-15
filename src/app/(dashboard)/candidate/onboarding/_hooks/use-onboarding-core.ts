"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiQuery, invalidateQueries } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/Toast";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { inferRoleFunction, normalizeSeniority } from "@/lib/candidate/resume-inference";
import { splitWhatsapp } from "../_lib/helpers";
import { parseResumeRequest, uploadResumeRequest } from "../_lib/api";
import type { StepKey } from "../_lib/constants";
import type { PreferencesShape, ProfileShape, ReferrerShape } from "../_lib/types";

export function useOnboardingCore() {
  const { toast } = useToast();

  const { data: profileData, refetch: refetchProfile } = useApiQuery<{
    profile: ProfileShape;
    candidate: ProfileShape | null;
    referrer?: ReferrerShape | null;
  }>("/api/profiles");
  const { data: prefsData, refetch: refetchPrefs } = useApiQuery<{ preferences: PreferencesShape }>(
    "/api/candidates/me/preferences",
  );

  const profile = profileData?.profile;
  const referrer = profileData?.referrer ?? null;

  const [step, setStep] = useState<StepKey>("resume");

  // Basics
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [location, setLocation] = useState("");
  const [remotePreference, setRemotePreference] = useState("hybrid");
  const [experienceYears, setExperienceYears] = useState(0);
  const [seniorityLevel, setSeniorityLevel] = useState("Mid");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // Skills
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");

  // Preferences
  const [prefRemote, setPrefRemote] = useState("any");
  const [prefRoles, setPrefRoles] = useState<string[]>([]);
  const [prefSeniority, setPrefSeniority] = useState<string[]>([]);
  const [salaryMinLpa, setSalaryMinLpa] = useState(0);
  const [salaryMaxLpa, setSalaryMaxLpa] = useState(0);

  // Verify / referrer
  const [countryCode, setCountryCode] = useState("+91");
  const [localPhone, setLocalPhone] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Resume
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<"idle" | "parsing" | "done" | "empty" | "failed">(
    "idle",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const [saving, setSaving] = useState(false);

  // Hydrate local state from saved data exactly once. After that, the parse
  // pre-fill and the user's own edits own the form — a refetch (after parse or a
  // save) must not reset fields back to stale/empty values.
  const profileHydratedRef = useRef(false);
  const referrerHydratedRef = useRef(false);
  const prefsHydratedRef = useRef(false);

  useEffect(() => {
    if (profile && !profileHydratedRef.current) {
      profileHydratedRef.current = true;
      setName((profile.full_name as string) ?? "");
      setRoleTitle(((profile.role_title as string) || (profile.current_role as string)) ?? "");
      setCurrentCompany((profile.current_company as string) ?? "");
      setLocation((profile.location as string) ?? "");
      setRemotePreference((profile.remote_preference as string) ?? "hybrid");
      setExperienceYears((profile.experience_years as number) ?? 0);
      setSeniorityLevel(normalizeSeniority(profile.seniority_level as string) ?? "Mid");
      setLinkedinUrl((profile.linkedin_url as string) ?? "");
      setSkills(((profile.skills as string[]) ?? []).slice());
      setResumeUrl((profile.resume_url as string) ?? null);
    }
    if (referrer && !referrerHydratedRef.current) {
      referrerHydratedRef.current = true;
      const { code, local } = splitWhatsapp((referrer.whatsapp_number as string) ?? "");
      setCountryCode(code);
      setLocalPhone(local);
      setPhoneVerified(Boolean(referrer.whatsapp_verified));
    }
  }, [profile, referrer]);

  useEffect(() => {
    const p = prefsData?.preferences;
    if (p && !prefsHydratedRef.current) {
      prefsHydratedRef.current = true;
      setPrefRemote(p.remote_preference ?? "any");
      setPrefRoles(p.preferred_role_functions ?? []);
      setPrefSeniority(p.preferred_seniority ?? []);
      setSalaryMinLpa(p.salary_min_lpa ?? 0);
      setSalaryMaxLpa(p.salary_max_lpa ?? 0);
    }
  }, [prefsData]);

  const runParse = useCallback(async () => {
    setParseStatus("parsing");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60000);
    try {
      const { ok, parsed } = await parseResumeRequest(controller.signal);
      if (ok && parsed) {
        const p = parsed;
        if (p.fullName) setName((v) => v || p.fullName!);
        if (p.currentRole) setRoleTitle((v) => v || p.currentRole!);
        if (p.currentCompany) setCurrentCompany((v) => v || p.currentCompany!);
        if (p.location) setLocation((v) => v || p.location!);
        if (p.experienceYears != null) setExperienceYears((v) => v || p.experienceYears!);
        const sn = normalizeSeniority(p.seniorityLevel);
        if (sn) setSeniorityLevel((v) => (v && v !== "Mid" ? v : sn));
        if (p.skills && p.skills.length > 0) setSkills((v) => (v.length > 0 ? v : p.skills!));
        // Suggest a preferred role function from the title (editable on the Preferences step).
        const fn = inferRoleFunction(p.currentRole);
        if (fn) setPrefRoles((v) => (v.length > 0 ? v : [fn]));
        // "Filled in" only if we pulled role/company/location/experience/skills (not just name).
        const meaningful =
          [p.currentRole, p.currentCompany, p.location, p.seniorityLevel].filter(Boolean).length +
          (p.experienceYears != null && p.experienceYears > 0 ? 1 : 0) +
          ((p.skills?.length ?? 0) > 0 ? 1 : 0);
        setParseStatus(meaningful > 0 ? "done" : "empty");
      } else {
        setParseStatus("failed");
      }
    } catch {
      setParseStatus("failed");
    } finally {
      window.clearTimeout(timeoutId);
      invalidateQueries("/api/profiles");
      void refetchProfile();
    }
  }, [refetchProfile]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (file.size > MAX_STANDARD_UPLOAD_BYTES) {
        setUploadError(`File must be under ${MAX_STANDARD_UPLOAD_BYTES / 1024 / 1024}MB.`);
        return;
      }
      setUploading(true);
      try {
        const json = await uploadResumeRequest(file);
        if (!json.ok) {
          const detail = typeof json.detail === "string" ? ` — ${json.detail}` : "";
          setUploadError(`${json.error ?? "Upload failed. Please try again."}${detail}`);
          return;
        }
        // Upload is now saved (file + resume_versions + candidate.resume_url).
        setResumeUrl(json.viewUrl ?? json.resumeUrl ?? json.resume_url ?? "uploaded");
        setParseStatus("idle");
        toast({ title: "Résumé saved", tone: "success" });
        // Kick off auto-fill once; it can be re-run from the button without re-uploading.
        void runParse();
      } catch {
        setUploadError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [toast, runParse],
  );

  return {
    toast,
    refetchProfile,
    refetchPrefs,
    step,
    setStep,
    name,
    setName,
    roleTitle,
    setRoleTitle,
    currentCompany,
    setCurrentCompany,
    location,
    setLocation,
    remotePreference,
    setRemotePreference,
    experienceYears,
    setExperienceYears,
    seniorityLevel,
    setSeniorityLevel,
    linkedinUrl,
    setLinkedinUrl,
    skills,
    setSkills,
    newSkill,
    setNewSkill,
    prefRemote,
    setPrefRemote,
    prefRoles,
    setPrefRoles,
    prefSeniority,
    setPrefSeniority,
    salaryMinLpa,
    setSalaryMinLpa,
    salaryMaxLpa,
    setSalaryMaxLpa,
    countryCode,
    setCountryCode,
    localPhone,
    setLocalPhone,
    otpRequested,
    setOtpRequested,
    otpCode,
    setOtpCode,
    otpMessage,
    setOtpMessage,
    otpError,
    setOtpError,
    phoneVerified,
    setPhoneVerified,
    sendingOtp,
    setSendingOtp,
    verifyingOtp,
    setVerifyingOtp,
    resumeUrl,
    uploading,
    uploadError,
    parseStatus,
    fileInputRef,
    dragActive,
    setDragActive,
    saving,
    setSaving,
    runParse,
    handleUpload,
  };
}
