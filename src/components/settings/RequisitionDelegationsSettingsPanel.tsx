"use client";

import { Loader2, UserPlus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { SettingsEditableForm } from "@/components/settings/SettingsEditableForm";
import { useApiQuery } from "@/lib/hooks/use-api";

type Delegation = {
  id: string;
  approver_role: string;
  delegate_profile_id: string;
  starts_at: string;
  ends_at: string;
  reason?: string | null;
};

type Profile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
};

export function RequisitionDelegationsSettingsPanel() {
  const { data, loading, error, refetch } = useApiQuery<{ delegations: Delegation[] }>(
    "/api/settings/requisition-delegations",
  );
  const { data: profilesData } = useApiQuery<{ profiles: Profile[] }>("/api/profiles");
  const profiles = profilesData?.profiles ?? [];
  const profileMap = useMemo(
    () =>
      Object.fromEntries(
        profiles.map((p) => [p.id, p.full_name || p.email || p.role || p.id]) as Array<
          [string, string]
        >,
      ),
    [profiles],
  );

  const [approverRole, setApproverRole] = useState("finance");
  const [delegateProfileId, setDelegateProfileId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Approval delegations</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Configure proxy approvers when primary approvers are unavailable.
        </p>
      </div>

      <SettingsEditableForm>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Add delegation</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select
              value={approverRole}
              onChange={(e) => setApproverRole(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            >
              <option value="hiring_manager">Hiring Manager</option>
              <option value="recruiter">Recruiter</option>
              <option value="finance">Finance</option>
              <option value="leadership">Company Admin</option>
            </select>
            <select
              value={delegateProfileId}
              onChange={(e) => setDelegateProfileId(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            >
              <option value="">Select delegate</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email || profile.id}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <div className="mt-3 flex items-center gap-3">
            {saveError ? <p className="text-xs text-red-300">{saveError}</p> : null}
            {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
            <button
              type="button"
              disabled={saving || !delegateProfileId || !startsAt || !endsAt}
              onClick={async () => {
                setSaving(true);
                setNotice(null);
                setSaveError(null);
                try {
                  const response = await fetch("/api/settings/requisition-delegations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      approverRole,
                      delegateProfileId,
                      startsAt: new Date(startsAt).toISOString(),
                      endsAt: new Date(endsAt).toISOString(),
                      reason: reason.trim() || null,
                    }),
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error || "Failed to save delegation");
                  setNotice("Delegation added");
                  setDelegateProfileId("");
                  setReason("");
                  await refetch();
                } catch (e) {
                  setSaveError(e instanceof Error ? e.message : "Failed to save delegation");
                } finally {
                  setSaving(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Save delegation
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Active delegations</h3>
          {loading ? <p className="mt-2 text-sm text-[var(--text-muted)]">Loading…</p> : null}
          {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
          <div className="mt-3 space-y-2">
            {(data?.delegations ?? []).map((delegation) => (
              <div
                key={delegation.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              >
                <div>
                  <p className="text-sm text-[var(--text)]">
                    {delegation.approver_role}
                    {" -> "}
                    <span className="font-medium text-[var(--text)]">
                      {profileMap[delegation.delegate_profile_id] || delegation.delegate_profile_id}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {new Date(delegation.starts_at).toLocaleString()} -{" "}
                    {new Date(delegation.ends_at).toLocaleString()}
                  </p>
                  {delegation.reason ? (
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">{delegation.reason}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/settings/requisition-delegations/${delegation.id}`, {
                      method: "DELETE",
                      credentials: "include",
                    });
                    await refetch();
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-red-300"
                >
                  <Trash2 size={12} />
                  Revoke
                </button>
              </div>
            ))}
            {!loading && (data?.delegations?.length ?? 0) === 0 ? (
              <p className="text-xs text-[var(--text-subtle)]">No active delegations.</p>
            ) : null}
          </div>
        </div>
      </SettingsEditableForm>
    </div>
  );
}
