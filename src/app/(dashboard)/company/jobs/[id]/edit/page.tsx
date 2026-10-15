"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  RequisitionThreadBanner,
  hiringRequestFromJobRow,
} from "@/components/dashboard/RequisitionThreadBanner";
import {
  JobReferralBonusFormFields,
  buildReferralConfigPayload,
  type JobReferralBonusDefaults,
} from "@/components/dashboard/JobReferralBonusFormFields";
import { JobListingVisibilityFields } from "@/components/dashboard/JobListingVisibilityFields";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import { DESCRIPTION_MAX_WORDS_EXPORT as MAX_DESCRIPTION_WORDS } from "@/lib/validations/jobs";
import {
  applicationsCloseAtFromForm,
  isoToDatetimeLocalValue,
} from "@/lib/jobs/applications-close-at-form";

function countWords(s: string | null | undefined): number {
  if (!s || typeof s !== "string") return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function referralRowToDefaults(row: Record<string, unknown> | null): JobReferralBonusDefaults {
  if (!row) return null;
  const t = row.bonus_trigger;
  const bonus_trigger = t === "shortlisted" || t === "day_90" ? t : "offer_accepted";
  return {
    direct_bonus_amount: Number(row.direct_bonus_amount ?? 0),
    parent_bonus_amount: Number(row.parent_bonus_amount ?? 0),
    candidate_referrer_bonus_amount: Number(row.candidate_referrer_bonus_amount ?? 0),
    vouch_bonus_amount: Number(row.vouch_bonus_amount ?? 0),
    bonus_trigger,
    candidate_referrer_enabled: Boolean(row.candidate_referrer_enabled),
    bonus_notes: typeof row.bonus_notes === "string" ? row.bonus_notes : null,
  };
}

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30";
const labelClass = "mb-1.5 block text-sm font-medium text-white/60";

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [descriptionWordCount, setDescriptionWordCount] = useState(0);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [referralEnabled, setReferralEnabled] = useState(false);
  const [referralConfigError, setReferralConfigError] = useState<string | null>(null);

  const {
    data: jobData,
    loading: loadingJob,
    error: jobError,
  } = useApiQuery<{ job: Record<string, unknown> }>(id ? `/api/jobs/${id}` : null);

  const {
    data: referralWrap,
    loading: referralConfigLoading,
    error: referralQueryError,
  } = useApiQuery<{ config: Record<string, unknown> | null }>(
    id ? `/api/jobs/${id}/referral-config` : null,
  );

  const { data: membersData } = useApiQuery<{
    members: { id: string; full_name: string; role: string }[];
  }>("/api/organisations/members");
  const hiringManagers = (membersData?.members ?? []).filter((m) => m.role === "hiring_manager");

  const {
    mutate: updateJob,
    loading: updating,
    error: updateError,
  } = useOptimisticMutation<
    { job: unknown },
    {
      title?: string;
      description?: string;
      location?: string;
      status?: string;
      compensationMin?: number;
      compensationMax?: number;
      hiringManagerId?: string | null;
      listOnPublicJobBoard?: boolean;
      listForInternalReferrals?: boolean;
      applicationsCloseAt?: string | null;
    }
  >(id ? `/api/jobs/${id}` : "", { method: "PATCH" });

  useEffect(() => setMounted(true), []);

  const jobRaw = jobData?.job;
  const jdTextRaw = (jobRaw?.description as string) ?? "";
  const referralRow = referralWrap?.config ?? null;
  useEffect(() => {
    setDescriptionWordCount(countWords(jdTextRaw));
  }, [jdTextRaw]);

  useEffect(() => {
    if (referralConfigLoading) return;
    setReferralEnabled(!!referralRow);
  }, [referralConfigLoading, referralRow]);

  if (!mounted || loadingJob) {
    return (
      <div className="alive-air space-y-6">
        <PageHeader title="Loading..." />
        <div className="card-lifted p-6">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="mt-3 h-3 w-1/2" />
          <Skeleton className="mt-5 h-56 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (jobError || !jobRaw) {
    return (
      <div className="alive-air space-y-6">
        <PageHeader title="Job Not Found" />
        <div className="card-lifted flex flex-col items-center justify-center py-20">
          <p className="text-body text-white/60">No job posting found for this ID.</p>
          <button
            type="button"
            onClick={() => router.push("/company/jobs")}
            className="mt-4 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  const jobRecord = jobRaw;
  const job = mapDbJobToPosting(jobRecord);
  const status = (jobRecord.status as string) ?? "open";
  const currentHiringManagerId = (jobRecord.hiring_manager_id as string) ?? "";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = form.get("title") as string;
    const description = form.get("description") as string;
    const location = form.get("location") as string;
    const statusValue = form.get("status") as string;
    const compensationMin = Number(form.get("compensationMin"));
    const compensationMax = Number(form.get("compensationMax"));

    const hiringManagerIdValue = form.get("hiringManagerId") as string;
    const hadAppClose = Boolean(jobRecord.applications_close_at);
    const applicationsCloseAt = applicationsCloseAtFromForm(
      form,
      "applicationsCloseAt",
      hadAppClose,
    );
    const result = await updateJob({
      title: title || undefined,
      description: description || undefined,
      location: location || undefined,
      status: statusValue || undefined,
      compensationMin: Number.isFinite(compensationMin) ? compensationMin : undefined,
      compensationMax: Number.isFinite(compensationMax) ? compensationMax : undefined,
      hiringManagerId: hiringManagerIdValue || null,
      listOnPublicJobBoard: form.get("listOnPublicJobBoard") === "on",
      listForInternalReferrals: form.get("listForInternalReferrals") === "on",
      ...(applicationsCloseAt !== undefined ? { applicationsCloseAt } : {}),
    });

    if (!result) return;

    setReferralConfigError(null);
    const refPayload = buildReferralConfigPayload(form, referralEnabled);
    const refRes = await fetch(`/api/jobs/${id}/referral-config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(refPayload),
    });
    if (!refRes.ok) {
      if (refRes.status === 403) {
        // Job saved; user role may not manage referral config
      } else {
        const j = (await refRes.json().catch(() => ({}))) as { error?: string };
        setReferralConfigError(j.error ?? "Failed to save referral bonus settings.");
        return;
      }
    }

    router.push(`/company/jobs/${id}`);
  }

  return (
    <div className="alive-air space-y-6">
      <PageHeader title="Edit Job" subtitle={job.titleNormalised} />
      {id && jobRaw ? (
        <RequisitionThreadBanner
          dashboardPrefix="/company"
          activeStep="role"
          hiringRequest={hiringRequestFromJobRow(jobRaw)}
          jobId={id}
        />
      ) : null}
      <form onSubmit={handleSubmit} className="card-lifted p-6 md:p-8">
        <div className="grid gap-5">
          <div>
            <label htmlFor="title" className={labelClass}>
              Job Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. Senior Backend Engineer"
              className={inputClass}
              defaultValue={job.titleNormalised}
            />
          </div>

          <div>
            <label htmlFor="location" className={labelClass}>
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              placeholder="e.g. Bengaluru"
              className={inputClass}
              defaultValue={job.location}
            />
          </div>

          <div>
            <label htmlFor="status" className={labelClass}>
              Status
            </label>
            <select id="status" name="status" className={inputClass} defaultValue={status}>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {hiringManagers.length > 0 && (
            <div>
              <label htmlFor="hiringManagerId" className={labelClass}>
                Hiring Manager
              </label>
              <select
                id="hiringManagerId"
                name="hiringManagerId"
                className={inputClass}
                defaultValue={currentHiringManagerId}
              >
                <option value="">None</option>
                {hiringManagers.map((hm) => (
                  <option key={hm.id} value={hm.id}>
                    {hm.full_name || hm.id}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-white/60">They see this JD and metrics in My JDs.</p>
            </div>
          )}

          <JobListingVisibilityFields
            mode="formDefaults"
            listOnPublicJobBoard={
              (jobRecord.list_on_public_job_board as boolean | undefined) !== false
            }
            listForInternalReferrals={
              (jobRecord.list_for_internal_referrals as boolean | undefined) !== false
            }
          />

          <div>
            <label htmlFor="applicationsCloseAt" className={labelClass}>
              Application deadline (optional)
            </label>
            <input
              id="applicationsCloseAt"
              name="applicationsCloseAt"
              type="datetime-local"
              className={inputClass}
              defaultValue={isoToDatetimeLocalValue(
                jobRecord.applications_close_at as string | undefined,
              )}
            />
            <p className="mt-1 text-xs text-white/60">
              Existing applicants receive in-app reminders about 7 days and 24 hours before this
              time. Clear the field to remove the deadline.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="compensationMin" className={labelClass}>
                Salary Min (₹)
              </label>
              <input
                id="compensationMin"
                name="compensationMin"
                type="number"
                min={0}
                step={100000}
                placeholder="e.g. 1500000"
                className={inputClass}
                defaultValue={job.salaryMin || ""}
              />
            </div>
            <div>
              <label htmlFor="compensationMax" className={labelClass}>
                Salary Max (₹)
              </label>
              <input
                id="compensationMax"
                name="compensationMax"
                type="number"
                min={0}
                step={100000}
                placeholder="e.g. 2500000"
                className={inputClass}
                defaultValue={job.salaryMax || ""}
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className={labelClass}>
              Job Description
            </label>
            <textarea
              ref={descriptionRef}
              id="description"
              name="description"
              required
              minLength={50}
              rows={8}
              placeholder="Describe the role, responsibilities, requirements, and what you offer. Up to 9,000 words."
              className={`${inputClass} resize-y`}
              defaultValue={job.jdTextRaw}
              onInput={() => setDescriptionWordCount(countWords(descriptionRef.current?.value))}
            />
            <p className="mt-1.5 text-xs text-white/60">
              {descriptionWordCount.toLocaleString()} / {MAX_DESCRIPTION_WORDS.toLocaleString()}{" "}
              words max. Include required and preferred skills, responsibilities, and benefits.
            </p>
          </div>

          {referralQueryError ? (
            <p className="text-xs text-white/60">
              Referral bonus settings are not available for your account.
            </p>
          ) : referralConfigLoading ? (
            <p className="text-sm text-white/60">Loading referral settings…</p>
          ) : (
            <JobReferralBonusFormFields
              key={referralRow ? `ref-${referralRow.job_id as string}` : "ref-none"}
              enabled={referralEnabled}
              onEnabledChange={setReferralEnabled}
              defaults={referralRowToDefaults(referralRow)}
              startOpen={!!referralRow}
            />
          )}
        </div>

        {updateError && <p className="mt-4 text-sm text-red-400">{updateError}</p>}
        {referralConfigError && <p className="mt-2 text-sm text-red-400">{referralConfigError}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={updating}
            className="flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updating && <Loader2 size={16} className="animate-spin" />}
            {updating ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/company/jobs/${id}`)}
            className="rounded-md border border-[var(--border)] px-6 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
