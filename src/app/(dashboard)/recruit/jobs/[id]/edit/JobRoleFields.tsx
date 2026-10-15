import { JobListingVisibilityFields } from "@/components/dashboard/JobListingVisibilityFields";
import { inputClass, labelClass } from "./job-editor-fields";
import type { JobEditorState } from "./useJobEditor";
export function JobRoleFields({ state }: { state: JobEditorState }) {
  const { job, status, hiringManagers, currentHiringManagerId, jobRecord } = state;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
        The role
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
            {status === "open" && <option value="open">Open</option>}
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
            <p className="mt-1 text-xs text-white/50">They see this JD and metrics in My JDs.</p>
          </div>
        )}
        {/* The salary band belongs with the rest of the role definition,
                  not in a section of its own. These inputs went missing while
                  the form was being restructured, and because handleSubmit
                  still reads compensationMin/Max from the FormData, the payload
                  kept sending undefined — a field that looks saved and is not. */}
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
            placeholder="e.g. 1200000"
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
        {/* Where it is listed and when it closes are part of defining the
                  role, not a separate decision — one card, not three. */}
        <div className="sm:col-span-2">
          <JobListingVisibilityFields
            compact
            mode="formDefaults"
            listOnPublicJobBoard={
              (jobRecord.list_on_public_job_board as boolean | undefined) !== false
            }
            listForInternalReferrals={
              (jobRecord.list_for_internal_referrals as boolean | undefined) !== false
            }
          />
        </div>
      </div>
    </div>
  );
}
