"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { useApiQuery } from "@/lib/hooks/use-api";

interface CompanyRow {
  id: string;
  name: string;
  plan: string;
  domain: string | null;
  domain_verified_at: string | null;
  admin_name: string | null;
  admin_email: string | null;
  created_at: string;
  user_count: number;
}

export default function AdminCompaniesPage() {
  const { data: access } = useApiQuery<{ is_platform_admin: boolean }>("/api/platform/access");
  const { data } = useApiQuery<{ companies: CompanyRow[] }>(
    access?.is_platform_admin ? "/api/platform/companies" : null,
  );

  if (!access?.is_platform_admin) {
    return (
      <>
        <PageHeader title="Companies" subtitle="Platform admin only" />
        <div className="card-lifted rounded-xl p-4 text-sm text-white/60">
          You do not have platform admin access.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Companies" subtitle="Read-only platform company list" />
      <div className="card-lifted overflow-x-auto rounded-xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--bg-elevated)]/70 text-xs uppercase tracking-wide text-white/60">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Verified</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Admin</th>
              <th className="px-3 py-2">Admin email</th>
              <th className="px-3 py-2">Users</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {(data?.companies ?? []).map((row) => (
              <tr key={row.id} className="card-lifted-hover border-t border-[var(--border)]/70">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.domain ?? "—"}</td>
                <td className="px-3 py-2">{row.domain_verified_at ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{row.plan}</td>
                <td className="px-3 py-2">{row.admin_name ?? "—"}</td>
                <td className="px-3 py-2">{row.admin_email ?? "—"}</td>
                <td className="px-3 py-2">{row.user_count}</td>
                <td className="px-3 py-2">
                  {new Date(row.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
