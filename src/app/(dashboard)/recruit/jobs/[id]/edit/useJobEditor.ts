"use client";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { jobPublicationState } from "@/lib/jobs/publication-state";
import { buildReferralConfigPayload } from "@/components/dashboard/JobReferralBonusFormFields";
import { useApiQuery, useOptimisticMutation, invalidateQueries } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import { countWords } from "./job-editor-fields";

export function useJobEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const publishPending = useRef(false);
  const [preview, setPreview] = useState<FormData | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ label: string; publicApplications: boolean } | null>(
    null,
  );
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

  const jobRecord = jobRaw ?? {};
  const job = mapDbJobToPosting(jobRecord);
  const status = (jobRecord.status as string) ?? "draft";
  const currentHiringManagerId = (jobRecord.hiring_manager_id as string) ?? "";

  function openPreview() {
    if (!formRef.current?.reportValidity()) return;
    setPublishError(null);
    setPreview(new FormData(formRef.current));
  }

  async function saveJobFields(form: FormData, nextStatus?: string) {
    const title = form.get("title") as string;
    const description = form.get("description") as string;
    const location = form.get("location") as string;
    const statusValue = nextStatus ?? (form.get("status") as string);
    const compensationMin = Number(form.get("compensationMin"));
    const compensationMax = Number(form.get("compensationMax"));

    const hiringManagerIdValue = form.get("hiringManagerId") as string;
    return updateJob({
      title: title || undefined,
      description: description || undefined,
      location: location || undefined,
      status: statusValue || undefined,
      compensationMin: Number.isFinite(compensationMin) ? compensationMin : undefined,
      compensationMax: Number.isFinite(compensationMax) ? compensationMax : undefined,
      hiringManagerId: hiringManagerIdValue || null,
      listOnPublicJobBoard: form.get("listOnPublicJobBoard") === "on",
      listForInternalReferrals: form.get("listForInternalReferrals") === "on",
    });
  }

  async function publish() {
    if (!preview || publishPending.current) return;
    publishPending.current = true;
    setPublishError(null);
    try {
      const result = await saveJobFields(preview, "open");
      if (!result) {
        setPublishError("Publication was not saved. Review the error and try again.");
        return;
      }
      invalidateQueries("/api/jobs");
      setPublished(jobPublicationState(result.job as Parameters<typeof jobPublicationState>[0]));
      setPreview(null);
    } catch {
      setPublishError("Could not save publication. Your changes are still here; try again.");
    } finally {
      publishPending.current = false;
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (
      form.get("status") === "open" &&
      form.get("listOnPublicJobBoard") === "on" &&
      jobRecord.list_on_public_job_board !== true
    ) {
      setPublishError(null);
      setPreview(form);
      return;
    }
    const result = await saveJobFields(form);

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

    router.push(`/recruit/jobs/${id}`);
  }

  return {
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
    currentHiringManagerId,
    hiringManagers,
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
  };
}
export type JobEditorState = ReturnType<typeof useJobEditor>;
