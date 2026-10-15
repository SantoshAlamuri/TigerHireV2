"use client";
import { Briefcase } from "lucide-react";
import type { RequestFormState } from "./useHiringRequestForm";
import { inputClass, labelClass, selectClass } from "./request-form-styles";
export function RequestEssentials({ state }: { state: RequestFormState }) {
  const {
    title,
    setTitle,
    department,
    setDepartment,
    headcount,
    setHeadcount,
    description,
    setDescription,
    notes,
    setNotes,
    roleLevel,
    setRoleLevel,
    employmentType,
    setEmploymentType,
    locationType,
    setLocationType,
    locationCity,
    setLocationCity,
    budgetCtcMin,
    setBudgetCtcMin,
    budgetCtcMax,
    setBudgetCtcMax,
    templateId,
    setTemplateId,
    step,
    templatesData,
  } = state;
  return (
    <>
      {(templatesData?.templates?.length ?? 0) > 0 ? (
        <section className="card-lifted p-6">
          <h3 className="heading-section mb-4 text-base text-[var(--text)]">Template</h3>
          <label htmlFor="hr-template" className={labelClass}>
            Start from saved template
          </label>
          <select
            id="hr-template"
            value={templateId}
            onChange={(e) => {
              const selectedId = e.target.value;
              setTemplateId(selectedId);
              const template = templatesData?.templates?.find((t) => t.id === selectedId);
              if (!template) return;
              if (!title.trim()) setTitle(template.name);
              if (!department.trim() && template.department) {
                setDepartment(template.department);
              }
              if (!roleLevel.trim() && template.role_level) setRoleLevel(template.role_level);
              if (!description.trim() && template.template_text) {
                setDescription(template.template_text);
              }
              if (!notes.trim() && template.keywords?.length) {
                setNotes(`Keywords: ${template.keywords.join(", ")}`);
              }
            }}
            className={selectClass}
          >
            <option value="">No template</option>
            {(templatesData?.templates ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          {templateId ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {(templatesData?.templates ?? []).find((t) => t.id === templateId)?.summary ??
                "Template applied. You can still edit all fields before submit."}
            </p>
          ) : null}
        </section>
      ) : null}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-[var(--text)]">
          <Briefcase size={18} /> Role essentials
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="hr-title" className={labelClass}>
              Role title *
            </label>
            <input
              id="hr-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hr-headcount" className={labelClass}>
              Headcount
            </label>
            <input
              id="hr-headcount"
              type="number"
              min={1}
              max={100}
              value={headcount}
              onChange={(e) => setHeadcount(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hr-employment" className={labelClass}>
              Employment type
            </label>
            <select
              id="hr-employment"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className={selectClass}
            >
              <option value="">-</option>
              <option value="full_time">Full-time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
          </div>
          <div>
            <label htmlFor="hr-location-type" className={labelClass}>
              Location type
            </label>
            <select
              id="hr-location-type"
              value={locationType}
              onChange={(e) => setLocationType(e.target.value)}
              className={selectClass}
            >
              <option value="">-</option>
              <option value="office">Office</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label htmlFor="hr-location-city" className={labelClass}>
              City / site
            </label>
            <input
              id="hr-location-city"
              type="text"
              value={locationCity}
              onChange={(e) => setLocationCity(e.target.value)}
              placeholder="e.g. Bengaluru"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hr-budget-min" className={labelClass}>
              Budget min
            </label>
            <input
              id="hr-budget-min"
              type="number"
              min={0}
              step="1000"
              value={budgetCtcMin}
              onChange={(e) => setBudgetCtcMin(e.target.value)}
              placeholder="e.g. 1200000"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hr-budget-max" className={labelClass}>
              Budget max
            </label>
            <input
              id="hr-budget-max"
              type="number"
              min={0}
              step="1000"
              value={budgetCtcMax}
              onChange={(e) => setBudgetCtcMax(e.target.value)}
              placeholder="e.g. 1800000"
              className={inputClass}
            />
          </div>
        </div>
      </section>
    </>
  );
}
