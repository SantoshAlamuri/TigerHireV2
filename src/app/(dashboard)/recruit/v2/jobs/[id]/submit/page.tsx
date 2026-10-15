"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { capabilitiesFor } from "@/lib/v2/seat-capabilities";

/**
 * Submit candidates — the agency's side of the job, with the rules printed.
 *
 * Every rule an agency normally learns by being burned is stated here:
 * the duplicate check, the ownership window, how many slots are left, and the
 * held state. That last one matters most — uploads genuinely wait for the
 * candidate to answer the client's screening questions on WhatsApp, and today
 * that is invisible, so agencies email the recruiter asking why nothing moved.
 * Named as a status they can act on, it becomes their job to chase, which it
 * is: it is their relationship with the candidate.
 *
 * Gated in the page, not only by route policy. This tree is reachable by the
 * agency seat, so every screen in it has to decide for itself what an external
 * partner may see.
 */
export default function AgencySubmitPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);
  const { data } = useApiQuery<{ job: { title?: string } }>(id ? `/api/jobs/${id}` : null);
  // An agency sees only its own submissions against this job; the count is what
  // makes the slot figure true rather than decorative.
  const { data: mine } = useApiQuery<{ applications: Array<{ id: string }> }>(
    id ? "/api/applications" : null,
    id ? { jobId: id, limit: 100 } : undefined,
  );

  if (!id) return null;

  if (!caps.submitCandidates) {
    return (
      <section className="max-w-2xl">
        <h1 className="text-xl font-bold text-[var(--text)]">Not your seat</h1>
        <p className="mt-2 text-sm text-white/60">
          Submitting candidates to this job is done by the agency partners assigned to it, or by the
          recruiter working it.
        </p>
      </section>
    );
  }

  const submitted = mine?.applications?.length ?? 0;

  const steps = [
    {
      n: 1,
      title: "Parse & duplicate check",
      body: "Checked against the client's existing candidates. Duplicates are flagged to you immediately — no wasted slot, and no ownership dispute later. Ownership runs 30 days from a clean submission.",
    },
    {
      n: 2,
      title: "Candidate answers screening on WhatsApp",
      body: "The client's questions go to the candidate directly. The CV is held until they answer, so a submission sitting still is usually a candidate who has not replied — yours to chase, because it is your relationship.",
    },
    {
      n: 3,
      title: "Scored against the client's rubric",
      body: "The same bar as every other source. Agency CVs get no penalty and no favour.",
    },
    {
      n: 4,
      title: "Appears in your submissions with live status",
      body: "In review → interview → offer, or closed with a reason category. You see movement when it happens, not when someone remembers to email you.",
    },
  ];

  return (
    <section className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Submit candidates</h1>
          <p className="text-sm text-white/55">
            {data?.job?.title ?? "This role"}
            {submitted > 0 ? ` · ${submitted} submitted by you` : ""}
          </p>
        </div>
        <Link
          href="/agency/jobs"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Client jobs
        </Link>
      </div>

      <Link
        href={`/agency/pipeline?upload=1&jobId=${encodeURIComponent(id)}`}
        className="mb-5 block rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/40 px-4 py-8 text-center transition hover:border-[var(--accent)]/50"
      >
        <span className="block text-sm font-semibold text-[var(--text)]">
          Upload CVs — up to 10 per batch
        </span>
        <span className="mt-1 block text-xs text-white/45">
          PDF / DOCX · parsed automatically · scanned CVs are fine
        </span>
      </Link>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
        What happens to each CV — visible, not a black box
      </h2>
      <ol className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 border-b border-white/5 px-4 py-3 last:border-b-0">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] font-mono text-xs text-white/50">
              {s.n}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--text)]">{s.title}</span>
              <span className="block text-xs leading-relaxed text-white/50">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
