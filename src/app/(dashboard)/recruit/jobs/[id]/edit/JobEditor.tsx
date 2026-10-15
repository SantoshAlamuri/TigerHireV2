"use client";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { PublicationReview } from "./PublicationReview";
import { JobReferralBonusFormFields } from "@/components/dashboard/JobReferralBonusFormFields";
import { DESCRIPTION_MAX_WORDS_EXPORT as MAX_DESCRIPTION_WORDS } from "@/lib/validations/jobs";
import { Skeleton } from "@/components/ui/Skeleton";
import { countWords, referralRowToDefaults, inputClass, labelClass } from "./job-editor-fields";
import { useJobEditor } from "./useJobEditor";
import { JobRoleFields } from "./JobRoleFields";

export function JobEditor() {
  const state = useJobEditor();
  const {
    id,
    router,
    formRef,
    previewButton,
    preview,
    setPreview,
    publishError,
    published,
    mounted,
    loadingJob,
    jobError,
    jobRaw,
    jobRecord,
    job,
    status,
    descriptionRef,
    descriptionWordCount,
    setDescriptionWordCount,
    referralQueryError,
    referralConfigLoading,
    referralRow,
    referralEnabled,
    setReferralEnabled,
    updating,
    updateError,
    referralConfigError,
    openPreview,
    publish,
    handleSubmit,
  } = state;
  if (!mounted || loadingJob) {
    return (
      <div className="space-y-4">
        <div className="card-lifted space-y-3 p-6">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="card-lifted space-y-3 p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
    );
  }

  if (jobError || !jobRaw) {
    return (
      <div className="flex flex-col items-center justify-center card-lifted py-20 backdrop-blur-md">
        <p className="text-body text-white/60">No job posting found for this ID.</p>
        <button
          type="button"
          onClick={() => router.push("/recruit/jobs")}
          className="mt-4 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
        >
          Back to Jobs
        </button>
      </div>
    );
  }

  if (published)
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">
          {published.publicApplications ? "Job published" : "Job saved"}
        </h2>
        <p role="status" className="text-sm text-[var(--text-muted)]">
          {published.publicApplications
            ? "Your role is open for public applications."
            : "This role is not publicly available."}
        </p>
        {published.publicApplications && (
          <Link href={`/jobs/${id}`} className="block text-sm font-semibold text-[var(--accent)]">
            View public job
          </Link>
        )}
        <Link
          href={`/recruit/v2/jobs/${id}/add`}
          className="block text-sm font-semibold text-[var(--accent)]"
        >
          Add candidates
        </Link>
        <Link href={`/recruit/jobs/${id}`} className="block text-sm text-[var(--text)]">
          Back to job
        </Link>
      </section>
    );

  return (
    <>
      {preview && (
        <PublicationReview
          form={preview}
          currentStatus={status}
          active={jobRecord.is_active === true}
          showSalary={jobRecord.show_salary === true}
          busy={updating}
          error={updateError || publishError}
          onConfirm={() => void publish()}
          onBack={() => {
            setPreview(null);
            requestAnimationFrame(() => previewButton.current?.focus());
          }}
        />
      )}
      <div hidden={!!preview}>
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-bold text-[var(--text)]">Edit job posting</h2>
          <p className="text-sm text-white/45">{job.titleNormalised}</p>
        </div>
        {/* Nine full-width fields in one column made a short form feel long. They
          are the same nine fields, grouped by what a recruiter is deciding and
          paired where the values are short, so the whole form fits without
          scrolling on a laptop. */}
        <form ref={formRef} onSubmit={handleSubmit} className="pb-24">
          <div className="grid gap-4">
            <JobRoleFields state={state} />

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-4">
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
                <p className="mt-1.5 text-xs text-white/50">
                  {descriptionWordCount.toLocaleString()} / {MAX_DESCRIPTION_WORDS.toLocaleString()}{" "}
                  words. Include required and preferred skills, responsibilities and benefits.
                </p>
              </div>
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
          {referralConfigError && (
            <p className="mt-2 text-sm text-red-400">{referralConfigError}</p>
          )}

          {/* Sticky, because the buttons previously sat below every field: saving
            one changed value meant scrolling past eight you had not touched. */}
          <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap gap-3 border-t border-[var(--border)] bg-[var(--bg,#111)]/95 px-4 py-3 backdrop-blur md:px-8">
            <button
              type="submit"
              disabled={updating}
              className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updating && <Loader2 size={16} className="animate-spin" />}
              {updating ? "Saving..." : status === "draft" ? "Save draft" : "Save changes"}
            </button>
            <button
              ref={previewButton}
              type="button"
              disabled={updating}
              onClick={openPreview}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              Preview &amp; publish
            </button>
            <button
              type="button"
              onClick={() => router.push(`/recruit/jobs/${id}`)}
              className="rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
