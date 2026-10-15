"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  COUNTRY_CODES,
  clearPendingParentReferrerId,
  readPendingParentReferrerId,
  setupNameFallback,
} from "../_lib/helpers";
import type { LoadDashboardResult, OtpSendResponse, ReferProfilePayload } from "../_lib/types";

type UseReferrerSetupFlowArgs = {
  loadDashboard: () => Promise<LoadDashboardResult>;
  setData: (data: ReferProfilePayload) => void;
  setSetupMode: (value: boolean) => void;
};

export function useReferrerSetupFlow({
  loadDashboard,
  setData,
  setSetupMode,
}: UseReferrerSetupFlowArgs) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [setupCountryCode, setSetupCountryCode] =
    useState<(typeof COUNTRY_CODES)[number]["code"]>("+91");
  const [setupLocalWhatsapp, setSetupLocalWhatsapp] = useState("");
  const [setupOtp, setSetupOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [debugOtpCode, setDebugOtpCode] = useState<string | null>(null);
  const [debugOtpMessage, setDebugOtpMessage] = useState<string | null>(null);
  const setupWhatsapp = `${setupCountryCode}${setupLocalWhatsapp}`;

  async function startSetupOtp() {
    if (!setupWhatsapp.trim()) {
      setSetupError("Please enter your WhatsApp number.");
      return;
    }
    setSetupError(null);
    setSetupSubmitting(true);
    try {
      // Pull invite-chain attribution from `?parent=` (direct hit) or the
      // sessionStorage bridge written by /register when the user arrived via
      // a `/refer/join?parent=<id>` (now a deprecated redirect) invite link.
      const parentReferrerId = readPendingParentReferrerId(
        new URLSearchParams(searchParams.toString()),
      );
      const joinRes = await fetch("/api/refer/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: setupNameFallback(user?.name, user?.email),
          whatsapp_number: setupWhatsapp.trim(),
          type: "individual",
          city: null,
          work_email: null,
          linkedin_url: null,
          upi_id: null,
          ...(parentReferrerId ? { parent_referrer_id: parentReferrerId } : {}),
        }),
      });
      const joinJson = (await joinRes.json().catch(() => ({}))) as {
        error?: string;
        otp_required?: boolean;
      };
      if (!joinRes.ok) {
        setSetupError(joinJson.error ?? "Could not start setup.");
        return;
      }

      if (joinJson.otp_required === false) {
        // No OTP needed (e.g., already-verified WA via a sibling flow): the
        // referrers row is created/updated above, so the parent linkage is
        // recorded — safe to clear the bridge.
        clearPendingParentReferrerId();
        const refreshed = await loadDashboard();
        if (refreshed && !refreshed.needsSetup) {
          setData(refreshed.data);
          setSetupMode(false);
          setSetupOtp("");
          setOtpRequested(false);
        }
        return;
      }

      const sendRes = await fetch("/api/refer/otp/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_number: setupWhatsapp.trim() }),
      });
      const sendJson = (await sendRes.json().catch(() => ({}))) as OtpSendResponse;
      if (!sendRes.ok) {
        setDebugOtpCode(null);
        setDebugOtpMessage(null);
        setSetupError(sendJson.error ?? "Could not send OTP.");
        return;
      }
      if (sendJson.debug_code) {
        setDebugOtpCode(sendJson.debug_code);
        setSetupOtp(sendJson.debug_code);
        setDebugOtpMessage(
          sendJson.debug_delivery_failed
            ? `WhatsApp delivery failed (${sendJson.debug_error ?? "check config"}). Use the auto-filled code to continue.`
            : "WhatsApp is in sandbox mode. Use the auto-filled code to continue.",
        );
      } else {
        setDebugOtpCode(null);
        setDebugOtpMessage(null);
      }
      setOtpRequested(true);
    } finally {
      setSetupSubmitting(false);
    }
  }

  async function verifySetupOtp() {
    if (!otpRequested || !setupWhatsapp.trim()) return;
    setSetupError(null);
    setSetupSubmitting(true);
    try {
      const res = await fetch("/api/refer/otp/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_number: setupWhatsapp.trim(),
          otp_code: setupOtp.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; verified?: boolean };
      if (!res.ok || !json.verified) {
        setSetupError(json.error ?? "Invalid or expired OTP.");
        return;
      }
      // Setup completed: parent linkage was recorded by the earlier
      // /api/refer/join call in startSetupOtp, so the bridge is no longer
      // needed and shouldn't be reapplied to a future activation.
      clearPendingParentReferrerId();
      const refreshed = await loadDashboard();
      if (refreshed && !refreshed.needsSetup) {
        setData(refreshed.data);
        setSetupMode(false);
        setSetupOtp("");
        setOtpRequested(false);
      }
    } finally {
      setSetupSubmitting(false);
    }
  }

  return {
    setupCountryCode,
    setSetupCountryCode,
    setupLocalWhatsapp,
    setSetupLocalWhatsapp,
    setupOtp,
    setSetupOtp,
    otpRequested,
    setOtpRequested,
    setupSubmitting,
    setupError,
    setSetupError,
    debugOtpCode,
    debugOtpMessage,
    startSetupOtp,
    verifySetupOtp,
  };
}
