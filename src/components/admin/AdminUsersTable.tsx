"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, ChevronDown, Pencil, X, Trash2, UserX, UserCheck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { UserRole } from "@/types";
import { ROLE_LABELS } from "@/types";
import { USER_ROLES } from "@/types/database";

export interface AdminUser {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  email?: string | null;
  is_active?: boolean | null;
  organisations?: { id: string; name: string } | null;
}

export interface AdminUserOrgOption {
  id: string;
  name: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const EDITABLE_ROLES = USER_ROLES;

export default function AdminUsersTable({
  users,
  onRoleChanged,
  organisations = [],
}: {
  users: AdminUser[];
  onRoleChanged?: () => void;
  organisations?: AdminUserOrgOption[];
}) {
  const [openDropdownUserId, setOpenDropdownUserId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [optimisticRoles, setOptimisticRoles] = useState<Record<string, UserRole>>({});
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editOrgId, setEditOrgId] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  function openEdit(user: AdminUser) {
    setEditingUser(user);
    setEditName(user.full_name ?? "");
    setEditEmail(user.email ?? "");
    setEditOrgId(user.organisations?.id ?? "");
    setEditError(null);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    const payload: Record<string, unknown> = { userId: editingUser.id };
    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();
    if (trimmedName && trimmedName !== (editingUser.full_name ?? "")) {
      payload.fullName = trimmedName;
    }
    if (trimmedEmail && trimmedEmail !== (editingUser.email ?? "")) {
      payload.email = trimmedEmail;
    }
    if (editOrgId !== (editingUser.organisations?.id ?? "")) {
      payload.organisationId = editOrgId || null;
    }
    if (Object.keys(payload).length === 1) {
      setEditingUser(null);
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error ?? "Update failed");
      }
      toast({
        title: "User updated",
        description: `${trimmedName || editingUser.full_name} saved.`,
        tone: "success",
      });
      setEditingUser(null);
      onRoleChanged?.();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggleActive(user: AdminUser) {
    const nextActive = user.is_active === false;
    setTogglingActiveId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, isActive: nextActive }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error ?? "Update failed");
      }
      toast({
        title: nextActive ? "User reactivated" : "User deactivated",
        description: nextActive
          ? `${user.full_name} can sign in again.`
          : `${user.full_name} can no longer sign in.`,
        tone: "success",
      });
      onRoleChanged?.();
    } catch (err) {
      toast({
        title: nextActive ? "Failed to reactivate user" : "Failed to deactivate user",
        description: err instanceof Error ? err.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setTogglingActiveId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingUser) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: deletingUser.id }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error ?? "Delete failed");
      }
      toast({
        title: "User deleted",
        description: `${deletingUser.full_name} has been permanently removed.`,
        tone: "success",
      });
      setDeletingUser(null);
      onRoleChanged?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        openDropdownUserId &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpenDropdownUserId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdownUserId]);

  async function handleRoleSelect(userId: string, role: UserRole) {
    setUpdatingUserId(userId);
    setOpenDropdownUserId(null);
    const previousRole = users.find((user) => user.id === userId)?.role;
    setOptimisticRoles((prev) => ({ ...prev, [userId]: role }));
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error ?? "Update failed");
      }
      setOptimisticRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      toast({
        title: "User role updated",
        description: `Changed to ${ROLE_LABELS[role] ?? role}.`,
        tone: "success",
      });
      onRoleChanged?.();
    } catch (err) {
      setOptimisticRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      toast({
        title: "Failed to update user role",
        description:
          err instanceof Error
            ? err.message
            : previousRole
              ? `Role remains ${ROLE_LABELS[previousRole] ?? previousRole}.`
              : "Please try again.",
        tone: "error",
      });
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 backdrop-blur-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="heading-card px-5 py-3 text-xs font-medium tracking-wide text-[var(--text-muted)]">
              Name
            </th>
            <th className="heading-card px-5 py-3 text-xs font-medium tracking-wide text-[var(--text-muted)]">
              Email
            </th>
            <th className="heading-card px-5 py-3 text-xs font-medium tracking-wide text-[var(--text-muted)]">
              Role
            </th>
            <th className="heading-card px-5 py-3 text-xs font-medium tracking-wide text-[var(--text-muted)]">
              Joined
            </th>
            <th className="heading-card px-5 py-3 text-xs font-medium tracking-wide text-[var(--text-muted)]">
              Organisation
            </th>
            <th className="heading-card px-5 py-3 text-xs font-medium tracking-wide text-[var(--text-muted)]">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-b border-[var(--border)] last:border-b-0 transition-colors hover:bg-[var(--bg-elevated)]/40"
            >
              <td className="heading-card whitespace-nowrap px-5 py-3 text-[var(--text)]">
                <span className={user.is_active === false ? "opacity-50" : undefined}>
                  {user.full_name ?? "—"}
                </span>
                {user.is_active === false && (
                  <span className="ml-2 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                    Inactive
                  </span>
                )}
              </td>
              <td className="text-body whitespace-nowrap px-5 py-3 text-[var(--text-muted)]">
                {user.email ?? "—"}
              </td>
              <td className="relative px-5 py-3">
                <div ref={openDropdownUserId === user.id ? dropdownRef : null}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDropdownUserId((prev) => (prev === user.id ? null : user.id))
                    }
                    disabled={!!updatingUserId}
                    className="text-body inline-flex items-center gap-1 rounded-md bg-[var(--accent-muted)] px-2 py-0.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent-muted)]/80 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {updatingUserId === user.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        {ROLE_LABELS[optimisticRoles[user.id] ?? user.role] ??
                          optimisticRoles[user.id] ??
                          user.role}
                        <ChevronDown
                          size={12}
                          className={openDropdownUserId === user.id ? "rotate-180" : ""}
                        />
                      </>
                    )}
                  </button>
                  {openDropdownUserId === user.id && (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[150px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
                      {EDITABLE_ROLES.map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => handleRoleSelect(user.id, role)}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--bg-elevated)]"
                        >
                          {ROLE_LABELS[role] ?? role}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </td>
              <td
                className="text-body whitespace-nowrap px-5 py-3 text-[var(--text-muted)]"
                suppressHydrationWarning
              >
                {formatDate(user.created_at)}
              </td>
              <td className="text-body whitespace-nowrap px-5 py-3 text-[var(--text-muted)]">
                {user.organisations?.name ?? "—"}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(user)}
                    aria-label={`Edit ${user.full_name ?? "user"}`}
                    className="text-body inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text)]"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(user)}
                    disabled={togglingActiveId === user.id}
                    aria-label={
                      user.is_active === false
                        ? `Reactivate ${user.full_name ?? "user"}`
                        : `Deactivate ${user.full_name ?? "user"}`
                    }
                    title={
                      user.is_active === false
                        ? "Reactivate (allow sign-in)"
                        : "Deactivate (block sign-in)"
                    }
                    className="text-body inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {togglingActiveId === user.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : user.is_active === false ? (
                      <UserCheck size={12} />
                    ) : (
                      <UserX size={12} />
                    )}
                    {user.is_active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingUser(user);
                      setDeleteError(null);
                    }}
                    aria-label={`Delete ${user.full_name ?? "user"}`}
                    title="Permanently delete this user"
                    className="text-body inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/[0.06] px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/[0.12]"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="text-body px-5 py-10 text-center text-[var(--text-subtle)]"
              >
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {deletingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md card-lifted p-6">
            <button
              type="button"
              aria-label="Close delete user modal"
              onClick={() => !deleteBusy && setDeletingUser(null)}
              className="absolute right-4 top-4 text-white/60 hover:text-[var(--text)]"
            >
              <X size={18} />
            </button>
            <h3 className="heading-card text-lg text-[var(--text)]">Delete user?</h3>
            <p className="text-body mt-2 text-sm text-white/60">
              This permanently removes{" "}
              <strong className="text-[var(--text)]">{deletingUser.full_name}</strong>
              {deletingUser.email ? ` (${deletingUser.email})` : ""} — their sign-in and profile are
              deleted and cannot be recovered. Users with activity (plans, referrals, invites)
              cannot be deleted; deactivate them instead.
            </p>
            {deleteError && <p className="mt-3 text-sm text-red-500">{deleteError}</p>}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                disabled={deleteBusy}
                className="flex-1 rounded-full border border-[var(--border)] bg-white/[0.03] py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteBusy}
                className="flex-1 rounded-full bg-red-500/90 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteBusy ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md card-lifted p-6">
            <button
              type="button"
              aria-label="Close edit user modal"
              onClick={() => !editSaving && setEditingUser(null)}
              className="absolute right-4 top-4 text-white/60 hover:text-[var(--text)]"
            >
              <X size={18} />
            </button>
            <h3 className="heading-card text-lg text-[var(--text)]">Edit user</h3>
            <p className="text-body mt-1 text-sm text-white/60">
              Update the user&apos;s name, email, or organisation. Role is changed from the table
              dropdown.
            </p>
            <form onSubmit={handleEditSave} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="edit-user-name"
                  className="mb-1.5 block text-sm font-medium text-white/60"
                >
                  Full name
                </label>
                <input
                  id="edit-user-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-user-email"
                  className="mb-1.5 block text-sm font-medium text-white/60"
                >
                  Email
                </label>
                <input
                  id="edit-user-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                <p className="text-body mt-1 text-xs text-white/40">
                  Changing the email updates their login immediately — make sure it&apos;s correct.
                </p>
              </div>
              <div>
                <label
                  htmlFor="edit-user-org"
                  className="mb-1.5 block text-sm font-medium text-white/60"
                >
                  Organisation
                </label>
                <select
                  id="edit-user-org"
                  value={editOrgId}
                  onChange={(e) => setEditOrgId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="">No organisation</option>
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
              <button
                type="submit"
                disabled={editSaving}
                className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save changes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
