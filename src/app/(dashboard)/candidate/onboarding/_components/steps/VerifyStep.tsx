"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { COUNTRY_CODES, inputClass } from "../../_lib/constants";
import { StepHeading } from "../primitives";
import type { OnboardingApi } from "../../_hooks/use-onboarding";

export function VerifyStep({ s }: { s: OnboardingApi }) {
  const {
    phoneVerified,
    countryCode,
    setCountryCode,
    localPhone,
    setLocalPhone,
    sendOtp,
    sendingOtp,
    otpRequested,
    otpCode,
    setOtpCode,
    verifyOtp,
    verifyingOtp,
    otpMessage,
    otpError,
  } = s;
  return (
    <div className="space-y-4">
      <StepHeading
        icon={<Check size={18} />}
        title="Verify your WhatsApp"
        hint="One verification — it powers job updates and lets you refer with one tap."
      />
      {phoneVerified ? (
        <StatusBadge tone="success" size="md">
          <Check size={13} aria-hidden /> WhatsApp verified
        </StatusBadge>
      ) : (
        <>
          <div className="flex gap-2">
            <select
              className={`${inputClass} max-w-[7rem]`}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="WhatsApp number"
              value={localPhone}
              onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, ""))}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void sendOtp()}
              disabled={sendingOtp || !localPhone.trim()}
            >
              {sendingOtp ? <Loader2 size={14} className="animate-spin" /> : "Send code"}
            </Button>
          </div>
          {otpRequested ? (
            <div className="flex gap-2">
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="6-digit code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <Button
                size="sm"
                onClick={() => void verifyOtp()}
                disabled={verifyingOtp || otpCode.trim().length < 6}
              >
                {verifyingOtp ? <Loader2 size={14} className="animate-spin" /> : "Verify"}
              </Button>
            </div>
          ) : null}
          {otpMessage ? <p className="text-xs text-[var(--text-subtle)]">{otpMessage}</p> : null}
          {otpError ? (
            <p className="text-sm text-[color:var(--status-danger-fg)]">{otpError}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
