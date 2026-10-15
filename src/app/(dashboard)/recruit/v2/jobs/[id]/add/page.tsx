"use client";

import { useState } from "react";
import { CompanyBulkUploadModal } from "@/app/(dashboard)/recruit/candidates/components/CompanyBulkUploadModal";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useIdealProfileGate } from "@/app/(dashboard)/recruit/jobs/[id]/hooks/useIdealProfileGate";
import { SeatGate } from "../../../SeatGate";

/**
 * Add candidates — job-scoped, with every intake route in one place.
 *
 * The dashboard button used to dump the recruiter on the global candidates
 * page, which lost the job context entirely. Upload itself still runs through
 * the existing bulk-upload surface; what this page adds is the job context and
 * the honest picture of what happens after a CV lands, including the screening
 * gate that is invisible today.
 */
function RecruitV2AddCandidatesPageBody() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useApiQuery<{
    job: { title?: string; status?: string; list_on_public_job_board?: boolean | null };
    orgSlug?: string | null;
  }>(id ? `/api/jobs/${id}` : null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const gate = useIdealProfileGate(id);
  if (!id) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const applyUrl = data?.orgSlug ? `${origin}/apply/${data.orgSlug}?job=${id}` : null;

  return (
    <section>
      <CompanyBulkUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        initialJobId={id}
        jobsLoading={loading}
        jobs={
          data?.job ? [{ id, title: data.job.title ?? "This job", status: data.job.status }] : []
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Add candidates</h1>
          <p className="text-sm text-white/55">{data?.job?.title ?? ""}</p>
        </div>
        <Link
          href={`/recruit/jobs/${id}`}
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Job
        </Link>
      </div>

      {!gate.loading && !gate.canScore ? (
        <div className="mb-4 rounded-xl border border-red-400/40 bg-red-500/[0.06] p-4">
          <p className="text-sm font-semibold text-[var(--text)]">
            Scoring isn&apos;t set up for this job yet
          </p>
          <p className="mt-1 text-xs text-white/60">
            CVs you add now are scored on the generic path, not this role&apos;s rubric. Approve the
            rubric first and everything added afterwards is scored properly.
          </p>
          <Link
            href={`/recruit/jobs/${id}#ideal-profile-setup`}
            className="mt-3 inline-block rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black"
          >
            Set up scoring
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Upload CVs</h2>
          <p className="mb-3 mt-1 text-xs text-white/55">
            PDF or DOCX, in bulk. Parsed, deduplicated, screened on WhatsApp, then scored.
          </p>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-block rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
          >
            Upload for this job
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Let candidates come to you</h2>
          <ul className="mt-2 space-y-2 text-xs text-white/65">
            <li>
              <span className="font-semibold text-[var(--text)]">Apply link</span>
              <span className="mt-0.5 block break-all font-mono text-[11px] text-white/45">
                {applyUrl ??
                  (loading
                    ? "Loading apply link..."
                    : data?.job?.status === "open"
                      ? "Apply link is being prepared"
                      : "Available once the job is published")}
              </span>
            </li>
            <li>
              <Link href={`/recruit/jobs/${id}`} className="hover:text-[var(--text)]">
                <span className="font-semibold text-[var(--text)]">Intake email</span> — forward
                Naukri and portal mail straight in
              </Link>
            </li>
            <li>
              <Link href="/company/settings/job-boards" className="hover:text-[var(--text)]">
                <span className="font-semibold text-[var(--text)]">Job boards</span> — Idibu and
                Google for Jobs
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
        <h2 className="text-sm font-bold text-[var(--text)]">What happens to every CV</h2>
        <ol className="mt-2 space-y-1.5 text-xs text-white/60">
          <li>
            <span className="font-mono text-white/40">1</span> Parsed and checked against existing
            candidates, so duplicates never take a slot.
          </li>
          <li>
            <span className="font-mono text-white/40">2</span> The candidate answers this job&apos;s
            screening questions on WhatsApp — the CV is <span className="text-amber-300">held</span>{" "}
            until they do.
          </li>
          <li>
            <span className="font-mono text-white/40">3</span> Scored against the approved rubric.
          </li>
          <li>
            <span className="font-mono text-white/40">4</span> Appears in{" "}
            <Link href={`/recruit/v2/jobs/${id}/review`} className="text-[var(--accent)]">
              Application Review
            </Link>{" "}
            — nothing sits unscored without saying so.
          </li>
        </ol>
      </div>
    </section>
  );
}

export default function RecruitV2AddCandidatesPage() {
  return (
    <SeatGate need="reviewApplications" what="Bulk intake for this job">
      <RecruitV2AddCandidatesPageBody />
    </SeatGate>
  );
}
