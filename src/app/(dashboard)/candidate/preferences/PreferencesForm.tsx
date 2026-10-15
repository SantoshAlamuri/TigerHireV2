"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Save, ArrowLeft, MapPin, Briefcase, IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import type { CandidateJobPreferences } from "@/lib/preferences/types";
import type { RoleFunction, SeniorityLevel } from "@/types";

const REMOTE_OPTIONS: { value: "remote" | "hybrid" | "onsite" | "any"; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "remote", label: "Remote only" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site only" },
];

const ROLE_FUNCTIONS: RoleFunction[] = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "HR",
  "Finance",
  "Operations",
  "Marketing",
];

const SENIORITY_LEVELS: SeniorityLevel[] = [
  "Intern",
  "Junior",
  "Mid",
  "Senior",
  "Lead",
  "Manager",
  "Director",
  "VP",
  "C-Suite",
];

function toggleArray<T extends string>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

export function CandidatePreferencesForm({ embedded = false }: { embedded?: boolean }) {
  const { data, loading, error, refetch } = useApiQuery<{
    preferences: CandidateJobPreferences | null;
  }>("/api/candidates/me/preferences");
  const {
    mutate: patchPreferences,
    loading: saving,
    error: saveError,
  } = useOptimisticMutation<
    { preferences?: CandidateJobPreferences },
    Partial<CandidateJobPreferences>
  >("/api/candidates/me/preferences", {
    method: "PATCH",
  });

  const [locations, setLocations] = useState<string>("");
  const [remotePreference, setRemotePreference] = useState<"remote" | "hybrid" | "onsite" | "any">(
    "any",
  );
  const [seniority, setSeniority] = useState<string[]>([]);
  const [roleFunctions, setRoleFunctions] = useState<string[]>([]);
  const [salaryMinLpa, setSalaryMinLpa] = useState<string>("");
  const [salaryMaxLpa, setSalaryMaxLpa] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Hydrate the form from saved preferences exactly once. Without this the form
  // loads blank for returning candidates, and saving PATCHes empty values —
  // silently wiping what they'd stored. One-time so it never clobbers edits in
  // progress (or re-blanks after the post-save refetch).
  const prefs = data?.preferences;
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !data) return;
    hydrated.current = true;
    if (!prefs) return;
    setLocations((prefs.preferred_locations ?? []).join(", "));
    setRemotePreference(prefs.remote_preference ?? "any");
    setSeniority(prefs.preferred_seniority ?? []);
    setRoleFunctions(prefs.preferred_role_functions ?? []);
    setSalaryMinLpa(prefs.salary_min_lpa != null ? String(prefs.salary_min_lpa) : "");
    setSalaryMaxLpa(prefs.salary_max_lpa != null ? String(prefs.salary_max_lpa) : "");
  }, [data, prefs]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(false);
    const payload: Partial<CandidateJobPreferences> = {
      preferred_locations: locations
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      remote_preference: remotePreference,
      preferred_seniority: seniority,
      preferred_role_functions: roleFunctions,
      salary_min_lpa: salaryMinLpa ? Number(salaryMinLpa) : null,
      salary_max_lpa: salaryMaxLpa ? Number(salaryMaxLpa) : null,
    };
    const result = await patchPreferences(payload);
    if (result) {
      setDirty(false);
      setSuccess(true);
      await refetch();
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  return (
    <>
      {!embedded && (
        <PageHeader
          title="Job preferences"
          actions={
            <Link
              href="/candidate"
              className="flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white"
            >
              <ArrowLeft size={16} />
              Back
            </Link>
          }
        />
      )}
      {loading ? (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="border-b border-white/10 py-6">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
          <div className="border-b border-white/10 py-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
          <div className="border-b border-white/10 py-6">
            <Skeleton className="h-4 w-32" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          onChangeCapture={() => {
            setDirty(true);
            setSuccess(false);
          }}
          className={embedded ? "space-y-6" : "mx-auto max-w-2xl space-y-6"}
        >
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 py-4 text-sm text-red-400"
            >
              <span>Could not load your preferences. Your saved choices have not changed.</span>
              <button type="button" onClick={() => void refetch()} className="underline">
                Retry
              </button>
            </div>
          )}
          <fieldset disabled={saving || Boolean(error)} className="min-w-0 space-y-6">
            {success && (
              <div
                role="status"
                className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400"
              >
                Preferences saved.
              </div>
            )}

            <div className="border-b border-white/10 py-6">
              <label
                htmlFor="preferred-locations"
                className="mb-2 flex items-center gap-2 text-sm font-normal text-white/65"
              >
                <MapPin size={16} className="text-white/55" />
                Preferred locations
              </label>
              <input
                id="preferred-locations"
                type="text"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="e.g. Bangalore, Mumbai, Remote"
                className="text-body w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
              />
            </div>

            <div className="border-b border-white/10 pb-6">
              <label
                htmlFor="preferred-work-mode"
                className="mb-2 block text-sm font-normal text-white/65"
              >
                Work mode
              </label>
              <select
                id="preferred-work-mode"
                value={remotePreference}
                onChange={(e) =>
                  setRemotePreference(e.target.value as "remote" | "hybrid" | "onsite" | "any")
                }
                className="text-body w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
              >
                {REMOTE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="border-b border-white/10 pb-6">
              <legend className="mb-3 flex items-center gap-2 text-sm font-normal text-white/65">
                <Briefcase size={16} className="text-white/55" />
                Role functions
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ROLE_FUNCTIONS.map((rf) => (
                  <label key={rf} className="flex items-center gap-2 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={roleFunctions.includes(rf)}
                      onChange={() => setRoleFunctions((prev) => toggleArray(prev, rf))}
                    />
                    {rf}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="border-b border-white/10 pb-6">
              <legend className="mb-3 block text-sm font-normal text-white/65">
                Seniority levels
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {SENIORITY_LEVELS.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={seniority.includes(s)}
                      onChange={() => setSeniority((prev) => toggleArray(prev, s))}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="border-b border-white/10 pb-6">
              <legend className="mb-2 flex items-center gap-2 text-sm font-normal text-white/65">
                <IndianRupee size={16} className="text-white/55" />
                Salary range (LPA)
              </legend>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  aria-label="Minimum salary in LPA"
                  type="number"
                  min={0}
                  max={10000}
                  step={0.1}
                  value={salaryMinLpa}
                  onChange={(e) => setSalaryMinLpa(e.target.value)}
                  placeholder="Min"
                  className="text-body w-24 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                />
                <span className="text-white/65">–</span>
                <input
                  aria-label="Maximum salary in LPA"
                  type="number"
                  min={salaryMinLpa ? Number(salaryMinLpa) : 0}
                  max={10000}
                  step={0.1}
                  value={salaryMaxLpa}
                  onChange={(e) => setSalaryMaxLpa(e.target.value)}
                  placeholder="Max"
                  className="text-body w-24 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                />
                <span className="text-body text-xs text-white/65">LPA</span>
              </div>
            </fieldset>

            {saveError && (
              <p role="alert" className="text-sm text-rose-300">
                {saveError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !dirty || Boolean(error)}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save preferences
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </>
  );
}
