"use client";

import { useState } from "react";
import { Shield, UserPlus, X, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery, useApiMutation } from "@/lib/hooks/use-api";
import { ROLE_LABELS, ORG_INVITE_ROLES } from "@/types";
import type { UserRole } from "@/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TIER_COLORS: Record<string, string> = {
  free: "bg-zinc-500/15 text-zinc-400",
  starter: "bg-blue-500/15 text-blue-400",
  growth: "bg-emerald-500/15 text-emerald-400",
  scale: "bg-purple-500/15 text-purple-400",
  enterprise: "bg-amber-500/15 text-amber-400",
};

interface OrgMember {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  is_active?: boolean;
  is_org_admin?: boolean;
  email?: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: UserRole;
  expires_at: string;
}

interface OrgData {
  name: string;
  company_plan: string;
  seats_used?: number;
  seats_total?: number;
}

const LAST_ADMIN_TOAST = "You're the last admin and cannot remove your own admin access.";

export function TeamManagementContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const [showBulkInvite, setShowBulkInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("recruiter");
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{
    import: {
      dryRun: boolean;
      totalRows: number;
      accepted: number;
      rejected: number;
      created: number;
    };
    accepted: Array<{
      row: number;
      email: string;
      role: string;
      status: "created" | "skipped";
      reason?: string;
    }>;
    rejected: Array<{ row: number; email?: string; reason: string }>;
  } | null>(null);

  const {
    data: membersData,
    loading: membersLoading,
    refetch: refetchMembers,
  } = useApiQuery<{
    members: OrgMember[];
    pendingInvites: PendingInvite[];
  }>("/api/organisations/members");
  const { data: orgResponse, loading: orgLoading } = useApiQuery<{
    organisation: OrgData;
  }>("/api/organisations");

  const { mutate: sendInvite, loading: inviting } = useApiMutation<{
    email: string;
    role: string;
  }>("/api/organisations/members");
  const { mutate: updateMemberStatus, loading: updatingStatus } = useApiMutation<{
    userId: string;
    isActive: boolean;
  }>("/api/organisations/members", "PATCH");
  const [updatingOrgAdmin, setUpdatingOrgAdmin] = useState(false);

  const members = membersData?.members ?? [];
  const pendingInvites = membersData?.pendingInvites ?? [];
  const orgData = orgResponse?.organisation;
  const plan = orgData?.company_plan ?? "free";
  const tierColor = TIER_COLORS[plan] ?? TIER_COLORS.free;
  const orgName = orgData?.name ?? user?.organisationName ?? "Your Organisation";
  const canManageOrgAdmin = Boolean(user?.isOrgAdmin);
  const orgAdminCount = members.filter((m) => m.is_org_admin === true).length;

  async function handleInvite() {
    if (!inviteEmail) return;
    await sendInvite({ email: inviteEmail, role: inviteRole });
    setInviteEmail("");
    setShowInvite(false);
    // Refresh so the new pending invite appears without a manual reload (Org #5).
    await refetchMembers();
  }

  async function handleBulkInviteSubmit() {
    if (!bulkCsv.trim()) {
      setBulkError("Please upload a CSV file");
      return;
    }
    setBulkLoading(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const response = await fetch("/api/organisations/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: bulkCsv }),
        credentials: "include",
      });
      const payload = (await response.json()) as {
        error?: string;
        import?: {
          dryRun: boolean;
          totalRows: number;
          accepted: number;
          rejected: number;
          created: number;
        };
        accepted?: Array<{
          row: number;
          email: string;
          role: string;
          status: "created" | "skipped";
          reason?: string;
        }>;
        rejected?: Array<{ row: number; email?: string; reason: string }>;
      };
      if (!response.ok || !payload.import) {
        setBulkError(payload.error ?? "Bulk invite failed");
        return;
      }
      setBulkResult({
        import: payload.import,
        accepted: payload.accepted ?? [],
        rejected: payload.rejected ?? [],
      });
      await refetchMembers();
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleToggleMemberStatus(userId: string, isActive: boolean) {
    await updateMemberStatus({ userId, isActive });
    window.location.reload();
  }

  async function handleToggleOrgAdmin(userId: string, nextValue: boolean) {
    setUpdatingOrgAdmin(true);
    try {
      const res = await fetch("/api/organisations/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isOrgAdmin: nextValue }),
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        toast({
          title: "Cannot change admin access",
          description: LAST_ADMIN_TOAST,
          tone: "error",
        });
        return;
      }
      if (!res.ok) {
        toast({
          title: "Cannot change admin access",
          description: json.error ?? `Request failed (${res.status})`,
          tone: "error",
        });
        return;
      }
      await refetchMembers();
    } finally {
      setUpdatingOrgAdmin(false);
    }
  }

  const loading = membersLoading || orgLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)]">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="heading-card text-lg text-[var(--text)]">{orgName}</h2>
              <p className="text-body text-sm text-[var(--text-muted)]">
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${tierColor}`}>
            {plan}
          </span>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="heading-section text-lg text-[var(--text)]">Team Members</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBulkInvite(true)}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--bg-elevated)]"
            >
              Bulk Upload CSV
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              <UserPlus size={16} />
              Invite Member
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 backdrop-blur-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Name
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Role
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Joined
                </th>
                {canManageOrgAdmin ? (
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    Admin
                  </th>
                ) : null}
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.id === user?.id;
                const adminToggleDisabled =
                  updatingOrgAdmin || (isSelf && m.is_org_admin === true && orgAdminCount <= 1);
                return (
                  <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="heading-card whitespace-nowrap px-5 py-3 text-[var(--text)]">
                      <span className="inline-flex items-center gap-2">
                        {m.full_name}
                        {m.is_org_admin ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                            Admin
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="text-body whitespace-nowrap px-5 py-3 text-[var(--text-muted)]">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </td>
                    <td
                      className="text-body whitespace-nowrap px-5 py-3 text-[var(--text-muted)]"
                      suppressHydrationWarning
                    >
                      {formatDate(m.created_at)}
                    </td>
                    {canManageOrgAdmin ? (
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={m.is_org_admin === true}
                          aria-label={`${m.full_name} organisation admin`}
                          disabled={adminToggleDisabled}
                          onClick={() => handleToggleOrgAdmin(m.id, !m.is_org_admin)}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
                            m.is_org_admin ? "bg-[var(--accent)]" : "bg-zinc-600/50"
                          } ${adminToggleDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition ${
                              m.is_org_admin ? "translate-x-5" : ""
                            }`}
                          />
                        </button>
                      </td>
                    ) : null}
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleToggleMemberStatus(m.id, !m.is_active)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          m.is_active === false
                            ? "bg-zinc-600/30 text-zinc-300"
                            : "bg-emerald-500/20 text-emerald-400"
                        }`}
                      >
                        {m.is_active === false ? "Inactive" : "Active"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td
                    colSpan={canManageOrgAdmin ? 5 : 4}
                    className="px-5 py-8 text-center text-sm text-[var(--text-muted)]"
                  >
                    No team members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="heading-section mb-4 text-lg text-[var(--text)]">Pending Invites</h2>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-4">
          {pendingInvites.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No pending invites.</p>
          )}
          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-[var(--text)]">{invite.email}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {ROLE_LABELS[invite.role]} • expires {formatDate(invite.expires_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
            <button
              type="button"
              aria-label="Close invite modal"
              onClick={() => setShowInvite(false)}
              className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={18} />
            </button>
            <h3 className="heading-card text-lg text-[var(--text)]">Invite Team Member</h3>
            <p className="text-body mt-1 text-sm text-[var(--text-muted)]">
              Send an invite link to add a new member to {orgName}.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="invite-email"
                  className="mb-1.5 block text-sm font-medium text-[var(--text-muted)]"
                >
                  Email Address
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                />
              </div>
              <div>
                <label
                  htmlFor="invite-role"
                  className="mb-1.5 block text-sm font-medium text-[var(--text-muted)]"
                >
                  Role
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                >
                  {ORG_INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleInvite}
                disabled={inviting}
                className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inviting ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
            <button
              type="button"
              aria-label="Close bulk invite modal"
              onClick={() => setShowBulkInvite(false)}
              className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={18} />
            </button>
            <h3 className="heading-card text-lg text-[var(--text)]">Bulk invite team members</h3>
            <p className="text-body mt-1 text-sm text-[var(--text-muted)]">
              Upload a CSV with columns: <code>email</code>, <code>role</code>,{" "}
              <code>full_name</code>.
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Allowed roles: {ORG_INVITE_ROLES.join(", ")}
            </p>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent("email,role,full_name\nalex@example.com,recruiter,Alex Kumar\nnina@example.com,interviewer,Nina Shah")}`}
              download="team-invite-template.csv"
              className="mt-3 inline-block text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              Download template CSV
            </a>

            <div className="mt-4 space-y-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setBulkFileName(file.name);
                  setBulkCsv(await file.text());
                }}
                className="block w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
              {bulkFileName ? (
                <p className="text-xs text-[var(--text-muted)]">Selected file: {bulkFileName}</p>
              ) : null}
              {bulkError ? <p className="text-xs text-red-400">{bulkError}</p> : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkInvite(false)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)]"
              >
                Close
              </button>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={handleBulkInviteSubmit}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Import CSV
              </button>
            </div>

            {bulkResult ? (
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-4 text-xs">
                <p className="text-[var(--text)]">
                  Processed {bulkResult.import.totalRows} rows - created {bulkResult.import.created}
                  , rejected {bulkResult.import.rejected}.
                </p>
                {bulkResult.rejected.length > 0 ? (
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                    {bulkResult.rejected.slice(0, 20).map((row) => (
                      <p key={`${row.row}-${row.email ?? "unknown"}`} className="text-red-300">
                        Row {row.row}: {row.email ? `${row.email} - ` : ""}
                        {row.reason}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
