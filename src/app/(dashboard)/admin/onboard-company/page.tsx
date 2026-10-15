"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useApiQuery } from "@/lib/hooks/use-api";

type Plan = "starter" | "pro" | "enterprise";

export default function AdminOnboardCompanyPage() {
  const { data: access } = useApiQuery<{ is_platform_admin: boolean }>("/api/platform/access");
  const [form, setForm] = useState({
    company_name: "",
    primary_domain: "",
    plan: "starter" as Plan,
    admin_email: "",
    admin_first_name: "",
    admin_last_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/platform/companies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Failed to onboard company");
        return;
      }
      setSuccess(`Company created. Welcome email sent to ${form.admin_email}.`);
      setForm({
        company_name: "",
        primary_domain: "",
        plan: "starter",
        admin_email: "",
        admin_first_name: "",
        admin_last_name: "",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!access?.is_platform_admin) {
    return (
      <>
        <PageHeader title="Onboard Company" subtitle="Platform admin only" />
        <div className="card-lifted rounded-xl p-4 text-sm text-white/60">
          You do not have platform admin access.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Onboard Company" subtitle="Create a company and invite its first admin" />
      <div className="card-lifted max-w-2xl space-y-4 rounded-xl p-5">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-400">{success}</p> : null}
        {(
          [
            ["Company name", "company_name"],
            ["Primary domain", "primary_domain"],
            ["Admin email", "admin_email"],
            ["Admin first name", "admin_first_name"],
            ["Admin last name", "admin_last_name"],
          ] as const
        ).map(([label, key]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-sm text-white/60">{label}</span>
            <input
              value={form[key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-sm text-white/60">Plan</span>
          <select
            value={form.plan}
            onChange={(e) => setForm((prev) => ({ ...prev, plan: e.target.value as Plan }))}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          >
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create company"}
        </button>
      </div>
    </>
  );
}
