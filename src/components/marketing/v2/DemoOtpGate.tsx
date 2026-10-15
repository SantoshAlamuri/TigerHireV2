"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import styles from "@/app/(public)/v2/v2.module.css";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Request failed");
  return data as T;
}

/**
 * WhatsApp OTP gate for the demo's upload tier. On success, hands the signed
 * access token to the parent, which attaches it to scoring requests. The open
 * (sample-pool) tier never renders this.
 */
export default function DemoOtpGate({ onVerified }: { onVerified: (token: string) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function sendCode() {
    setBusy(true);
    setNotice("");
    try {
      await postJson("/api/public/demo/otp/send", { phone });
      setStage("code");
      setNotice("Code sent on WhatsApp — it expires in 10 minutes.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't send the code.");
    }
    setBusy(false);
  }

  async function verifyCode() {
    setBusy(true);
    setNotice("");
    try {
      const data = await postJson<{ token: string }>("/api/public/demo/otp/verify", {
        phone,
        code,
      });
      onVerified(data.token);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't verify the code.");
    }
    setBusy(false);
  }

  const inputClass =
    "rounded-lg border border-[var(--border-interactive)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] placeholder:text-[var(--text-subtle)]";

  return (
    <div className="rounded-xl border border-dashed border-[var(--border-interactive)] p-4">
      <p className={`${styles.mono} text-[11.5px] uppercase tracking-[0.1em] text-[var(--accent)]`}>
        Verify on WhatsApp to score your own CVs
      </p>
      <p className="mt-1.5 text-[12.5px] text-[var(--text-subtle)]">
        Two demo runs per number. We send one code — no spam, no calls.
      </p>
      {stage === "phone" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="WhatsApp number (e.g. 98765 43210)"
            className={`${inputClass} min-w-[220px] flex-1`}
            autoComplete="tel"
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={busy || phone.trim().length < 8}
            className={buttonClasses("primary", "sm")}
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            maxLength={8}
            className={`${inputClass} w-36`}
          />
          <button
            type="button"
            onClick={verifyCode}
            disabled={busy || code.trim().length < 6}
            className={buttonClasses("primary", "sm")}
          >
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStage("phone");
              setCode("");
              setNotice("");
            }}
            className={buttonClasses("ghost", "sm")}
          >
            Change number
          </button>
        </div>
      )}
      {notice && <p className="mt-2 text-[12.5px] text-[var(--text-subtle)]">{notice}</p>}
    </div>
  );
}
