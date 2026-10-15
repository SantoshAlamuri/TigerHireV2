"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/Toast";
import { parseOfferCtcValue } from "@/lib/offers/compensation-normalize";
import {
  OfferCtcCalculatorPanel,
  type OfferCtcApplyExtras,
} from "@/components/dashboard/OfferCtcCalculatorPanel";
import {
  RequisitionThreadBanner,
  hiringRequestFromJobRow,
} from "@/components/dashboard/RequisitionThreadBanner";
import type { OfferCustomMergeFieldDef } from "@/lib/offers/offer-custom-merge-fields";
import {
  scoreTemplateSelectionRules,
  type OfferTemplateSelectionRules,
} from "@/lib/offers/offer-template-selection-rules";

type OfferTemplateListRow = {
  id: string;
  name: string;
  is_default: boolean;
  latestVersionNumber: number;
  customMergeFieldDefs: OfferCustomMergeFieldDef[];
  selectionRules: OfferTemplateSelectionRules;
};

type OfferFlowSettings = {
  flow: {
    steps: string[];
    ctcCalculators: Array<{
      key: string;
      name: string;
      components: {
        label: string;
        annual: number | null;
        formula?: { basis: "base" | "subtotal"; percent: number } | null;
      }[];
    }>;
    defaultCalculatorKey: string;
  };
  canEdit: boolean;
};

interface RecruitCandidateOfferDraftProps {
  applicationId: string | null;
  defaultRoleTitle: string;
  /**
   * When false, the full form is always shown (e.g. dedicated draft page). When true (default),
   * the block starts expanded but can be collapsed.
   */
  collapsible?: boolean;
  /** Links in the hiring-flow strip (requisition → role → pipeline → offer). */
  dashboardPrefix?: "/recruit" | "/company";
}

export function RecruitCandidateOfferDraft({
  applicationId,
  defaultRoleTitle,
  collapsible = true,
  dashboardPrefix = "/recruit",
}: RecruitCandidateOfferDraftProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);

  const formVisible = !collapsible || open;

  const { data: flowData, loading: flowLoading } = useApiQuery<OfferFlowSettings>(
    applicationId && formVisible ? "/api/settings/offer-letter-flow" : null,
  );
  const { data: offerTplData, loading: offerTplLoading } = useApiQuery<{
    templates: OfferTemplateListRow[];
  }>(applicationId && formVisible ? "/api/offer-pdf-templates" : null);

  const { data: applicationWrap } = useApiQuery<{
    application: {
      job_id?: string | null;
      jobs?: Record<string, unknown> | Record<string, unknown>[];
    };
  }>(applicationId ? `/api/applications/${applicationId}` : null);

  const applicationJob = applicationWrap?.application?.jobs;
  const jobRow = Array.isArray(applicationJob) ? applicationJob[0] : (applicationJob ?? null);
  const jobIdForThread =
    (jobRow?.id as string | undefined) ??
    (applicationWrap?.application?.job_id as string | undefined) ??
    null;
  const [roleTitle, setRoleTitle] = useState(defaultRoleTitle);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ctc, setCtc] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [compBreakdown, setCompBreakdown] = useState("");
  const [appliedCompExtras, setAppliedCompExtras] = useState<OfferCtcApplyExtras | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bgvSubmitting, setBgvSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [letterVars, setLetterVars] = useState<Record<string, string>>({});
  const [activeCalculatorKey, setActiveCalculatorKey] = useState<string>("");
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [templateManuallySelected, setTemplateManuallySelected] = useState(false);
  const [employmentType, setEmploymentType] = useState("");
  const [seniorityLevel, setSeniorityLevel] = useState("");
  const [companySignerName, setCompanySignerName] = useState("");
  const [companySignerEmail, setCompanySignerEmail] = useState("");

  const defaultOfferTemplate = useMemo(() => {
    const list = offerTplData?.templates ?? [];
    return list.find((t) => t.is_default) ?? list[0] ?? null;
  }, [offerTplData?.templates]);

  const offerTemplates = offerTplData?.templates ?? [];
  const selectedTemplate = useMemo(
    () => (activeTemplateId ? offerTemplates.find((t) => t.id === activeTemplateId) : null) ?? null,
    [activeTemplateId, offerTemplates],
  );
  const resolvedTemplate = selectedTemplate ?? defaultOfferTemplate;

  const jobLocation = useMemo(() => {
    if (!jobRow || typeof jobRow !== "object") return "";
    return String((jobRow as Record<string, unknown>).location ?? "").trim();
  }, [jobRow]);

  const customMergeDefs = useMemo(
    () => resolvedTemplate?.customMergeFieldDefs ?? [],
    [resolvedTemplate?.customMergeFieldDefs],
  );

  const customDefsKey = useMemo(
    () => customMergeDefs.map((d) => d.key).join("\n"),
    [customMergeDefs],
  );

  useEffect(() => {
    if (!formVisible || customMergeDefs.length === 0) return;
    setLetterVars((prev) => {
      const next = { ...prev };
      for (const d of customMergeDefs) {
        if (next[d.key] === undefined) next[d.key] = "";
      }
      for (const k of Object.keys(next)) {
        if (!customMergeDefs.some((d) => d.key === k)) delete next[k];
      }
      return next;
    });
  }, [formVisible, selectedTemplate?.id, customDefsKey, customMergeDefs]);

  useEffect(() => {
    if (!offerTemplates.length) {
      setActiveTemplateId("");
      return;
    }
    if (templateManuallySelected) {
      setActiveTemplateId((prev) =>
        prev && offerTemplates.some((t) => t.id === prev) ? prev : (defaultOfferTemplate?.id ?? ""),
      );
      return;
    }

    const scored = offerTemplates
      .map((tpl) => ({
        id: tpl.id,
        score: scoreTemplateSelectionRules(tpl.selectionRules, {
          roleTitle: roleTitle.trim() || defaultRoleTitle,
          location: jobLocation,
          employmentType,
          seniorityLevel,
        }),
        isDefault: tpl.is_default,
      }))
      .filter((row) => row.score > 0)
      .sort(
        (a, b) => b.score - a.score || (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1),
      );

    const bestId = scored[0]?.id ?? defaultOfferTemplate?.id ?? "";
    setActiveTemplateId(bestId);
  }, [
    offerTemplates,
    defaultOfferTemplate?.id,
    roleTitle,
    defaultRoleTitle,
    jobLocation,
    employmentType,
    seniorityLevel,
    templateManuallySelected,
  ]);

  useEffect(() => {
    setRoleTitle(defaultRoleTitle);
  }, [defaultRoleTitle]);

  /** Positive annual CTC for validation, band preview, and submit (ignores empty field; accepts commas). */
  const parsedAnnualCtc = useMemo(() => {
    const raw = typeof ctc === "string" ? ctc.trim() : "";
    if (!raw) return null;
    const n = parseOfferCtcValue(raw);
    return n !== null && n > 0 ? n : null;
  }, [ctc]);

  const flowSteps = flowData?.flow.steps ?? [
    "Select candidate",
    "Compute CTC",
    "Fill letter details",
    "Recruiter saves draft",
    "Hiring manager / finance approval",
    "Send offer to candidate",
  ];
  const flowCtcCalculators = flowData?.flow.ctcCalculators ?? [];
  const resolvedDefaultCalculatorKey =
    flowData?.flow.defaultCalculatorKey &&
    flowCtcCalculators.some((c) => c.key === flowData.flow.defaultCalculatorKey)
      ? flowData.flow.defaultCalculatorKey
      : (flowCtcCalculators[0]?.key ?? "");
  const selectedCalculatorKey =
    activeCalculatorKey && flowCtcCalculators.some((c) => c.key === activeCalculatorKey)
      ? activeCalculatorKey
      : resolvedDefaultCalculatorKey;
  const selectedCalculator =
    flowCtcCalculators.find((c) => c.key === selectedCalculatorKey) ??
    flowCtcCalculators[0] ??
    null;

  useEffect(() => {
    setActiveCalculatorKey((prev) =>
      prev && flowCtcCalculators.some((c) => c.key === prev) ? prev : resolvedDefaultCalculatorKey,
    );
  }, [flowCtcCalculators, resolvedDefaultCalculatorKey]);

  async function submit() {
    if (!applicationId) return;
    if (parsedAnnualCtc === null) {
      setError("Enter a valid annual CTC (digits only, or use commas).");
      return;
    }
    setSubmitting(true);
    setNotice("Saving draft…");
    setError(null);
    try {
      const compensation: Record<string, unknown> = { ctc: parsedAnnualCtc };
      if (compBreakdown.trim()) {
        compensation.breakdown = compBreakdown.trim();
      }
      if (appliedCompExtras) {
        compensation.components = appliedCompExtras.components;
        compensation.variable_percent_of_components = appliedCompExtras.variablePercentOfSubtotal;
        compensation.joining_bonus = appliedCompExtras.joiningBonus;
        compensation.include_joining_in_ctc = appliedCompExtras.includeJoiningInAnnual;
        if (selectedCalculator?.key) compensation.ctc_calculator_key = selectedCalculator.key;
        if (selectedCalculator?.name) compensation.ctc_calculator_name = selectedCalculator.name;
      }
      const body: Record<string, unknown> = {
        applicationId,
        roleTitle: roleTitle.trim() || defaultRoleTitle || "Role",
        startDate,
        compensation,
      };
      const normalizedSignerName = companySignerName.trim();
      const normalizedSignerEmail = companySignerEmail.trim().toLowerCase();
      if (normalizedSignerName || normalizedSignerEmail) {
        if (!normalizedSignerName || !normalizedSignerEmail) {
          setError("Provide both company signer name and email, or leave both blank.");
          setNotice(null);
          return;
        }
        body.companySignerName = normalizedSignerName;
        body.companySignerEmail = normalizedSignerEmail;
      }
      if (resolvedTemplate?.id) {
        body.offerPdfTemplateId = resolvedTemplate.id;
      }
      if (offerNotes.trim()) body.notes = offerNotes.trim();
      if (customMergeDefs.length > 0) {
        body.letterVariables = Object.fromEntries(
          customMergeDefs.map((d) => [d.key, letterVars[d.key] ?? ""]),
        );
      }

      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        requiresReason?: boolean;
        band?: { label: string; min: number; max: number; currency: string };
        deviation?: number;
      };

      if (!res.ok) {
        setError(json.error ?? "Could not create offer.");
        toast({
          title: "Draft save failed",
          description: json.error ?? "Could not create offer.",
          tone: "error",
        });
        setNotice(null);
        return;
      }

      setNotice("Draft saved. Next: hiring manager / finance approvals, then send to candidate.");
      toast({
        title: "Draft saved",
        description: "Approval flow has started from this draft.",
        tone: "success",
      });
      setOfferNotes("");
      setCompBreakdown("");
      setAppliedCompExtras(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (!applicationId) return null;

  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 ${collapsible ? "mt-5" : ""}`}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <p className="text-body text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Draft offer
          </p>
          <span className="text-xs font-medium text-[var(--accent)]">
            {open ? "Collapse" : "Expand"}
          </span>
        </button>
      ) : (
        <p className="text-body text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Draft offer
        </p>
      )}

      {formVisible && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-[var(--accent-muted)] bg-[var(--accent-muted)]/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              Recruiter action order
            </p>
            <ol className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
              <li>1. Set CTC, role/start date, and letter placeholders below.</li>
              <li>
                2. Click{" "}
                <span className="font-semibold text-[var(--text)]">
                  Save draft &amp; start approvals
                </span>
                .
              </li>
              <li>3. Candidate signing and BGV happen later in the offer lifecycle.</li>
            </ol>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              Offer flow
            </p>
            <ol className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
              {flowSteps.map((step, idx) => (
                <li key={`${idx}-${step}`} className="flex items-start gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[10px] font-semibold text-[var(--accent)]">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          {applicationId ? (
            <RequisitionThreadBanner
              dashboardPrefix={dashboardPrefix}
              activeStep="offer"
              hiringRequest={
                jobRow && typeof jobRow === "object"
                  ? hiringRequestFromJobRow(jobRow as Record<string, unknown>)
                  : null
              }
              jobId={jobIdForThread}
              applicationId={applicationId}
            />
          ) : null}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              CTC calculator preset
            </p>
            {flowCtcCalculators.length > 1 ? (
              <select
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text)]"
                style={{ colorScheme: "dark" }}
                value={selectedCalculatorKey}
                onChange={(e) => {
                  setActiveCalculatorKey(e.target.value);
                  setAppliedCompExtras(null);
                }}
              >
                {flowCtcCalculators.map((calc) => (
                  <option key={calc.key} value={calc.key}>
                    {calc.name}
                    {calc.key === resolvedDefaultCalculatorKey ? " (default)" : ""}
                  </option>
                ))}
              </select>
            ) : null}
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Using:{" "}
              <span className="font-medium text-[var(--text)]">
                {selectedCalculator?.name ?? "Standard CTC"}
              </span>
            </p>
          </div>
          <OfferCtcCalculatorPanel
            currencyHint="INR"
            initialComponents={selectedCalculator?.components ?? []}
            targetAnnualCtc={parsedAnnualCtc}
            onApply={({ ctc: appliedCtc, breakdown, extras }) => {
              setCtc(String(Math.round(appliedCtc)));
              setCompBreakdown(breakdown);
              setAppliedCompExtras(extras);
              setNotice(
                "CTC applied from calculator. Edit totals if needed; letter values use this breakdown.",
              );
              setError(null);
            }}
          />

          {flowLoading || offerTplLoading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 size={14} className="animate-spin" /> Loading offer flow / template…
            </p>
          ) : null}

          {!offerTplLoading && offerTemplates.length > 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                Offer letter template
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Auto-selected from template rules; you can override.
              </p>
              <select
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text)]"
                style={{ colorScheme: "dark" }}
                value={resolvedTemplate?.id ?? ""}
                onChange={(e) => {
                  setTemplateManuallySelected(true);
                  setActiveTemplateId(e.target.value);
                }}
              >
                {offerTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                    {tpl.is_default ? " (default)" : ""} • v{tpl.latestVersionNumber}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setTemplateManuallySelected(false)}
                className="mt-2 rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                Reset to auto-select
              </button>
            </div>
          ) : null}

          {customMergeDefs.length > 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                Letter placeholders
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Custom merge fields from your organisation&apos;s default offer letter template.
              </p>
              <div className="mt-2 space-y-2">
                {customMergeDefs.map((d) => (
                  <label key={d.key} className="block text-xs text-[var(--text)]">
                    <span className="mb-0.5 block font-medium text-[var(--text-muted)]">
                      {d.label}{" "}
                      <code className="text-[10px] text-[var(--text)]">{`{{${d.key}}}`}</code>
                    </span>
                    {d.description ? (
                      <span className="mb-1 block text-[10px] text-[var(--text-muted)]">
                        {d.description}
                      </span>
                    ) : null}
                    <input
                      className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-2 py-1.5 text-xs text-[var(--text)]"
                      value={letterVars[d.key] ?? ""}
                      onChange={(e) =>
                        setLetterVars((prev) => ({ ...prev, [d.key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
            placeholder="Role title"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
          />
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="date"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              type="text"
              inputMode="numeric"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
              placeholder="Annual CTC (e.g. 2400000 or 24,00,000)"
              value={ctc}
              onChange={(e) => {
                setCtc(e.target.value);
                setAppliedCompExtras(null);
              }}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="text"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
              placeholder="Employment type (optional, e.g. full-time)"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
            />
            <input
              type="text"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
              placeholder="Seniority level (optional, e.g. senior)"
              value={seniorityLevel}
              onChange={(e) => setSeniorityLevel(e.target.value)}
            />
          </div>
          {typeof ctc === "string" && ctc.trim() !== "" && parsedAnnualCtc === null ? (
            <p className="text-[11px] text-amber-200/90">
              Could not read that amount. Use digits with optional commas (e.g.{" "}
              <span className="font-mono">2640000</span> or{" "}
              <span className="font-mono">26,40,000</span>
              ).
            </p>
          ) : null}

          {compBreakdown ? (
            <label className="block text-[11px] text-[var(--text-muted)]">
              <span className="mb-1 block font-medium text-[var(--text-subtle)]">
                Compensation breakdown (offer & PDF)
              </span>
              <textarea
                className="min-h-[6rem] w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 font-mono text-[11px] text-[var(--text)]"
                value={compBreakdown}
                onChange={(e) => {
                  setCompBreakdown(e.target.value);
                  setAppliedCompExtras(null);
                }}
              />
            </label>
          ) : null}

          <label className="block text-[11px] text-[var(--text-muted)]">
            <span className="mb-1 block font-medium text-[var(--text-subtle)]">
              Offer notes (optional)
            </span>
            <textarea
              className="min-h-[3.5rem] w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
              placeholder="Relocation, probation, equity, or other context for approvers…"
              value={offerNotes}
              onChange={(e) => setOfferNotes(e.target.value)}
            />
          </label>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              Company signature routing (optional)
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              If set, this offer is sent to the company representative first. The candidate receives
              the signing link only after the company signature is completed.
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input
                type="text"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                placeholder="Company signer full name"
                value={companySignerName}
                onChange={(e) => setCompanySignerName(e.target.value)}
              />
              <input
                type="email"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                placeholder="Company signer email"
                value={companySignerEmail}
                onChange={(e) => setCompanySignerEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              SpringVerify (manual trigger, optional)
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Use this only if you need to manually create/retry a BGV case. Normally BGV is
              triggered later in the offer lifecycle. Requires{" "}
              <code className="text-[var(--text)]">SPRINGVERIFY_CREATE_CASE_URL</code> and{" "}
              <code className="text-[var(--text)]">SPRINGVERIFY_API_KEY</code>.
            </p>
            <button
              type="button"
              disabled={bgvSubmitting}
              onClick={async () => {
                if (!applicationId) return;
                setBgvSubmitting(true);
                setError(null);
                try {
                  const res = await fetch("/api/integrations/springverify/initiate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ applicationId }),
                  });
                  const json = (await res.json().catch(() => ({}))) as { error?: string };
                  if (!res.ok) {
                    setError(json.error ?? "Could not start SpringVerify.");
                    return;
                  }
                  setNotice(
                    "SpringVerify case requested. Check your SpringVerify dashboard for status.",
                  );
                } finally {
                  setBgvSubmitting(false);
                }
              }}
              className="mt-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text)] transition hover:bg-[var(--surface)] disabled:opacity-50"
            >
              {bgvSubmitting ? "Starting…" : "Start SpringVerify check"}
            </button>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Recommended only after the offer process has progressed.
            </p>
          </div>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          {notice ? <p className="text-xs text-emerald-400">{notice}</p> : null}

          <button
            type="button"
            disabled={submitting || parsedAnnualCtc === null}
            onClick={() => void submit()}
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save draft & start approvals"}
          </button>
        </div>
      )}
    </div>
  );
}
