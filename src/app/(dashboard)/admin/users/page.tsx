"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import type { UserRole } from "@/types";
import { ROLE_LABELS } from "@/types";
import type { AdminUser } from "@/components/admin/AdminUsersTable";
import { ORG_INVITE_ROLES } from "@/types/database";

const AdminUsersTable = dynamic(() => import("@/components/admin/AdminUsersTable"), {
  loading: () => (
    <div className="mt-6 space-y-2 rounded-xl card-lifted p-4">
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-10 rounded-xl" />
    </div>
  ),
});

const ALL_ROLES: ("all" | UserRole)[] = [
  "all",
  "super_admin",
  "leadership",
  "recruiter",
  "interviewer",
  "finance",
  "agency",
  "hiring_manager",
  "employee",
  "candidate_pro",
  "candidate_free",
];

interface OrgOption {
  id: string;
  name: string;
}

interface UserPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface AdminUsersResponse {
  users: AdminUser[];
  pagination: UserPagination;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export default function AdminUsersPage() {
  const [activeRole, setActiveRole] = useState<"all" | UserRole>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50);
  const [showAddUser, setShowAddUser] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFullName, setAddFullName] = useState("");
  const [addRole, setAddRole] = useState<(typeof ORG_INVITE_ROLES)[number]>("recruiter");
  const [addOrgId, setAddOrgId] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const queryParams = useMemo(
    () => ({
      ...(activeRole !== "all" ? { role: activeRole } : {}),
      ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
      page,
      limit,
    }),
    [activeRole, limit, page, searchTerm],
  );
  const { data, loading, refetch } = useApiQuery<AdminUsersResponse>(
    "/api/admin/users",
    queryParams,
  );

  // Search applies as you type (debounced); Enter/Apply skip the delay.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 400);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // New search text always restarts from the first page.
  useEffect(() => {
    setPage(1);
  }, [searchTerm]);
  const { data: orgsData } = useApiQuery<{ organisations: OrgOption[] }>("/api/organisations");
  const {
    mutate: sendInvite,
    loading: inviting,
    error: inviteError,
  } = useOptimisticMutation<
    { message?: string; error?: string },
    {
      email: string;
      fullName: string;
      role: (typeof ORG_INVITE_ROLES)[number];
      organisationId: string;
    }
  >("/api/admin/users", { method: "POST" });

  const users = data?.users ?? [];
  const pagination = data?.pagination;
  const organisations = orgsData?.organisations ?? [];

  async function handleAddUser() {
    if (!addEmail.trim() || !addFullName.trim() || !addOrgId) return;
    const result = await sendInvite({
      email: addEmail.trim(),
      fullName: addFullName.trim(),
      role: addRole,
      organisationId: addOrgId,
    });
    if (result) {
      setAddEmail("");
      setAddFullName("");
      setAddOrgId("");
      setShowAddUser(false);
      refetch();
    }
  }

  function applySearch() {
    setPage(1);
    setSearchTerm(searchInput.trim());
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim() || !resetNewPassword || resetNewPassword !== resetConfirm) {
      setResetError(
        resetNewPassword !== resetConfirm
          ? "Passwords do not match"
          : "Email and password required",
      );
      return;
    }
    if (resetNewPassword.length < 8) {
      setResetError("Password must be at least 8 characters");
      return;
    }
    setResetError(null);
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim(), newPassword: resetNewPassword }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResetSuccess(true);
        setResetEmail("");
        setResetNewPassword("");
        setResetConfirm("");
        setTimeout(() => {
          setShowResetPassword(false);
          setResetSuccess(false);
        }, 2000);
      } else {
        setResetError((data as { error?: string }).error ?? "Failed to reset password");
      }
    } catch {
      setResetError("Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="User Management" subtitle="All platform users" />
      <p className="text-body card-lifted mb-4 rounded-xl px-4 py-3 text-sm text-white/60">
        Candidates use one dashboard (free by default). Change role to{" "}
        <strong>Candidate Pro</strong> to grant full access, or they can upgrade via payment. Use
        the role dropdown on each row to switch between Candidate Free and Candidate Pro.
      </p>
      <div className="card-lifted mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl p-4">
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map((role) => {
            const isActive = role === activeRole;
            return (
              <button
                key={role}
                onClick={() => {
                  setActiveRole(role);
                  setPage(1);
                }}
                className={`text-body rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-white/[0.05] border border-white/10 font-semibold text-white"
                    : "bg-transparent border border-white/10 font-medium text-white/55 hover:text-white"
                }`}
              >
                {role === "all" ? "All" : ROLE_LABELS[role]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
            placeholder="Search by name"
            className="w-56 rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
          <button
            type="button"
            onClick={applySearch}
            className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Apply
          </button>
          {(searchTerm || activeRole !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchTerm("");
                setActiveRole("all");
                setPage(1);
              }}
              className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/audit-log"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.03] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Audit log
          </Link>
          <button
            type="button"
            onClick={() => {
              setShowResetPassword(true);
              setResetError(null);
              setResetSuccess(false);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.03] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Reset password
          </button>
          <button
            type="button"
            onClick={() => setShowAddUser(true)}
            className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            <UserPlus size={16} />
            Add user
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-body text-sm text-white/60">
              {pagination
                ? `Showing ${users.length} of ${pagination.total} users`
                : `Showing ${users.length} users`}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="users-limit" className="text-body text-sm text-white/60">
                Page size
              </label>
              <select
                id="users-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                  setPage(1);
                }}
                className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <AdminUsersTable users={users} onRoleChanged={refetch} organisations={organisations} />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={(pagination?.page ?? 1) <= 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-sm text-[var(--text)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-body text-sm text-white/60">
              Page {pagination?.page ?? page} of {Math.max(pagination?.totalPages ?? 1, 1)}
            </span>
            <button
              type="button"
              disabled={
                pagination ? pagination.page >= pagination.totalPages : users.length < limit
              }
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-sm text-[var(--text)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}

      {showResetPassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md card-lifted p-6">
            <button
              type="button"
              aria-label="Close"
              onClick={() => !resetLoading && setShowResetPassword(false)}
              className="absolute right-4 top-4 text-white/60 hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={18} />
            </button>
            <h3 className="heading-card text-lg text-[var(--text)]">Reset user password</h3>
            <p className="text-body mt-1 text-sm text-white/60">
              Enter the user&apos;s email and a new password (min 8 characters).
            </p>
            {resetSuccess ? (
              <p className="mt-4 text-sm text-emerald-500">Password reset successfully.</p>
            ) : (
              <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="reset-email"
                    className="mb-1.5 block text-sm font-medium text-white/60"
                  >
                    User email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reset-password"
                    className="mb-1.5 block text-sm font-medium text-white/60"
                  >
                    New password
                  </label>
                  <input
                    id="reset-password"
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    minLength={8}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reset-confirm"
                    className="mb-1.5 block text-sm font-medium text-white/60"
                  >
                    Confirm password
                  </label>
                  <input
                    id="reset-confirm"
                    type="password"
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
                {resetError && <p className="text-sm text-red-500">{resetError}</p>}
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetLoading ? "Resetting..." : "Reset password"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {showAddUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="relative w-full max-w-md card-lifted p-6">
            <button
              type="button"
              aria-label="Close add user modal"
              onClick={() => setShowAddUser(false)}
              className="absolute right-4 top-4 text-white/60 hover:text-[var(--text)]"
            >
              <X size={18} />
            </button>
            <h3 className="heading-card text-lg text-[var(--text)]">Add user to organisation</h3>
            <p className="text-body mt-1 text-sm text-white/60">
              Send an invite so they can join an organisation (employee, recruiter, etc.).
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="add-user-email"
                  className="mb-1.5 block text-sm font-medium text-white/60"
                >
                  Email
                </label>
                <input
                  id="add-user-email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>
              <div>
                <label
                  htmlFor="add-user-name"
                  className="mb-1.5 block text-sm font-medium text-white/60"
                >
                  Full name
                </label>
                <input
                  id="add-user-name"
                  type="text"
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>
              <div>
                <label
                  htmlFor="add-user-role"
                  className="mb-1.5 block text-sm font-medium text-white/60"
                >
                  Role
                </label>
                <select
                  id="add-user-role"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as (typeof ORG_INVITE_ROLES)[number])}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  {ORG_INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r as UserRole] ?? r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="add-user-org"
                  className="mb-1.5 block text-sm font-medium text-white/60"
                >
                  Organisation
                </label>
                <select
                  id="add-user-org"
                  value={addOrgId}
                  onChange={(e) => setAddOrgId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="">Select organisation</option>
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
              {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}
              <button
                type="button"
                onClick={handleAddUser}
                disabled={inviting || !addEmail.trim() || !addFullName.trim() || !addOrgId}
                className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inviting ? "Sending..." : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
