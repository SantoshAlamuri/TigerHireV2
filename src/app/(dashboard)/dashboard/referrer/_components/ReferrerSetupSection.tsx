"use client";

import { COUNTRY_CODES } from "../_lib/helpers";

type ReferrerSetupSectionProps = {
  setupCountryCode: (typeof COUNTRY_CODES)[number]["code"];
  setSetupCountryCode: (code: (typeof COUNTRY_CODES)[number]["code"]) => void;
  setupLocalWhatsapp: string;
  setSetupLocalWhatsapp: (value: string) => void;
  setupOtp: string;
  setSetupOtp: (value: string) => void;
  otpRequested: boolean;
  setOtpRequested: (value: boolean) => void;
  setupSubmitting: boolean;
  setupError: string | null;
  setSetupError: (value: string | null) => void;
  debugOtpCode: string | null;
  debugOtpMessage: string | null;
  startSetupOtp: () => void;
  verifySetupOtp: () => void;
};

export function ReferrerSetupSection({
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
}: ReferrerSetupSectionProps) {
  return (
    <section className="card-lifted mx-auto max-w-xl border border-[var(--border)] p-6">
      <h2 className="heading-section text-lg text-[var(--text)]">Start referring</h2>
      <p className="mt-2 text-sm text-white/60">
        Enter your WhatsApp number to activate referrals. We&apos;ll verify with OTP once.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-white/60">WhatsApp number</label>
          <div className="flex gap-2">
            <select
              aria-label="WhatsApp country code"
              value={setupCountryCode}
              onChange={(e) => {
                setSetupCountryCode(e.target.value as (typeof COUNTRY_CODES)[number]["code"]);
                setOtpRequested(false);
                setSetupOtp("");
                setSetupError(null);
              }}
              className="w-40 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
            >
              {COUNTRY_CODES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label} ({option.code})
                </option>
              ))}
            </select>
            <input
              type="tel"
              value={setupLocalWhatsapp}
              onChange={(e) => {
                setSetupLocalWhatsapp(e.target.value.replace(/\D/g, ""));
                setOtpRequested(false);
                setSetupOtp("");
                setSetupError(null);
              }}
              placeholder="9876543210"
              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
            />
          </div>
        </div>

        {otpRequested ? (
          <div>
            <label className="mb-1.5 block text-sm font-normal text-white/65">OTP code</label>
            <input
              inputMode="numeric"
              value={setupOtp}
              onChange={(e) => setSetupOtp(e.target.value)}
              placeholder="000000"
              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center text-sm tracking-widest text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
            />
          </div>
        ) : null}

        {setupError ? <p className="text-sm text-rose-300">{setupError}</p> : null}
        {debugOtpMessage ? (
          <div className="card-lifted px-4 py-3 text-sm text-white/60">{debugOtpMessage}</div>
        ) : null}
        {debugOtpCode ? (
          <div className="card-lifted px-4 py-3 text-sm text-white/60">
            Dev OTP fallback active. Use code:{" "}
            <span className="font-mono font-semibold">{debugOtpCode}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {!otpRequested ? (
            <button
              type="button"
              onClick={startSetupOtp}
              disabled={setupSubmitting}
              className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {setupSubmitting ? "Sending OTP…" : "Send OTP"}
            </button>
          ) : (
            <button
              type="button"
              onClick={verifySetupOtp}
              disabled={setupSubmitting || setupOtp.trim().length < 6}
              className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {setupSubmitting ? "Verifying…" : "Verify & Continue"}
            </button>
          )}
          {otpRequested ? (
            <button
              type="button"
              onClick={startSetupOtp}
              disabled={setupSubmitting}
              className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-medium text-white/90"
            >
              Resend OTP
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
