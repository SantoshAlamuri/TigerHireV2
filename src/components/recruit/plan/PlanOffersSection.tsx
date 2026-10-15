"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PlanJobOfferRow } from "@/lib/recruitment-plan/list-job-plan-offers";
import type { StatusTone } from "@/lib/status-tones";

function offerTone(status: string): StatusTone {
  if (status === "sent" || status === "accepted") return "success";
  if (status === "rejected" || status === "withdrawn") return "danger";
  if (status === "draft") return "neutral";
  return "info";
}

export function PlanOffersSection({ jobId }: { jobId: string }) {
  const { data, loading, error } = useApiQuery<{ offers: PlanJobOfferRow[] }>(
    `/api/jobs/${jobId}/plan/offers`,
  );

  const offers = data?.offers ?? [];
  const tasksHref = `/tasks?jobId=${encodeURIComponent(jobId)}&shape=decide&category=approvals`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="heading-section text-lg font-semibold text-[var(--text)]">
          Offers on this role
        </h2>
        <Link href={tasksHref} className="text-xs font-medium text-[var(--accent)] hover:underline">
          Offer approvals in Tasks →
        </Link>
      </div>
      <p className="mb-3 text-xs text-white/50">
        Draft and send stay human actions. Finance and HM approve in Tasks before send.
      </p>

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-white/55">
          No offers yet. Move a candidate to the offer stage in{" "}
          <Link
            href={`/recruit/pipeline?jobId=${encodeURIComponent(jobId)}`}
            className="font-medium text-[var(--accent)] hover:underline"
          >
            pipeline
          </Link>
          , then use stage setup below to draft.
        </p>
      ) : (
        <ul className="card-lifted divide-y divide-[var(--border)]">
          {offers.map((offer) => (
            <li
              key={offer.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)]">
                  {offer.candidate_name}
                  <span className="font-normal text-white/45"> · {offer.role_title}</span>
                </p>
                <p className="mt-0.5 text-xs text-white/50">
                  {offer.sent_at
                    ? `Sent ${new Date(offer.sent_at).toLocaleDateString()}`
                    : `Updated ${new Date(offer.updated_at).toLocaleDateString()}`}
                  {offer.band_status ? ` · Band ${offer.band_status.replace(/_/g, " ")}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge tone={offerTone(offer.status)} size="sm">
                  {offer.status.replace(/_/g, " ")}
                </StatusBadge>
                <Link
                  href={`/recruit/offers/draft?applicationId=${encodeURIComponent(offer.application_id)}`}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-black hover:bg-[var(--accent-hover)]"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  {offer.sent_at ? "View" : "Draft"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
