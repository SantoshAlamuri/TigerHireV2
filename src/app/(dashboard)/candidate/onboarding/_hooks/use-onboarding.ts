"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { invalidateQueries } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  candidateProfileCompleteness,
  CANDIDATE_ONBOARDING_DISMISS_KEY,
} from "@/lib/candidate/profile-completeness";
import { STEP_ORDER } from "../_lib/constants";
import { patchJson } from "../_lib/helpers";
import { useOnboardingCore } from "./use-onboarding-core";

export function useOnboarding() {
  const router = useRouter();
  const { user } = useAuth();
  const c = useOnboardingCore();

  const hasPreferences =
    c.prefRoles.length > 0 ||
    c.prefSeniority.length > 0 ||
    c.salaryMinLpa > 0 ||
    c.prefRemote !== "any";

  const completeness = useMemo(
    () =>
      candidateProfileCompleteness({
        fullName: c.name,
        roleTitle: c.roleTitle,
        location: c.location,
        skills: c.skills,
        experienceYears: c.experienceYears,
        resumeUrl: c.resumeUrl,
        linkedinUrl: c.linkedinUrl,
        hasPreferences,
      }),
    [
      c.name,
      c.roleTitle,
      c.location,
      c.skills,
      c.experienceYears,
      c.resumeUrl,
      c.linkedinUrl,
      hasPreferences,
    ],
  );

  const stepIndex = STEP_ORDER.indexOf(c.step);
  const goNext = () => c.setStep(STEP_ORDER[Math.min(STEP_ORDER.length - 1, stepIndex + 1)]);
  const goBack = () => c.setStep(STEP_ORDER[Math.max(0, stepIndex - 1)]);

  async function saveBasics() {
    c.setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        remotePreference: c.remotePreference,
        experienceYears: c.experienceYears,
        seniorityLevel: c.seniorityLevel,
      };
      if (c.name.trim()) payload.name = c.name.trim();
      if (c.name.trim()) payload.fullName = c.name.trim();
      if (c.roleTitle.trim()) payload.roleTitle = c.roleTitle.trim();
      if (c.currentCompany.trim()) payload.currentCompany = c.currentCompany.trim();
      if (c.location.trim()) payload.location = c.location.trim();
      if (c.linkedinUrl.trim()) payload.linkedinUrl = c.linkedinUrl.trim();
      const ok = await patchJson("/api/profiles", payload);
      if (!ok) {
        c.toast({ title: "Couldn't save", tone: "danger" });
      } else {
        invalidateQueries("/api/profiles");
        goNext();
      }
    } finally {
      c.setSaving(false);
    }
  }

  async function saveSkills() {
    c.setSaving(true);
    try {
      const ok = await patchJson("/api/profiles", { skills: c.skills });
      if (!ok) {
        c.toast({ title: "Couldn't save skills", tone: "danger" });
      } else {
        invalidateQueries("/api/profiles");
        goNext();
      }
    } finally {
      c.setSaving(false);
    }
  }

  async function savePreferences() {
    c.setSaving(true);
    try {
      const ok = await patchJson("/api/candidates/me/preferences", {
        remote_preference: c.prefRemote,
        preferred_role_functions: c.prefRoles,
        preferred_seniority: c.prefSeniority,
        salary_min_lpa: c.salaryMinLpa,
        salary_max_lpa: c.salaryMaxLpa,
      });
      if (!ok) {
        c.toast({ title: "Couldn't save preferences", tone: "danger" });
      } else {
        invalidateQueries("/api/candidates/me/preferences");
        await c.refetchPrefs();
        goNext();
      }
    } finally {
      c.setSaving(false);
    }
  }

  const whatsapp = `${c.countryCode}${c.localPhone}`.trim();

  async function sendOtp() {
    if (!c.localPhone.trim()) return;
    c.setOtpError(null);
    c.setOtpMessage(null);
    c.setSendingOtp(true);
    try {
      // Ensure the referrer record exists with this number before verifying.
      await patchJson("/api/profiles", { referrerType: "individual", referrerWhatsapp: whatsapp });
      const res = await fetch("/api/refer/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: whatsapp }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        debug_code?: string;
        debug_delivery_failed?: boolean;
        debug_error?: string;
      };
      if (!res.ok) {
        c.setOtpError(json.error ?? "Could not send code.");
        return;
      }
      c.setOtpRequested(true);
      if (json.debug_code) {
        c.setOtpCode(json.debug_code);
        c.setOtpMessage(
          json.debug_delivery_failed
            ? `WhatsApp delivery failed (${json.debug_error ?? "check config"}). Code auto-filled.`
            : "Sandbox mode — code auto-filled.",
        );
      } else {
        c.setOtpMessage("Code sent to your WhatsApp.");
      }
    } catch {
      c.setOtpError("Could not send code.");
    } finally {
      c.setSendingOtp(false);
    }
  }

  async function verifyOtp() {
    if (c.otpCode.trim().length < 6) return;
    c.setOtpError(null);
    c.setVerifyingOtp(true);
    try {
      const res = await fetch("/api/refer/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ whatsapp_number: whatsapp, otp_code: c.otpCode.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { verified?: boolean };
      if (!res.ok || !json.verified) {
        c.setOtpError("Invalid code. Try again.");
        return;
      }
      c.setPhoneVerified(true);
      c.setOtpRequested(false);
      c.setOtpMessage("WhatsApp verified.");
      await c.refetchProfile();
    } catch {
      c.setOtpError("Invalid code. Try again.");
    } finally {
      c.setVerifyingOtp(false);
    }
  }

  const firstName = (user?.name ?? "").split(" ")[0] || "there";

  function dismissOnboarding() {
    try {
      window.localStorage.setItem(CANDIDATE_ONBOARDING_DISMISS_KEY, "1");
    } catch {
      /* private mode / storage disabled */
    }
  }

  return {
    ...c,
    router,
    completeness,
    hasPreferences,
    stepIndex,
    goNext,
    goBack,
    saveBasics,
    saveSkills,
    savePreferences,
    sendOtp,
    verifyOtp,
    firstName,
    dismissOnboarding,
  };
}

export type OnboardingApi = ReturnType<typeof useOnboarding>;
