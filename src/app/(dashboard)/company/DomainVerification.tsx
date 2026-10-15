"use client";
import { useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/Button";

export function DomainVerification() {
  const { user } = useAuth();
  const [txtRecord, setTxtRecord] = useState<{
    txt_record_name: string;
    txt_record_value: string;
  } | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const {
    data: domainStatus,
    refetch: refetchDomainStatus,
    error,
  } = useApiQuery<{
    mapping: { primary_domain: string; domain_verified_at: string | null } | null;
  }>(user?.role === "leadership" ? "/api/sso/domain/status" : null);
  async function initiateVerification() {
    setVerifyMessage(null);
    setVerifyLoading(true);
    try {
      const res = await fetch("/api/sso/domain/initiate-verification", {
        method: "POST",
        credentials: "include",
      });
      const payload = (await res.json()) as {
        error?: string;
        txt_record_name?: string;
        txt_record_value?: string;
      };
      if (!res.ok || !payload.txt_record_name || !payload.txt_record_value) {
        setVerifyMessage(payload.error ?? "Could not generate TXT record");
        return;
      }
      setTxtRecord({
        txt_record_name: payload.txt_record_name,
        txt_record_value: payload.txt_record_value,
      });
    } catch {
      setVerifyMessage("Could not reach the server. Please try again.");
    } finally {
      setVerifyLoading(false);
    }
  }

  async function verifyDomain() {
    setVerifyMessage(null);
    setVerifyLoading(true);
    try {
      const res = await fetch("/api/sso/domain/verify", {
        method: "POST",
        credentials: "include",
      });
      const payload = (await res.json()) as { verified?: boolean; error?: string };
      if (!res.ok) {
        setVerifyMessage(payload.error ?? "Verification failed");
        return;
      }
      if (payload.verified) {
        setVerifyMessage("Domain verified successfully.");
        refetchDomainStatus();
      } else {
        setVerifyMessage("TXT record not found yet. Please wait for DNS propagation and retry.");
      }
    } catch {
      setVerifyMessage("Could not reach the server. Please try again.");
    } finally {
      setVerifyLoading(false);
    }
  }

  if (error)
    return (
      <p className="text-sm text-[var(--text-muted)]">Domain verification status is unavailable.</p>
    );
  if (!domainStatus?.mapping || domainStatus.mapping.domain_verified_at) return null;
  return (
    <details className="workspace-panel">
      <summary className="cursor-pointer font-semibold">Verify company domain</summary>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Verify {domainStatus.mapping.primary_domain} to enable single sign-on.
      </p>
      {!txtRecord ? (
        <Button
          className="mt-3"
          variant="secondary"
          disabled={verifyLoading}
          onClick={() => void initiateVerification()}
        >
          {verifyLoading ? "Loading…" : "Get verification record"}
        </Button>
      ) : (
        <>
          <dl className="mt-3 space-y-2 break-all text-sm">
            <div>
              <dt className="text-[var(--text-muted)]">TXT record name</dt>
              <dd>{txtRecord.txt_record_name}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">TXT record value</dt>
              <dd>{txtRecord.txt_record_value}</dd>
            </div>
          </dl>
          <Button className="mt-3" disabled={verifyLoading} onClick={() => void verifyDomain()}>
            {verifyLoading ? "Checking…" : "Verify record"}
          </Button>
        </>
      )}
      {verifyMessage && (
        <p role="status" className="mt-3 text-sm">
          {verifyMessage}
        </p>
      )}
    </details>
  );
}
