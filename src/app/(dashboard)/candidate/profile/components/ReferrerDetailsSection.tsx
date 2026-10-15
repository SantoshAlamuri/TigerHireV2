"use client";

import type { Dispatch, SetStateAction } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function ReferrerDetailsSection(props: {
  referrerWhatsappVerified: boolean;
  referrerType: "individual" | "agency";
  setReferrerType: Dispatch<SetStateAction<"individual" | "agency">>;
  referrerCountryCode: string;
  setReferrerCountryCode: (value: string) => void;
  referrerLocalWhatsapp: string;
  setReferrerLocalWhatsapp: Dispatch<SetStateAction<string>>;
  otpRequested: boolean;
  setOtpRequested: Dispatch<SetStateAction<boolean>>;
  otpCode: string;
  setOtpCode: Dispatch<SetStateAction<string>>;
  otpMessage: string | null;
  setOtpMessage: Dispatch<SetStateAction<string | null>>;
  otpError: string | null;
  setOtpError: Dispatch<SetStateAction<string | null>>;
  sendingOtp: boolean;
  verifyingOtp: boolean;
  sendWhatsappVerificationOtp: () => Promise<void>;
  verifyWhatsappOtp: () => Promise<void>;
  referrerCity: string;
  setReferrerCity: Dispatch<SetStateAction<string>>;
  referrerWorkEmail: string;
  setReferrerWorkEmail: Dispatch<SetStateAction<string>>;
  referrerLinkedinUrl: string;
  setReferrerLinkedinUrl: Dispatch<SetStateAction<string>>;
  referrerUpiId: string;
  setReferrerUpiId: Dispatch<SetStateAction<string>>;
  inputClass: string;
  selectClass: string;
  countryCodes: ReadonlyArray<{ code: string; label: string }>;
}) {
  const {
    referrerWhatsappVerified,
    referrerType,
    setReferrerType,
    referrerCountryCode,
    setReferrerCountryCode,
    referrerLocalWhatsapp,
    setReferrerLocalWhatsapp,
    otpRequested,
    setOtpRequested,
    otpCode,
    setOtpCode,
    otpMessage,
    setOtpMessage,
    otpError,
    setOtpError,
    sendingOtp,
    verifyingOtp,
    sendWhatsappVerificationOtp,
    verifyWhatsappOtp,
    referrerCity,
    setReferrerCity,
    referrerWorkEmail,
    setReferrerWorkEmail,
    referrerLinkedinUrl,
    setReferrerLinkedinUrl,
    referrerUpiId,
    setReferrerUpiId,
    inputClass,
    selectClass,
    countryCodes,
  } = props;

  return (
    <section className="card-lifted p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="heading-section text-base text-white">Referrer Details (Refer & Earn)</h3>
        <StatusBadge tone={referrerWhatsappVerified ? "success" : "warning"} size="sm">
          {referrerWhatsappVerified ? "WhatsApp verified" : "WhatsApp verification pending"}
        </StatusBadge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="prof-ref-type" className="mb-1.5 block text-sm font-normal text-white/65">
            Referrer Type
          </label>
          <select
            id="prof-ref-type"
            value={referrerType}
            onChange={(e) => setReferrerType(e.target.value as "individual" | "agency")}
            className={selectClass}
          >
            <option value="individual">Individual</option>
            <option value="agency">Agency</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="prof-ref-whatsapp"
            className="mb-1.5 block text-sm font-normal text-white/65"
          >
            WhatsApp Number
          </label>
          <div className="flex gap-2">
            <select
              aria-label="WhatsApp country code"
              value={referrerCountryCode}
              onChange={(e) => {
                setReferrerCountryCode(e.target.value);
                setOtpRequested(false);
                setOtpCode("");
                setOtpError(null);
                setOtpMessage(null);
              }}
              className="w-40 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-body text-sm text-white focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
            >
              {countryCodes.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label} ({option.code})
                </option>
              ))}
            </select>
            <input
              id="prof-ref-whatsapp"
              type="tel"
              value={referrerLocalWhatsapp}
              onChange={(e) => {
                setReferrerLocalWhatsapp(e.target.value.replace(/\D/g, ""));
                setOtpRequested(false);
                setOtpCode("");
                setOtpError(null);
                setOtpMessage(null);
              }}
              className={inputClass}
              placeholder="9876543210"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            {referrerLocalWhatsapp.trim().length > 0 && !referrerWhatsappVerified ? (
              <button
                type="button"
                onClick={sendWhatsappVerificationOtp}
                disabled={sendingOtp}
                className="rounded-md border border-white/10 px-3 py-1 text-xs font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingOtp ? "Sending..." : "Verify"}
              </button>
            ) : null}
            {referrerWhatsappVerified ? (
              <StatusBadge tone="success" size="sm">
                Verified
              </StatusBadge>
            ) : null}
          </div>
          {otpMessage ? <p className="mt-1 text-xs text-emerald-300">{otpMessage}</p> : null}
          {otpError ? <p className="mt-1 text-xs text-rose-300">{otpError}</p> : null}
          {otpRequested ? (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                className={inputClass}
              />
              <button
                type="button"
                onClick={verifyWhatsappOtp}
                disabled={verifyingOtp || otpCode.trim().length < 6}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifyingOtp ? "Verifying..." : "Submit"}
              </button>
            </div>
          ) : null}
          <p className="mt-1 text-xs text-white/65">
            OTP is requested again only if this number changes.
          </p>
        </div>
        <div>
          <label htmlFor="prof-ref-city" className="mb-1.5 block text-sm font-normal text-white/65">
            Referrer City
          </label>
          <input
            id="prof-ref-city"
            type="text"
            value={referrerCity}
            onChange={(e) => setReferrerCity(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="prof-ref-work-email"
            className="mb-1.5 block text-sm font-normal text-white/65"
          >
            Company Email ID (optional)
          </label>
          <input
            id="prof-ref-work-email"
            type="email"
            value={referrerWorkEmail}
            onChange={(e) => setReferrerWorkEmail(e.target.value)}
            className={inputClass}
            placeholder="name@company.com"
          />
        </div>
        <div>
          <label
            htmlFor="prof-ref-linkedin"
            className="mb-1.5 block text-sm font-normal text-white/65"
          >
            Referrer LinkedIn
          </label>
          <input
            id="prof-ref-linkedin"
            type="text"
            value={referrerLinkedinUrl}
            onChange={(e) => setReferrerLinkedinUrl(e.target.value)}
            className={inputClass}
            placeholder="linkedin.com/in/yourname"
          />
        </div>
        <div>
          <label htmlFor="prof-ref-upi" className="mb-1.5 block text-sm font-normal text-white/65">
            UPI ID (for payouts)
          </label>
          <input
            id="prof-ref-upi"
            type="text"
            value={referrerUpiId}
            onChange={(e) => setReferrerUpiId(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </section>
  );
}
