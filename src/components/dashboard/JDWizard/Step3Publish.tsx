"use client";

import { Loader2 } from "lucide-react";
import { inputClass, labelClass } from "@/lib/styles/form";
import { JobReferralBonusFormFields } from "@/components/dashboard/JobReferralBonusFormFields";
import { JobListingVisibilityFields } from "@/components/dashboard/JobListingVisibilityFields";
import type { WizardMetadata } from "./types";

interface Step3PublishProps {
  metadata: WizardMetadata;
  onMetadataChange: (m: WizardMetadata) => void;
  hiringManagers: { id: string; full_name: string; role: string }[];
  hiringManagerId: string;
  onHiringManagerChange: (id: string) => void;
  referralEnabled: boolean;
  onReferralEnabledChange: (v: boolean) => void;
  referralFormRef: React.RefObject<HTMLFormElement | null>;
  publishing: boolean;
  error: string | null;
  onPublish: () => void;
  onBack: () => void;
  showClientPicker?: boolean;
  clients?: { id: string; name: string }[];
  selectedClientId?: string;
  onClientChange?: (id: string) => void;
}

export function Step3Publish({
  metadata,
  onMetadataChange,
  hiringManagers,
  hiringManagerId,
  onHiringManagerChange,
  referralEnabled,
  onReferralEnabledChange,
  referralFormRef,
  publishing,
  error,
  onPublish,
  onBack,
  showClientPicker,
  clients,
  selectedClientId,
  onClientChange,
}: Step3PublishProps) {
  function updateMeta<K extends keyof WizardMetadata>(key: K, value: WizardMetadata[K]) {
    onMetadataChange({ ...metadata, [key]: value });
  }

  return (
    <div className="space-y-6">
      {/* Client picker (agency mode) */}
      {showClientPicker && clients && onClientChange && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-5 space-y-4">
          <h3 className="text-base font-semibold text-[var(--text)]">Client</h3>
          <div>
            <label htmlFor="wiz-client" className={labelClass}>
              Select Client Organisation
            </label>
            <select
              id="wiz-client"
              className={inputClass}
              value={selectedClientId ?? ""}
              onChange={(e) => onClientChange(e.target.value)}
            >
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <JobListingVisibilityFields
        mode="controlled"
        listOnPublicJobBoard={metadata.listOnPublicJobBoard ?? true}
        listForInternalReferrals={metadata.listForInternalReferrals ?? true}
        onListOnPublicChange={(v) => updateMeta("listOnPublicJobBoard", v)}
        onListInternalChange={(v) => updateMeta("listForInternalReferrals", v)}
      />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-5 space-y-3">
        <h3 className="text-base font-semibold text-[var(--text)]">
          Application deadline (optional)
        </h3>
        <p className="text-sm text-[var(--text-muted)]">
          Candidates who already applied get in-app reminders around 7 days and 24 hours before this
          time. Leave blank for no deadline-based nudges.
        </p>
        <div>
          <label htmlFor="wiz-app-close" className={labelClass}>
            Stop accepting applications at (local time)
          </label>
          <input
            id="wiz-app-close"
            type="datetime-local"
            className={inputClass}
            value={metadata.applicationsCloseAt ?? ""}
            onChange={(e) => updateMeta("applicationsCloseAt", e.target.value || undefined)}
          />
        </div>
      </div>

      {/* Compensation */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-5 space-y-4">
        <h3 className="text-base font-semibold text-[var(--text)]">Compensation</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wiz-salary-min" className={labelClass}>
              Salary Min (₹)
            </label>
            <input
              id="wiz-salary-min"
              type="number"
              min={0}
              step={100000}
              placeholder="e.g. 1500000"
              className={inputClass}
              value={metadata.compensationMin ?? ""}
              onChange={(e) =>
                updateMeta("compensationMin", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </div>
          <div>
            <label htmlFor="wiz-salary-max" className={labelClass}>
              Salary Max (₹)
            </label>
            <input
              id="wiz-salary-max"
              type="number"
              min={0}
              step={100000}
              placeholder="e.g. 2500000"
              className={inputClass}
              value={metadata.compensationMax ?? ""}
              onChange={(e) =>
                updateMeta("compensationMax", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </div>
        </div>
      </div>

      {/* Referral Bonus */}
      <form ref={referralFormRef} onSubmit={(e) => e.preventDefault()}>
        <JobReferralBonusFormFields
          enabled={referralEnabled}
          onEnabledChange={onReferralEnabledChange}
          defaults={null}
          startOpen={false}
        />
      </form>

      {/* Hiring Manager */}
      {hiringManagers.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-5 space-y-4">
          <h3 className="text-base font-semibold text-[var(--text)]">Assignment</h3>
          <div>
            <label htmlFor="wiz-hm" className={labelClass}>
              Hiring Manager
            </label>
            <select
              id="wiz-hm"
              className={inputClass}
              value={hiringManagerId}
              onChange={(e) => onHiringManagerChange(e.target.value)}
            >
              <option value="">None — assign later</option>
              {hiringManagers.map((hm) => (
                <option key={hm.id} value={hm.id}>
                  {hm.full_name || hm.id}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              They will see this JD and its metrics in My JDs.
            </p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={
            publishing ||
            (!(metadata.listOnPublicJobBoard ?? true) &&
              !(metadata.listForInternalReferrals ?? true))
          }
          className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {publishing && <Loader2 size={16} className="animate-spin" />}
          {publishing ? "Publishing…" : "Publish Job Description"}
        </button>
      </div>
    </div>
  );
}
