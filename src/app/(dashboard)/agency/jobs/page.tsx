"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Briefcase, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import JobsTable from "@/components/dashboard/JobsTable";
import { PostJobForm } from "@/components/dashboard/PostJobForm";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import { AMBER_OUTLINE_ACTION_CLASS, filterPillClass } from "@/components/ui/filter-pill";

type TabFilter = "active" | "closed";

const TABS: { key: TabFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
];

export default function AgencyJobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read search params and store in state to prevent re-renders from useSearchParams
  const [viewState, setViewState] = useState<string | null>(() => searchParams.get("view"));
  const [clientIdState, setClientIdState] = useState<string>(
    () => searchParams.get("clientId") ?? "",
  );

  // Update state only when searchParams actually change (not on every render)
  useEffect(() => {
    const view = searchParams.get("view");
    const clientId = searchParams.get("clientId") ?? "";
    setViewState((prev) => (prev !== view ? view : prev));
    setClientIdState((prev) => (prev !== clientId ? clientId : prev));
  }, [searchParams]);

  const isCreateView = viewState === "create";

  const [tab, setTab] = useState<TabFilter>("active");

  // Use tab state directly when not in create view
  const currentTab = isCreateView ? "active" : tab;

  const statusParam = currentTab === "active" ? "open" : "closed";
  const { data, loading, error, refetch } = useApiQuery<{
    jobs: Record<string, unknown>[];
    pagination: { total: number };
  }>("/api/jobs", statusParam ? { status: statusParam } : undefined);

  const jobs = data?.jobs?.map(mapDbJobToPosting) ?? [];

  function goToList() {
    // Use replace to avoid navigation stack issues
    router.replace("/agency/jobs");
  }

  function goToCreate(preselectedClientId?: string) {
    const params = new URLSearchParams({ view: "create" });
    if (preselectedClientId) params.set("clientId", preselectedClientId);
    // Use replace instead of push to avoid adding to history stack
    router.replace(`/agency/jobs?${params.toString()}`);
  }

  return (
    <>
      <PageHeader
        title={isCreateView ? "New client JD" : "Client roles"}
        subtitle={
          isCreateView
            ? "Create a job description for a client company"
            : "Client roles open for submissions. Pick a job, then add candidates for that role."
        }
        actions={
          isCreateView ? (
            <button type="button" onClick={goToList} className={filterPillClass(false)}>
              <ArrowLeft size={16} />
              Jobs
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToCreate()}
              className={AMBER_OUTLINE_ACTION_CLASS}
            >
              <Plus size={16} />
              New client JD
            </button>
          )
        }
      />

      {isCreateView ? (
        <PostJobForm
          initialClientId={clientIdState}
          onBack={goToList}
          onSuccess={() => refetch()}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" aria-label="Job status filter">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={filterPillClass(currentTab === t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-white/50">
              {data?.pagination?.total ?? jobs.length} {jobs.length === 1 ? "job" : "jobs"}
            </p>
          </div>

          {loading ? (
            <div className="card-lifted rounded-xl p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 border-b border-[var(--border)]/50 py-3 last:border-0"
                >
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="ml-auto h-4 w-16" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="card-lifted rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
              {error}
            </div>
          ) : jobs.length === 0 ? (
            <div className="card-lifted flex flex-col items-center justify-center py-16">
              <Briefcase size={40} className="text-white/60" />
              <p className="text-body mt-4 text-white/60">
                {currentTab === "closed"
                  ? "No closed client roles"
                  : "No client roles are open for submissions"}
              </p>
              {currentTab !== "closed" && (
                <button
                  type="button"
                  onClick={() => goToCreate()}
                  className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Create a client JD
                </button>
              )}
            </div>
          ) : (
            <JobsTable
              jobs={jobs}
              showClient
              onRowClick={(id) => router.push(`/agency/jobs/${id}`)}
            />
          )}
        </>
      )}
    </>
  );
}
