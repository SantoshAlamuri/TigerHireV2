"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOptimisticMutation, invalidateQueries, useApiQuery } from "@/lib/hooks/use-api";
function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function useHiringRequestForm(requestId?: string, initial: Record<string, unknown> = {}) {
  const router = useRouter();
  const { data: templatesData } = useApiQuery<{
    templates: Array<{
      id: string;
      name: string;
      summary?: string | null;
      role_level?: string | null;
      department?: string | null;
      template_text?: string | null;
      keywords?: string[] | null;
    }>;
  }>("/api/requisition-templates");
  const [title, setTitle] = useState(String(initial.title ?? ""));
  const [department, setDepartment] = useState(String(initial.department ?? ""));
  const [headcount, setHeadcount] = useState(Number(initial.headcount ?? 1));
  const [urgency, setUrgency] = useState(String(initial.urgency ?? "normal"));
  const [description, setDescription] = useState(String(initial.description ?? ""));
  const [mustHaves, setMustHaves] = useState(String(initial.must_haves ?? ""));
  const [niceToHaves, setNiceToHaves] = useState(String(initial.nice_to_haves ?? ""));
  const [idealExperience, setIdealExperience] = useState(String(initial.ideal_experience ?? ""));
  const [idealSummary, setIdealSummary] = useState(String(initial.ideal_summary ?? ""));
  const [notes, setNotes] = useState(String(initial.notes ?? ""));
  const [roleLevel, setRoleLevel] = useState(String(initial.role_level ?? ""));
  const [costCenter, setCostCenter] = useState(String(initial.cost_center ?? ""));
  const [employmentType, setEmploymentType] = useState(String(initial.employment_type ?? ""));
  const [locationType, setLocationType] = useState(String(initial.location_type ?? ""));
  const [locationCity, setLocationCity] = useState(String(initial.location_city ?? ""));
  const [headcountType, setHeadcountType] = useState(String(initial.headcount_type ?? ""));
  const [businessJustification, setBusinessJustification] = useState(
    String(initial.business_justification ?? ""),
  );
  const [targetJoiningDate, setTargetJoiningDate] = useState(
    String(initial.target_joining_date ?? ""),
  );
  const [budgetCtcMin, setBudgetCtcMin] = useState(String(initial.budget_ctc_min ?? ""));
  const [budgetCtcMax, setBudgetCtcMax] = useState(String(initial.budget_ctc_max ?? ""));
  const [templateId, setTemplateId] = useState(String(initial.template_id ?? ""));
  const [step, setStep] = useState<1 | 2>(1);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const saveError = useRef<HTMLParagraphElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) stepHeading.current?.focus();
    previousStep.current = step;
  }, [step]);

  const { mutate, loading, error } = useOptimisticMutation<
    Record<string, unknown>,
    Record<string, unknown>
  >(requestId ? `/api/hiring-requests/${requestId}` : "/api/hiring-requests", {
    method: requestId ? "PATCH" : "POST",
  });

  useEffect(() => {
    if (error) saveError.current?.focus();
  }, [error]);

  function buildPayload(saveDraft: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      title: title.trim(),
      department: department.trim() || null,
      headcount,
      urgency,
      description: description.trim() || null,
      mustHaves: mustHaves.trim() || null,
      niceToHaves: niceToHaves.trim() || null,
      idealExperience: idealExperience.trim() || null,
      idealSummary: idealSummary.trim() || null,
      notes: notes.trim() || null,
      ...(requestId ? { submit: !saveDraft } : { saveDraft }),
      roleLevel: roleLevel.trim() || null,
      costCenter: costCenter.trim() || null,
      employmentType: employmentType || null,
      locationType: locationType || null,
      locationCity: locationCity.trim() || null,
      headcountType: headcountType || null,
      businessJustification: businessJustification.trim() || null,
      targetJoiningDate: targetJoiningDate.trim() || null,
      budgetCtcMin: numOrNull(budgetCtcMin),
      budgetCtcMax: numOrNull(budgetCtcMax),
      templateId: templateId || null,
    };
    return payload;
  }

  async function handleSubmit(e: React.FormEvent, saveDraft: boolean) {
    e.preventDefault();
    const result = await mutate(buildPayload(saveDraft));
    if (result) {
      // Clears list cache for all `GET /api/hiring-requests?…` keys (company + recruit tabs).
      invalidateQueries("/api/hiring-requests");
      router.push("/company/hiring-requests");
    }
  }

  function continueToDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStep(2);
  }

  return {
    title,
    setTitle,
    department,
    setDepartment,
    headcount,
    setHeadcount,
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
    employmentType,
    setEmploymentType,
    locationType,
    setLocationType,
    locationCity,
    setLocationCity,
    headcountType,
    setHeadcountType,
    businessJustification,
    setBusinessJustification,
    targetJoiningDate,
    setTargetJoiningDate,
    budgetCtcMin,
    setBudgetCtcMin,
    budgetCtcMax,
    setBudgetCtcMax,
    templateId,
    setTemplateId,
    step,
    setStep,
    templatesData,
    stepHeading,
    saveError,
    loading,
    error,
    handleSubmit,
    continueToDetails,
  };
}
export type RequestFormState = ReturnType<typeof useHiringRequestForm>;
