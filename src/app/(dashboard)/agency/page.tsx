"use client";

import Link from "next/link";
import {
  Building2,
  Briefcase,
  Users,
  FileText,
  GitPullRequest,
  TrendingUp,
  Upload,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import type { JobPosting } from "@/types";

function safeMapJobs(rows: unknown[]): JobPosting[] {
  const out: JobPosting[] = [];
  for (const row of rows) {
    try {
      if (row && typeof row === "object" && "id" in row) {
        out.push(mapDbJobToPosting(row as Record<string, unknown>));
      }
    } catch {
      // Skip malformed job rows
    }
  }
  return out;
}

export default function AgencyOverviewPage() {
  const { data: orgsData, loading: oLoading } = useApiQuery<{
    organisations?: Record<string, unknown>[];
  }>("/api/organisations");
  const { data: jobsData, loading: jLoading } = useApiQuery<{
    jobs?: Record<string, unknown>[];
    pagination?: { total: number };
  }>("/api/jobs", { status: "open" });
  const { data: pipelineData, loading: pLoading } = useApiQuery<{
    pipeline: { status: string; agency_stage: string | null; overallScore: number | null }[];
  }>("/api/my-pipeline");

  const loading = oLoading || jLoading || pLoading;
  const allClients = Array.isArray(orgsData?.organisations) ? orgsData.organisations : [];
  // Only render clients with a stable string id so we can use id as key (no index fallback).
  const clients = allClients.filter((org): org is Record<string, unknown> & { id: string } =>
    Boolean(org && typeof org === "object" && typeof org.id === "string" && org.id.trim() !== ""),
  );
  const jobs = Array.isArray(jobsData?.jobs) ? safeMapJobs(jobsData.jobs) : [];
  const totalMatched = jobs.reduce((sum, j) => sum + (j.matchedCandidatesCount ?? 0), 0);

  const pipelineEntries = pipelineData?.pipeline ?? [];
  const positionsHired = pipelineEntries.filter(
    (p) => p.status === "hired" || p.agency_stage === "joined",
  ).length;
  const inPipeline = pipelineEntries.length;
  const avgScore =
    pipelineEntries.filter((p) => p.overallScore != null).length > 0
      ? Math.round(
          pipelineEntries
            .filter((p) => p.overallScore != null)
            .reduce((sum, p) => sum + (p.overallScore ?? 0), 0) /
            pipelineEntries.filter((p) => p.overallScore != null).length,
        )
      : 0;
  const offerStage = pipelineEntries.filter((p) => p.agency_stage === "offer").length;

  return (
    <>
      <PageHeader
        title="Agency Dashboard"
        subtitle="Overview of your client portfolio and pipeline"
      />
      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card-lifted p-5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-3 h-8 w-16" />
              </div>
            ))}
          </div>
          <div className="card-lifted p-5">
            <Skeleton className="h-4 w-28" />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-white/10 p-4">
                  <Skeleton className="mx-auto h-10 w-10 rounded-xl" />
                  <Skeleton className="mx-auto mt-3 h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Client Companies"
              value={clients.length}
              icon={<Building2 size={20} />}
            />
            <StatCard label="Active JDs" value={jobs.length} icon={<Briefcase size={20} />} />
            <StatCard
              label="In Pipeline"
              value={inPipeline.toLocaleString()}
              icon={<GitPullRequest size={20} />}
            />
            <StatCard
              label="Positions Closed"
              value={positionsHired.toLocaleString()}
              icon={<CheckCircle2 size={20} />}
            />
            <StatCard
              label="Avg Score"
              value={avgScore > 0 ? `${avgScore}` : "—"}
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              label="In Offer Stage"
              value={offerStage.toLocaleString()}
              icon={<Clock size={20} />}
            />
          </div>

          <div className="card-lifted mb-6 p-5">
            <h2 className="heading-section mb-3 text-lg text-[var(--text)]">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Link
                href="/agency/jobs"
                className="card-lifted-hover flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10">
                  <FileText size={20} className="text-[var(--accent)]" />
                </div>
                <span className="text-xs font-medium text-[var(--text)]">Client Jobs</span>
              </Link>
              <Link
                href="/agency/pipeline"
                className="card-lifted-hover flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                  <GitPullRequest size={20} className="text-purple-400" />
                </div>
                <span className="text-xs font-medium text-[var(--text)]">Pipeline</span>
              </Link>
              <Link
                href="/agency/jobs"
                className="card-lifted-hover flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                  <Upload size={20} className="text-blue-400" />
                </div>
                <span className="text-xs font-medium text-[var(--text)]">Submit Candidates</span>
              </Link>
              <Link
                href="/agency/clients"
                className="card-lifted-hover flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Users size={20} className="text-emerald-400" />
                </div>
                <span className="text-xs font-medium text-[var(--text)]">Clients</span>
              </Link>
            </div>
          </div>

          <section className="mt-8">
            <h2 className="heading-section mb-4 text-lg text-[var(--text)]">Your Clients</h2>
            {clients.length === 0 ? (
              <p className="text-body text-sm text-white/60">No clients yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {clients.map((org) => (
                  <div key={org.id} className="card-lifted-hover flex flex-col gap-3 p-6">
                    <h3 className="heading-card text-lg text-[var(--text)]">
                      {(org?.name as string) ?? "Unnamed"}
                    </h3>
                    <p className="text-body text-sm text-white/60">
                      {(org?.type as string) ?? "Company"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
