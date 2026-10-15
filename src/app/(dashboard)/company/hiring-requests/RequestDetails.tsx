"use client";
import type { RequestFormState } from "./useHiringRequestForm";
import { inputClass, labelClass, selectClass } from "./request-form-styles";
export function RequestDetails({ state }: { state: RequestFormState }) {
  const {
    title,
    department,
    setDepartment,
    headcount,
    urgency,
    setUrgency,
    description,
    setDescription,
    mustHaves,
    setMustHaves,
    niceToHaves,
    setNiceToHaves,
    idealExperience,
    setIdealExperience,
    idealSummary,
    setIdealSummary,
    notes,
    setNotes,
    roleLevel,
    setRoleLevel,
    costCenter,
    setCostCenter,
    headcountType,
    setHeadcountType,
    businessJustification,
    setBusinessJustification,
    targetJoiningDate,
    setTargetJoiningDate,
  } = state;
  return (
    <>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="mb-3 font-semibold text-[var(--text)]">Responsibilities & approval</h3>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          {title} · {headcount} {headcount === 1 ? "hire" : "hires"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="hr-description" className={labelClass}>
              Responsibilities or existing job description
            </label>
            <textarea
              id="hr-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Responsibilities, team context, and why now"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="hr-must-haves" className={labelClass}>
              Must-have requirements
            </label>
            <textarea
              id="hr-must-haves"
              rows={3}
              value={mustHaves}
              onChange={(e) => setMustHaves(e.target.value)}
              placeholder="Non-negotiables: skills, domain, experience, location, ownership level"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hr-ideal-exp" className={labelClass}>
              Experience
            </label>
            <input
              id="hr-ideal-exp"
              type="text"
              value={idealExperience}
              onChange={(e) => setIdealExperience(e.target.value)}
              placeholder="e.g. 5-8 years"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="hr-justification" className={labelClass}>
              Business justification
            </label>
            <textarea
              id="hr-justification"
              rows={3}
              value={businessJustification}
              onChange={(e) => setBusinessJustification(e.target.value)}
              placeholder="Expected impact, timing, replacement context"
              className={inputClass}
            />
          </div>
        </div>
      </section>
      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--text)]">
          Optional details
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hr-department" className={labelClass}>
              Department
            </label>
            <input
              id="hr-department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Engineering"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hr-urgency" className={labelClass}>
              Priority
            </label>
            <select
              id="hr-urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className={selectClass}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label htmlFor="hr-role-level" className={labelClass}>
              Level / band
            </label>
            <input
              id="hr-role-level"
              type="text"
              value={roleLevel}
              onChange={(e) => setRoleLevel(e.target.value)}
              placeholder="e.g. L4, IC3"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hr-headcount-type" className={labelClass}>
              Headcount type
            </label>
            <select
              id="hr-headcount-type"
              value={headcountType}
              onChange={(e) => setHeadcountType(e.target.value)}
              className={selectClass}
            >
              <option value="">-</option>
              <option value="new_hire">New hire</option>
              <option value="backfill">Backfill</option>
            </select>
          </div>
          <div>
            <label htmlFor="hr-target-join" className={labelClass}>
              Target joining date
            </label>
            <input
              id="hr-target-join"
              type="date"
              value={targetJoiningDate}
              onChange={(e) => setTargetJoiningDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hr-cost-center" className={labelClass}>
              Cost center
            </label>
            <input
              id="hr-cost-center"
              type="text"
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="hr-notes" className={labelClass}>
              Notes for recruiter or approver
            </label>
            <textarea
              id="hr-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Constraints, panel preferences, source companies, timing"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="hr-nice-to-haves" className={labelClass}>
              Nice-to-have signals
            </label>
            <textarea
              id="hr-nice-to-haves"
              rows={2}
              value={niceToHaves}
              onChange={(e) => setNiceToHaves(e.target.value)}
              placeholder="Bonus signals: domain background, tools, source companies"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="hr-ideal-summary" className={labelClass}>
              What does a great hire look like?
            </label>
            <textarea
              id="hr-ideal-summary"
              rows={3}
              value={idealSummary}
              onChange={(e) => setIdealSummary(e.target.value)}
              placeholder="Strengths, traits, and the background you'd love to see"
              className={inputClass}
            />
          </div>
        </div>
      </details>
    </>
  );
}
