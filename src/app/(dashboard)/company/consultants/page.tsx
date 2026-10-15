"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useApiQuery } from "@/lib/hooks/use-api";
import {
  LinkedFirmsSection,
  PendingInvitesSection,
  InviteHistorySection,
  AccessRequestsSection,
} from "./ConsultantSections";
import { InviteConsultantModal } from "./InviteConsultantModal";
import type { ConsultantsResponse } from "./types";

export default function CompanyConsultantsPage() {
  const { data, loading, refetch } = useApiQuery<ConsultantsResponse>("/api/company/consultants");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = data?.canManage ?? false;

  const revokeInvite = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/company/consultants/invites/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) refetch();
      } finally {
        setBusyId(null);
      }
    },
    [refetch],
  );

  const decideRequest = useCallback(
    async (linkId: string, name: string, decision: "approve" | "decline") => {
      if (
        decision === "approve" &&
        !window.confirm(`Give ${name} access to your open roles and the candidates they submit?`)
      ) {
        return;
      }
      setBusyId(linkId);
      try {
        const res = await fetch(`/api/company/consultants/links/${linkId}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ decision }),
        });
        const payload = (await res.json()) as { message?: string; error?: string };
        setSuccess(res.ok ? (payload.message ?? "Decision saved") : (payload.error ?? null));
        if (res.ok) refetch();
      } finally {
        setBusyId(null);
      }
    },
    [refetch],
  );

  const removeConsultant = useCallback(
    async (linkId: string, name: string) => {
      if (!window.confirm(`Remove ${name}'s access to your roles and candidates?`)) return;
      setBusyId(linkId);
      try {
        const res = await fetch(`/api/company/consultants/links/${linkId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) refetch();
      } finally {
        setBusyId(null);
      }
    },
    [refetch],
  );

  const invites = data?.invites ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consultants"
        subtitle="External recruiting firms working on your roles"
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => {
                setInviteOpen(true);
                setSuccess(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[var(--bg)] transition hover:bg-amber-400"
            >
              <Plus className="h-4 w-4" />
              Invite a firm
            </button>
          ) : null
        }
      />

      {success ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      ) : null}

      <AccessRequestsSection
        requests={data?.requests ?? []}
        canManage={canManage}
        busyId={busyId}
        onDecide={decideRequest}
      />

      <LinkedFirmsSection
        consultants={data?.consultants ?? []}
        loading={loading}
        canManage={canManage}
        busyId={busyId}
        onRemove={removeConsultant}
      />

      <PendingInvitesSection
        invites={invites.filter((i) => i.status === "pending")}
        canManage={canManage}
        busyId={busyId}
        onRevoke={revokeInvite}
      />

      <InviteHistorySection invites={invites.filter((i) => i.status !== "pending")} />

      {inviteOpen ? (
        <InviteConsultantModal
          onClose={() => setInviteOpen(false)}
          onSent={(message) => {
            setSuccess(message);
            setInviteOpen(false);
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}
