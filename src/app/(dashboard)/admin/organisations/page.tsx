"use client";

import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  Plus,
  Pencil,
  SlidersHorizontal,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { getJobLifecycleTone, getOrgApprovalTone } from "@/lib/status-tones";

type OrganisationType = "company" | "agency";
type OrganisationApproval = "pending" | "approved" | "rejected";

interface OrganisationRow {
  id: string;
  type: OrganisationType;
  name: string | null;
  slug: string | null;
  enforce_sso: boolean;
  approval: OrganisationApproval;
  created_at: string;
  updated_at: string;
}

interface OrganisationsResponse {
  organisations: OrganisationRow[];
}

interface OrgFeatureRow {
  key: string;
  label: string;
  planDefault: boolean;
  override: boolean | null;
  effective: boolean;
}

interface OrgRuntimeFlagRow {
  key: string;
  description: string | null;
  globalDefault: boolean;
  override: boolean | null;
  effective: boolean;
}

const TYPE_LABELS: Record<OrganisationType, string> = {
  company: "Company",
  agency: "Agency",
};

const APPROVAL_LABELS: Record<OrganisationApproval, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const REPORT_SECONDARY_ACTION_CLASS =
  "rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminOrganisationsPage() {
  const { data, loading, refetch } = useApiQuery<OrganisationsResponse>("/api/organisations");
  const [filterType, setFilterType] = useState<OrganisationType | "all">("all");
  const [filterApproval, setFilterApproval] = useState<OrganisationApproval | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [createType, setCreateType] = useState<OrganisationType>("company");
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createApproval, setCreateApproval] = useState<OrganisationApproval>("approved");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editApproval, setEditApproval] = useState<OrganisationApproval>("approved");
  const [editEnforceSso, setEditEnforceSso] = useState(false);
  const [featuresForOrg, setFeaturesForOrg] = useState<OrganisationRow | null>(null);
  const [featureRows, setFeatureRows] = useState<OrgFeatureRow[]>([]);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featureActionLoadingKey, setFeatureActionLoadingKey] = useState<string | null>(null);
  const [runtimeRows, setRuntimeRows] = useState<OrgRuntimeFlagRow[]>([]);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeActionLoadingKey, setRuntimeActionLoadingKey] = useState<string | null>(null);
  const [activeFeaturePanel, setActiveFeaturePanel] = useState<"entitlements" | "runtime">(
    "entitlements",
  );
  const [runtimeSearch, setRuntimeSearch] = useState("");

  const organisations = data?.organisations ?? [];
  const filtered = organisations.filter((org) => {
    if (filterType !== "all" && org.type !== filterType) return false;
    if (filterApproval !== "all" && org.approval !== filterApproval) return false;
    return true;
  });
  const filteredRuntimeRows = runtimeRows.filter((row) => {
    const q = runtimeSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      row.key.toLowerCase().includes(q) ||
      (row.description ? row.description.toLowerCase().includes(q) : false)
    );
  });

  async function setApproval(orgId: string, approval: OrganisationApproval) {
    setError(null);
    setUpdatingId(orgId);
    try {
      const res = await fetch("/api/organisations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organisationId: orgId, approval }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Request failed (${res.status})`);
        return;
      }
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setUpdatingId(null);
    }
  }

  async function createOrganisation() {
    if (!createName.trim()) return;
    setError(null);
    setSavingOrg(true);
    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: createType,
          name: createName.trim(),
          ...(createSlug.trim() ? { slug: createSlug.trim() } : {}),
          approval: createType === "agency" ? createApproval : "approved",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Request failed (${res.status})`);
        return;
      }
      setShowCreate(false);
      setCreateName("");
      setCreateSlug("");
      setCreateType("company");
      setCreateApproval("approved");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSavingOrg(false);
    }
  }

  function openEdit(org: OrganisationRow) {
    setEditId(org.id);
    setEditName(org.name ?? "");
    setEditSlug(org.slug ?? "");
    setEditApproval(org.approval);
    setEditEnforceSso(org.enforce_sso === true);
    setShowEdit(true);
  }

  async function updateOrganisation() {
    if (!editId || !editName.trim()) return;
    setError(null);
    setSavingOrg(true);
    try {
      const trimmedSlug = editSlug.trim();
      const res = await fetch("/api/organisations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organisationId: editId,
          name: editName.trim(),
          ...(trimmedSlug ? { slug: trimmedSlug } : {}),
          approval: editApproval,
          enforce_sso: editEnforceSso,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Request failed (${res.status})`);
        return;
      }
      setShowEdit(false);
      setEditId(null);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSavingOrg(false);
    }
  }

  async function openFeatures(org: OrganisationRow) {
    setFeaturesForOrg(org);
    setShowFeatures(true);
    setActiveFeaturePanel("entitlements");
    setRuntimeSearch("");
    setFeaturesLoading(true);
    setRuntimeLoading(true);
    setError(null);
    try {
      const [featuresRes, runtimeRes] = await Promise.all([
        fetch(`/api/admin/organisations/${org.id}/features`, {
          credentials: "include",
        }),
        fetch(`/api/admin/organisations/${org.id}/runtime-flags`, {
          credentials: "include",
        }),
      ]);
      const featuresJson = await featuresRes.json();
      const runtimeJson = await runtimeRes.json();

      if (!featuresRes.ok) {
        setError(featuresJson?.error ?? `Request failed (${featuresRes.status})`);
        return;
      }
      if (!runtimeRes.ok) {
        setError(runtimeJson?.error ?? `Request failed (${runtimeRes.status})`);
        return;
      }

      setFeatureRows((featuresJson?.features as OrgFeatureRow[]) ?? []);
      setRuntimeRows((runtimeJson?.flags as OrgRuntimeFlagRow[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setFeaturesLoading(false);
      setRuntimeLoading(false);
    }
  }

  async function setFeatureOverride(
    orgId: string,
    featureKey: string,
    value: "default" | "enabled" | "disabled",
  ) {
    setError(null);
    setFeatureActionLoadingKey(featureKey);
    try {
      if (value === "default") {
        const res = await fetch(`/api/admin/organisations/${orgId}/features`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ featureKey }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? `Request failed (${res.status})`);
          return;
        }
      } else {
        const res = await fetch(`/api/admin/organisations/${orgId}/features`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ featureKey, enabled: value === "enabled" }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? `Request failed (${res.status})`);
          return;
        }
      }
      setFeatureRows((prev) =>
        prev.map((row) => {
          if (row.key !== featureKey) return row;
          const nextOverride = value === "default" ? null : value === "enabled";
          return {
            ...row,
            override: nextOverride,
            effective: nextOverride === null ? row.planDefault : nextOverride,
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setFeatureActionLoadingKey(null);
    }
  }

  async function setRuntimeFlagOverride(
    orgId: string,
    flagKey: string,
    value: "default" | "enabled" | "disabled",
  ) {
    setError(null);
    setRuntimeActionLoadingKey(flagKey);
    try {
      if (value === "default") {
        const res = await fetch(`/api/admin/organisations/${orgId}/runtime-flags`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ flagKey }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? `Request failed (${res.status})`);
          return;
        }
      } else {
        const res = await fetch(`/api/admin/organisations/${orgId}/runtime-flags`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ flagKey, enabled: value === "enabled" }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? `Request failed (${res.status})`);
          return;
        }
      }

      setRuntimeRows((prev) =>
        prev.map((row) => {
          if (row.key !== flagKey) return row;
          const nextOverride = value === "default" ? null : value === "enabled";
          return {
            ...row,
            override: nextOverride,
            effective: nextOverride === null ? row.globalDefault : nextOverride,
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setRuntimeActionLoadingKey(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Organisations"
        subtitle="View and approve agencies. Companies are auto-approved."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-2 text-sm font-semibold text-[var(--accent)] transition-colors duration-200 hover:border-[var(--accent)]/45 hover:bg-[var(--accent)]/15 hover:text-[var(--accent-hover)]"
              aria-label="Refresh"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition-colors duration-200 hover:bg-[var(--accent-hover)]"
            >
              <Plus size={16} />
              Create organisation
            </button>
          </div>
        }
      />
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="card-lifted mb-6 flex flex-wrap items-end gap-4 rounded-xl p-4">
        <span className="flex items-center gap-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">
          <Filter size={16} />
          Filters
        </span>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as OrganisationType | "all")}
          className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 focus:outline-none focus:ring-2 focus:ring-white/30"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          <option value="company">Company</option>
          <option value="agency">Agency</option>
        </select>
        <select
          value={filterApproval}
          onChange={(e) => setFilterApproval(e.target.value as OrganisationApproval | "all")}
          className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 focus:outline-none focus:ring-2 focus:ring-white/30"
          aria-label="Filter by approval"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : (
        <div className="card-lifted overflow-x-auto rounded-xl">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]/45">
                {["Name", "Slug", "Type", "SSO", "Approval", "Created", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="heading-card whitespace-nowrap px-4 py-3 text-xs font-medium tracking-wide text-white/60"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((org) => (
                <tr
                  key={org.id}
                  className="card-lifted-hover border-b border-[var(--border)] last:border-b-0 transition-colors duration-150"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--text)]">
                    {org.name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/60">{org.slug ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-block rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text)]">
                      {TYPE_LABELS[org.type]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge tone={getJobLifecycleTone(org.enforce_sso)} size="sm">
                      {org.enforce_sso ? "Enforced" : "Optional"}
                    </StatusBadge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge
                      tone={getOrgApprovalTone(org.approval)}
                      icon={
                        org.approval === "pending" ? (
                          <Clock size={12} className="shrink-0" />
                        ) : org.approval === "approved" ? (
                          <CheckCircle2 size={12} className="shrink-0" />
                        ) : (
                          <XCircle size={12} className="shrink-0" />
                        )
                      }
                      size="sm"
                    >
                      {APPROVAL_LABELS[org.approval]}
                    </StatusBadge>
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-white/60"
                    suppressHydrationWarning
                  >
                    {formatDate(org.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {(org.type === "agency" || org.type === "company") &&
                        org.approval === "pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setApproval(org.id, "approved")}
                              disabled={updatingId === org.id}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingId === org.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <CheckCircle2 size={14} />
                              )}
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setApproval(org.id, "rejected")}
                              disabled={updatingId === org.id}
                              className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <XCircle size={14} />
                              Reject
                            </button>
                          </>
                        )}
                      {(org.type === "agency" || org.type === "company") &&
                        org.approval !== "pending" &&
                        org.approval === "rejected" && (
                          <button
                            type="button"
                            onClick={() => setApproval(org.id, "approved")}
                            disabled={updatingId === org.id}
                            className={REPORT_SECONDARY_ACTION_CLASS}
                          >
                            {updatingId === org.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              "Approve"
                            )}
                          </button>
                        )}
                      {(org.type === "agency" || org.type === "company") &&
                        org.approval === "approved" && (
                          <button
                            type="button"
                            onClick={() => setApproval(org.id, "rejected")}
                            disabled={updatingId === org.id}
                            className={REPORT_SECONDARY_ACTION_CLASS}
                          >
                            Reject
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => openEdit(org)}
                        className={REPORT_SECONDARY_ACTION_CLASS}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Pencil size={12} />
                          Edit
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openFeatures(org)}
                        className={REPORT_SECONDARY_ACTION_CLASS}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <SlidersHorizontal size={12} />
                          Features
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-white/60">
                    No organisations match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg card-lifted p-6">
            <h3 className="heading-card text-lg text-[var(--text)]">Create organisation</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/60">Type</label>
                <select
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value as OrganisationType)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value="company">Company</option>
                  <option value="agency">Agency</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/60">Name</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Acme Inc"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/60">
                  Slug (optional)
                </label>
                <input
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  placeholder="acme-inc"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
              {createType === "agency" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white/60">Approval</label>
                  <select
                    value={createApproval}
                    onChange={(e) => setCreateApproval(e.target.value as OrganisationApproval)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createOrganisation}
                disabled={savingOrg || !createName.trim()}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingOrg ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFeatures && featuresForOrg && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/55 p-4 backdrop-blur-md sm:p-8">
          <div className="flex min-h-full items-start justify-center py-3 sm:py-8">
            <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-white/15 bg-[var(--bg-elevated)]/75 shadow-2xl backdrop-blur-xl">
              <div className="shrink-0 border-b border-white/10 bg-[var(--bg-elevated)]/85 px-6 py-5">
                <h3 className="heading-card text-lg text-[var(--text)]">
                  Feature controls - {featuresForOrg.name ?? featuresForOrg.slug ?? "Organisation"}
                </h3>
                <p className="mt-1 text-sm text-white/60">
                  Use Entitlements for plan-level controls and Runtime Flags for execution toggles.
                </p>
                <div className="mt-4 inline-flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[var(--surface)]/35 p-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveFeaturePanel("entitlements")}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeFeaturePanel === "entitlements"
                        ? "bg-[var(--accent)] text-black"
                        : "border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]/30"
                    }`}
                  >
                    Entitlements ({featureRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFeaturePanel("runtime")}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeFeaturePanel === "runtime"
                        ? "bg-[var(--accent)] text-black"
                        : "border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]/30"
                    }`}
                  >
                    Runtime Flags ({runtimeRows.length})
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
                {activeFeaturePanel === "entitlements" &&
                  (featuresLoading ? (
                    <div className="space-y-3 py-4">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-5/6" />
                    </div>
                  ) : (
                    <div className="overflow-auto rounded-xl border border-white/10 bg-[var(--surface)]/35 px-1 py-1">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface)]/55">
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                              Feature
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                              Plan default
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                              Override
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                              Effective
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {featureRows.map((row) => (
                            <tr
                              key={row.key}
                              className="border-b border-[var(--border)]/70 transition-colors hover:bg-white/[0.04] last:border-b-0"
                            >
                              <td className="px-4 py-3.5 text-[var(--text)]">{row.label}</td>
                              <td className="px-4 py-3.5 text-white/60">
                                {row.planDefault ? "Enabled" : "Disabled"}
                              </td>
                              <td className="px-4 py-3.5">
                                <select
                                  value={
                                    row.override === null
                                      ? "default"
                                      : row.override
                                        ? "enabled"
                                        : "disabled"
                                  }
                                  disabled={featureActionLoadingKey === row.key}
                                  onChange={(e) =>
                                    setFeatureOverride(
                                      featuresForOrg.id,
                                      row.key,
                                      e.target.value as "default" | "enabled" | "disabled",
                                    )
                                  }
                                  className="min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                                >
                                  <option value="default">Use plan default</option>
                                  <option value="enabled">Force enabled</option>
                                  <option value="disabled">Force disabled</option>
                                </select>
                              </td>
                              <td className="px-4 py-3.5">
                                <StatusBadge tone={row.effective ? "success" : "danger"} size="sm">
                                  {featureActionLoadingKey === row.key
                                    ? "Saving..."
                                    : row.effective
                                      ? "Enabled"
                                      : "Disabled"}
                                </StatusBadge>
                              </td>
                            </tr>
                          ))}
                          {featureRows.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-10 text-center text-white/60">
                                No features configured.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))}

                {activeFeaturePanel === "runtime" && (
                  <>
                    <div className="rounded-xl border border-white/10 bg-[var(--surface)]/35 px-4 py-3.5">
                      <label className="flex items-center gap-2 text-xs text-white/60">
                        <Search size={14} />
                        Search runtime flags
                      </label>
                      <input
                        value={runtimeSearch}
                        onChange={(e) => setRuntimeSearch(e.target.value)}
                        placeholder="e.g. ghostbuster_authenticity_agent, consent_flow"
                        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    {runtimeLoading ? (
                      <div className="space-y-3 py-3">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-4/5" />
                      </div>
                    ) : (
                      <div className="mt-3 overflow-auto rounded-xl border border-white/10 bg-[var(--surface)]/35 px-1 py-1">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--surface)]/55">
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                                Flag key
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                                Global default
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                                Override
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                                Effective
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRuntimeRows.map((row) => (
                              <tr
                                key={row.key}
                                className="border-b border-[var(--border)]/70 transition-colors hover:bg-white/[0.04] last:border-b-0"
                              >
                                <td className="px-4 py-3.5 text-[var(--text)]">
                                  <div className="font-mono text-xs font-semibold tracking-tight sm:text-sm">
                                    {row.key}
                                  </div>
                                  {row.description ? (
                                    <div className="mt-0.5 text-xs text-white/60">
                                      {row.description}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3.5 text-white/60">
                                  {row.globalDefault ? "Enabled" : "Disabled"}
                                </td>
                                <td className="px-4 py-3.5">
                                  <select
                                    value={
                                      row.override === null
                                        ? "default"
                                        : row.override
                                          ? "enabled"
                                          : "disabled"
                                    }
                                    disabled={runtimeActionLoadingKey === row.key}
                                    onChange={(e) =>
                                      setRuntimeFlagOverride(
                                        featuresForOrg.id,
                                        row.key,
                                        e.target.value as "default" | "enabled" | "disabled",
                                      )
                                    }
                                    className="min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                                  >
                                    <option value="default">Use global default</option>
                                    <option value="enabled">Force enabled</option>
                                    <option value="disabled">Force disabled</option>
                                  </select>
                                </td>
                                <td className="px-4 py-3.5">
                                  <StatusBadge
                                    tone={row.effective ? "success" : "danger"}
                                    size="sm"
                                  >
                                    {runtimeActionLoadingKey === row.key
                                      ? "Saving..."
                                      : row.effective
                                        ? "Enabled"
                                        : "Disabled"}
                                  </StatusBadge>
                                </td>
                              </tr>
                            ))}
                            {filteredRuntimeRows.length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-4 py-10 text-center text-white/60">
                                  {runtimeRows.length === 0
                                    ? "No runtime flags configured."
                                    : "No runtime flags match your search."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="shrink-0 border-t border-white/10 bg-[var(--bg-elevated)]/85 px-6 py-5">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowFeatures(false)}
                    className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 hover:bg-white/[0.04]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg card-lifted p-6">
            <h3 className="heading-card text-lg text-[var(--text)]">Edit organisation</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/60">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/60">Slug</label>
                <input
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/60">Approval</label>
                <select
                  value={editApproval}
                  onChange={(e) => setEditApproval(e.target.value as OrganisationApproval)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <input
                  type="checkbox"
                  checked={editEnforceSso}
                  onChange={(e) => setEditEnforceSso(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] focus:ring-white/20"
                />
                <span className="text-sm text-[var(--text)]">
                  Enforce company SSO for this organisation
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={updateOrganisation}
                disabled={savingOrg || !editName.trim() || !editId}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingOrg ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
