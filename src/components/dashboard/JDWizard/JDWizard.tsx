"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApiQuery, useApiMutation } from "@/lib/hooks/use-api";
import { buildDescriptionFromDynamic } from "@/lib/jobs/build-description";
import { extractSkillsFromSections, toDynamicJdSections } from "@/lib/jobs/normalize-sections";
import { buildReferralConfigPayload } from "@/components/dashboard/JobReferralBonusFormFields";
import { Step1Input } from "./Step1Input";
import { Step2Sections } from "./Step2Sections";
import { Step3Publish } from "./Step3Publish";
import type { JdSection, WizardMetadata, WizardStep, WizardRole, ParsedWizardData } from "./types";

interface JDWizardProps {
  role: WizardRole;
  initialClientId?: string;
  onBack?: () => void;
  onSuccess?: (jobId: string) => void;
}

const EMPTY_METADATA: WizardMetadata = {
  title: "",
  location: "",
  roleFunction: "",
  seniorityLevel: "",
  remoteAllowed: false,
  compensationMin: undefined,
  compensationMax: undefined,
  experienceMin: null,
  experienceMax: null,
  summary: "",
  listOnPublicJobBoard: true,
  listForInternalReferrals: true,
};

export function JDWizard({ role, initialClientId = "", onBack, onSuccess }: JDWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [metadata, setMetadata] = useState<WizardMetadata>(EMPTY_METADATA);
  const [sections, setSections] = useState<JdSection[]>([]);
  const [rawText, setRawText] = useState("");

  // Step 3 state
  const [hiringManagerId, setHiringManagerId] = useState("");
  const [referralEnabled, setReferralEnabled] = useState(false);
  const [referralSaveWarning, setReferralSaveWarning] = useState<string | null>(null);
  const referralFormRef = useRef<HTMLFormElement | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  // Agency mode
  const [selectedClientId, setSelectedClientId] = useState(initialClientId);

  const { data: membersData } = useApiQuery<{
    members: { id: string; full_name: string; role: string }[];
  }>("/api/organisations/members");
  const hiringManagers = (membersData?.members ?? []).filter((m) => m.role === "hiring_manager");

  // Agency client picker
  const { data: orgsData } = useApiQuery<{
    organisations: { id: string; name: string; slug: string | null }[];
  }>(role === "agency" ? "/api/organisations" : null);
  const clients = useMemo(
    () => (orgsData?.organisations ?? []).map((o) => ({ id: o.id, name: o.name })),
    [orgsData],
  );

  const {
    mutate: createJob,
    loading: publishing,
    error: publishError,
  } = useApiMutation<Record<string, unknown>, { job: { id: string } }>("/api/jobs", "POST");

  function handleParsed(data: ParsedWizardData) {
    setMetadata({
      ...EMPTY_METADATA,
      ...data.metadata,
      listOnPublicJobBoard: data.metadata.listOnPublicJobBoard ?? true,
      listForInternalReferrals: data.metadata.listForInternalReferrals ?? true,
    });
    setSections(data.sections);
    setRawText(data.rawText);
    setStep(2);
  }

  async function handlePublish() {
    const description = buildDescriptionFromDynamic(sections) || rawText || "";
    const skills = extractSkillsFromSections(sections);

    const payload: Record<string, unknown> = {
      title: metadata.title,
      description: description.length >= 50 ? description : "Job description pending completion.",
      location: metadata.location,
      status: "open",
      compensationMin: metadata.compensationMin || undefined,
      compensationMax: metadata.compensationMax || undefined,
      roleFunction: metadata.roleFunction || undefined,
      seniorityLevel: metadata.seniorityLevel || undefined,
      skillsRequired: skills.required,
      skillsPreferred: skills.preferred,
      remoteAllowed: metadata.remoteAllowed,
      hiringManagerId: hiringManagerId || undefined,
      jdSections: toDynamicJdSections(sections),
      listOnPublicJobBoard: metadata.listOnPublicJobBoard ?? true,
      listForInternalReferrals: metadata.listForInternalReferrals ?? true,
    };

    if (metadata.applicationsCloseAt?.trim()) {
      const t = new Date(metadata.applicationsCloseAt).getTime();
      if (!Number.isNaN(t)) {
        payload.applicationsCloseAt = new Date(metadata.applicationsCloseAt).toISOString();
      }
    }

    if (role === "agency" && selectedClientId) {
      payload.organisationId = selectedClientId;
    }

    const result = await createJob(payload);

    if (result?.job?.id) {
      setCreatedJobId(result.job.id);
      setReferralSaveWarning(null);
      if (referralFormRef.current) {
        const refPayload = buildReferralConfigPayload(
          new FormData(referralFormRef.current),
          referralEnabled,
        );
        const refRes = await fetch(`/api/jobs/${result.job.id}/referral-config`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(refPayload),
        });
        if (!refRes.ok) {
          setReferralSaveWarning(
            "Referral bonus settings were not saved. You can add them when editing the job.",
          );
        }
      }
      if (onSuccess) onSuccess(result.job.id);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 py-20 backdrop-blur-sm">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
          <span className="text-3xl text-emerald-400">&#10003;</span>
        </div>
        <h2 className="heading-card text-xl text-[var(--text)]">JD Posted Successfully!</h2>
        <p className="text-body mt-2 text-sm text-[var(--text-muted)]">
          Your job description has been published. Complete Ideal Profile on the job page so
          FitScore can run for applicants.
        </p>
        {referralSaveWarning && (
          <p className="mt-3 max-w-md text-center text-sm text-amber-400">{referralSaveWarning}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setCreatedJobId(null);
              setStep(1);
              setMetadata(EMPTY_METADATA);
              setSections([]);
              setRawText("");
              setReferralSaveWarning(null);
            }}
            className="rounded-full border border-[var(--border)] px-6 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
          >
            Post Another
          </button>
          {createdJobId ? (
            <button
              type="button"
              onClick={() => {
                const jobsBase =
                  role === "company"
                    ? "/company/jobs"
                    : role === "recruiter"
                      ? "/recruit/jobs"
                      : "/agency/jobs";
                router.push(`${jobsBase}/${createdJobId}#ideal-profile-setup`);
              }}
              className="rounded-full border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-6 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--accent)]/25"
            >
              Set up Ideal Profile
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const basePath =
                role === "company"
                  ? "/company/jobs"
                  : role === "recruiter"
                    ? "/recruit/jobs"
                    : "/agency/jobs";
              router.push(basePath);
            }}
            className="rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            View All Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                s === step
                  ? "bg-[var(--accent)] text-black"
                  : s < step
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-[var(--surface)] text-[var(--text-muted)]"
              }`}
            >
              {s < step ? "✓" : s}
            </div>
            {s < 3 && (
              <div
                className={`h-0.5 w-12 rounded-full ${
                  s < step ? "bg-emerald-500/40" : "bg-[var(--border)]"
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="text-center">
        <h3 className="text-sm font-medium text-[var(--text-muted)]">
          {step === 1 && "Step 1: Provide Job Description"}
          {step === 2 && "Step 2: Review & Edit Sections"}
          {step === 3 && "Step 3: Compensation & Publish"}
        </h3>
      </div>

      {step === 1 && <Step1Input onParsed={handleParsed} />}

      {step === 2 && (
        <Step2Sections
          metadata={metadata}
          onMetadataChange={setMetadata}
          sections={sections}
          onSectionsChange={setSections}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      <div className={step === 3 ? undefined : "hidden"}>
        <Step3Publish
          metadata={metadata}
          onMetadataChange={setMetadata}
          hiringManagers={hiringManagers}
          hiringManagerId={hiringManagerId}
          onHiringManagerChange={setHiringManagerId}
          referralEnabled={referralEnabled}
          onReferralEnabledChange={setReferralEnabled}
          referralFormRef={referralFormRef}
          publishing={publishing}
          error={publishError}
          onPublish={handlePublish}
          onBack={() => setStep(2)}
          showClientPicker={role === "agency"}
          clients={clients}
          selectedClientId={selectedClientId}
          onClientChange={setSelectedClientId}
        />
      </div>
    </div>
  );
}
