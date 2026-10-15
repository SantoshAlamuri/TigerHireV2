/**
 * Canonical names and billing semantics for runtime `feature_flags` keys.
 * DB rows remain source of truth for `enabled`; this catalog powers admin UX and billing hints.
 * Unknown keys still render with a generated title — add entries here as you discover them.
 */

export type FeatureFlagCategory =
  | "fitscore"
  | "agents"
  | "acknowledgements"
  | "entitlements_global"
  | "billing_infra"
  | "compliance"
  | "whatsapp"
  | "experimental"
  | "legacy_seed";

/** How this toggle relates to customer-facing billing (high level, not legal advice). */
export type CustomerBillingRelation =
  | "none"
  | "plan_entitlement_related"
  | "usage_meter_ready"
  | "platform_cost_only";

export interface FeatureFlagCatalogEntry {
  displayName: string;
  shortDescription: string;
  category: FeatureFlagCategory;
  customerBilling: CustomerBillingRelation;
  /** When `usage_meter_ready`, preferred meter id for `recordCustomerUsageMeterEvent`. */
  meterKey?: string;
  billingNotes?: string;
  complianceSensitive?: boolean;
}

export const FEATURE_FLAG_CATALOG: Record<string, FeatureFlagCatalogEntry> = {
  voice_screening_bolna: {
    displayName: "Voice screening (Bolna AI)",
    shortDescription:
      "Master switch for outbound Bolna AI voice-screening calls. Default OFF; sits above the per-org voice_screening_enabled setting.",
    category: "experimental",
    customerBilling: "usage_meter_ready",
    meterKey: "voice_screening_session",
    billingNotes:
      "Bolna bills per minute (platform COGS, see env.bolnaInternalCostInrPerMinute). Keep OFF until pricing/COGS for voice are signed off.",
    complianceSensitive: true,
  },
  notetaker_recall: {
    displayName: "AI Notetaker (Recall.ai)",
    shortDescription:
      "Master switch for the Recall.ai meeting bot that joins live interviews to record, transcribe, and summarise. Default OFF; sits above the per-org notetaker_enabled setting.",
    category: "experimental",
    customerBilling: "usage_meter_ready",
    meterKey: "recall_meeting_session",
    billingNotes:
      "Recall bills per recording hour (~$0.50/hr platform COGS); our Claude summariser adds token cost. Keep OFF until pricing/COGS are signed off. Recording interviews is consent-sensitive (DPDP / two-party).",
    complianceSensitive: true,
  },
  // ── TigerHire Scoring System ────────────────────────────────────────────────
  // One scoring engine. `fitscore_hybrid_v2` is its master switch; the `ff_*`
  // entries below are optional tuning steps (formerly referred to as the "v3
  // cascade"). Flag KEYS are unchanged for DB/code stability — only the
  // human-facing names are unified here so the admin UI reads as one system.
  fitscore_hybrid_v2: {
    displayName: "TigerHire Scoring — core (master switch)",
    shortDescription:
      "The TigerHire scoring engine: role rubric + ideal candidate profile + AI extraction → a 0–100 fit score. Master switch.",
    category: "fitscore",
    customerBilling: "usage_meter_ready",
    meterKey: "fitscore_hybrid_run",
    billingNotes:
      "Each scored application consumes model tokens; see platform_cost_events (Anthropic) and optional customer usage meters.",
  },
  fitscore_hybrid_execution: {
    displayName: "TigerHire Scoring — run in the main scoring path",
    shortDescription:
      "Runs the scoring engine when the main fit-score route scores a candidate (kept aligned with the core switch).",
    category: "fitscore",
    customerBilling: "usage_meter_ready",
    meterKey: "fitscore_hybrid_run",
    billingNotes: "Keep aligned with the core switch; both can affect cost.",
  },
  fitscore_budget_enforcement: {
    displayName: "TigerHire Scoring — budget guardrail",
    shortDescription: "Internal guardrail to cap or throttle expensive scoring batches.",
    category: "fitscore",
    customerBilling: "none",
    billingNotes: "Operational safety, not a SKU.",
  },
  fitscore_prefilter_strict: {
    displayName: "TigerHire Scoring — strict prefilter",
    shortDescription: "Stricter prefilter before LLM-heavy scoring (quality/cost trade-off).",
    category: "fitscore",
    customerBilling: "none",
  },
  // Tuning steps that layer on top of the core scoring switch (the "v3 cascade").
  ff_path_unification: {
    displayName: "TigerHire Scoring — unified extraction path",
    shortDescription:
      "Runs résumé extraction and the fit verdict in a single model call (faster, fewer calls).",
    category: "fitscore",
    customerBilling: "usage_meter_ready",
    meterKey: "fitscore_hybrid_run",
  },
  ff_haiku_extraction: {
    displayName: "TigerHire Scoring — fast extraction model",
    shortDescription:
      "Uses the lighter Haiku model for résumé extraction to lower the cost per scored candidate.",
    category: "fitscore",
    customerBilling: "usage_meter_ready",
    meterKey: "fitscore_hybrid_run",
    billingNotes: "Lower token cost per scored application.",
  },
  ff_cascade_rerank: {
    displayName: "TigerHire Scoring — candidate re-ranking",
    shortDescription:
      "Adds a re-ranking pass that improves the relative ordering of candidates on a job.",
    category: "fitscore",
    customerBilling: "usage_meter_ready",
    meterKey: "fitscore_hybrid_run",
  },
  ff_ctc_tiering: {
    displayName: "TigerHire Scoring — model tiering by CTC",
    shortDescription: "Routes to a larger or smaller model based on the role's compensation band.",
    category: "fitscore",
    customerBilling: "usage_meter_ready",
    meterKey: "fitscore_hybrid_run",
  },
  ff_structured_jd: {
    displayName: "TigerHire Scoring — structured JD parsing",
    shortDescription:
      "Parses the job description into must / need / nice-to-have tiers that feed the rubric.",
    category: "fitscore",
    customerBilling: "none",
  },
  ff_whatsapp_gate: {
    displayName: "TigerHire Scoring — WhatsApp prescreen gate",
    shortDescription:
      "Holds scoring until a WhatsApp prescreen passes. Leave off unless prescreen is wired.",
    category: "fitscore",
    customerBilling: "none",
  },
  fitscore_v5: {
    displayName: "TigerHire Scoring — v5 outcomes-weighted (shadow)",
    shortDescription:
      "Shadow-computes the v5 score — quantified outcomes and behavioural competency as first-class weighted dimensions instead of capped bonuses — into shadow_score for comparison. Does NOT change the live score. Default OFF.",
    category: "experimental",
    customerBilling: "none",
    billingNotes:
      "Reuses the existing extraction, so no extra model cost. Promotion to primary is a separate product/engineering decision.",
  },
  scoring_v2_shadow_enabled: {
    displayName: "FitScore table v2 — shadow persistence (DB flag)",
    shortDescription:
      "Seeded for optional parallel writes to fit_scores_v2; confirm wiring before relying on this toggle.",
    category: "experimental",
    customerBilling: "none",
    billingNotes:
      "Does not remove or replace current primary scoring; product/engineering decision to enable.",
  },
  scoring_v2_primary: {
    displayName: "FitScore table v2 — primary promotion (DB flag)",
    shortDescription:
      "Reserved for a future promotion path; do not enable without engineering and product sign-off.",
    category: "experimental",
    customerBilling: "none",
    billingNotes: "Current production scoring remains authoritative unless explicitly migrated.",
  },
  scoring_phase1_wiring: {
    displayName: "Scoring phase 1 wiring (deprecated)",
    shortDescription: "Deprecated; retained for older environments. Prefer hybrid v2 flags.",
    category: "legacy_seed",
    customerBilling: "none",
  },
  scout_agent: {
    displayName: "Scout agent (CV intake)",
    shortDescription: "CV parsing and scout flows via WhatsApp and related entry points.",
    category: "agents",
    customerBilling: "usage_meter_ready",
    meterKey: "agent_scout_invocation",
    billingNotes: "Usage-shaped; correlate with agent_logs or customer meters.",
  },
  fitscore_agent: {
    displayName: "FitScore agent (legacy seed name)",
    shortDescription: "Historical table seed; may not map 1:1 to current code paths.",
    category: "legacy_seed",
    customerBilling: "platform_cost_only",
    billingNotes: "Prefer fitscore_hybrid_* flags for hybrid v2 behavior.",
  },
  rerank_agent: {
    displayName: "Re-rank agent (legacy seed)",
    shortDescription:
      "Legacy seed for Claude re-rank pass; verify code paths before relying on toggle.",
    category: "legacy_seed",
    customerBilling: "none",
  },
  vouch_agent: {
    displayName: "Vouch agent",
    shortDescription: "Vouch collection and validation via WhatsApp.",
    category: "agents",
    customerBilling: "usage_meter_ready",
    meterKey: "agent_vouch_invocation",
  },
  verify_agent: {
    displayName: "Verify agent",
    shortDescription: "Background verification agent.",
    category: "agents",
    customerBilling: "usage_meter_ready",
    meterKey: "agent_verify_invocation",
  },
  scheduler_agent: {
    displayName: "Scheduler agent",
    shortDescription: "Interview slot scheduling automation.",
    category: "agents",
    customerBilling: "usage_meter_ready",
    meterKey: "agent_scheduler_invocation",
  },
  ghostbuster_authenticity_agent: {
    displayName: "Ghostbuster authenticity (LLM)",
    shortDescription: "AI-authorship and manipulation signals on candidates.",
    category: "agents",
    customerBilling: "usage_meter_ready",
    meterKey: "agent_ghostbuster_llm_invocation",
    billingNotes: "Distinct from heuristic ghostbuster score below.",
  },
  ghostbuster: {
    displayName: "Ghostbuster heuristic (engagement signal)",
    shortDescription: "Heuristic ghost_risk_score — not the LLM authenticity agent.",
    category: "agents",
    customerBilling: "none",
  },
  circular_vouch_depth_3: {
    displayName: "Circular vouch depth-3 block",
    shortDescription: "Blocks depth-3 circular vouch rings (fraud prevention).",
    category: "agents",
    customerBilling: "none",
  },
  ack_notifier_enabled: {
    displayName: "Candidate acknowledgement — master switch",
    shortDescription: "Central notifier for application acknowledgements.",
    category: "acknowledgements",
    customerBilling: "usage_meter_ready",
    meterKey: "ack_notification_sent",
    billingNotes: "Email/WhatsApp provider cost; optional meter for messaging bundles.",
  },
  ack_email_channel_enabled: {
    displayName: "Acknowledgements — email channel",
    shortDescription: "Allow email channel in acknowledgement notifier.",
    category: "acknowledgements",
    customerBilling: "usage_meter_ready",
    meterKey: "ack_email_sent",
  },
  ack_whatsapp_channel_enabled: {
    displayName: "Acknowledgements — WhatsApp channel",
    shortDescription: "Allow WhatsApp channel in acknowledgement notifier.",
    category: "acknowledgements",
    customerBilling: "usage_meter_ready",
    meterKey: "ack_whatsapp_sent",
  },
  ack_logged_in_apply_enabled: {
    displayName: "Acknowledgements — logged-in apply path",
    shortDescription: "Send acknowledgements when a logged-in candidate applies.",
    category: "acknowledgements",
    customerBilling: "none",
  },
  ack_public_apply_enabled: {
    displayName: "Acknowledgements — public apply path",
    shortDescription: "Send acknowledgements on public job apply.",
    category: "acknowledgements",
    customerBilling: "none",
  },
  ack_agency_single_enabled: {
    displayName: "Acknowledgements — agency single upload",
    shortDescription: "Agency single-candidate upload path.",
    category: "acknowledgements",
    customerBilling: "none",
  },
  ack_agency_bulk_enabled: {
    displayName: "Acknowledgements — agency bulk upload",
    shortDescription: "Agency bulk upload path.",
    category: "acknowledgements",
    customerBilling: "none",
  },
  ack_email_intake_enabled: {
    displayName: "Acknowledgements — email intake",
    shortDescription: "Email intake ingestion path for acknowledgements.",
    category: "acknowledgements",
    customerBilling: "none",
  },
  ack_referral_pre_consent_enabled: {
    displayName: "Acknowledgements — referral pre-consent",
    shortDescription: "Referral flow before full consent capture.",
    category: "acknowledgements",
    customerBilling: "none",
  },
  consent_flow: {
    displayName: "Consent flow (DPDP)",
    shortDescription:
      "Legal/consent capture for applicable jurisdictions — do not disable in production without legal review.",
    category: "compliance",
    customerBilling: "none",
    complianceSensitive: true,
  },
  whatsapp_templates: {
    displayName: "WhatsApp approved templates",
    shortDescription: "Use Meta-approved templates for outbound WhatsApp.",
    category: "compliance",
    customerBilling: "none",
    complianceSensitive: true,
  },
  whatsapp_referral_consent_v2: {
    displayName: "WhatsApp referral consent v2",
    shortDescription: "Routes referred candidates through consent capture before CV request.",
    category: "whatsapp",
    customerBilling: "none",
  },
  billing_provider_razorpay: {
    displayName: "Razorpay billing provider",
    shortDescription: "Use Razorpay as payment rail where supported.",
    category: "billing_infra",
    customerBilling: "none",
  },
  agents_run_global: {
    displayName: "Global: Agent runs (entitlement kill switch)",
    shortDescription:
      "When off, organisation agent-run entitlement is denied globally (emergency).",
    category: "entitlements_global",
    customerBilling: "plan_entitlement_related",
    billingNotes: "Pairs with plan feature `agents_run` and organisation_feature_overrides.",
  },
  fitscore_batch_global: {
    displayName: "Global: FitScore batch (entitlement kill switch)",
    shortDescription: "Emergency off for batch FitScore entitlement.",
    category: "entitlements_global",
    customerBilling: "plan_entitlement_related",
  },
  assessments_global: {
    displayName: "Global: Assessments (entitlement kill switch)",
    shortDescription: "Emergency off for assessments module.",
    category: "entitlements_global",
    customerBilling: "plan_entitlement_related",
  },
  offers_global: {
    displayName: "Global: Offers (entitlement kill switch)",
    shortDescription: "Emergency off for offers module.",
    category: "entitlements_global",
    customerBilling: "plan_entitlement_related",
  },
  compensation_bands_global: {
    displayName: "Global: Compensation bands (entitlement kill switch)",
    shortDescription: "Emergency off for compensation bands.",
    category: "entitlements_global",
    customerBilling: "plan_entitlement_related",
  },
  interview_prep_global: {
    displayName: "Global: Interview prep (entitlement kill switch)",
    shortDescription: "Emergency off for interview prep entitlement.",
    category: "entitlements_global",
    customerBilling: "plan_entitlement_related",
  },
  scim_global: {
    displayName: "Global: SCIM (entitlement kill switch)",
    shortDescription: "Emergency off for SCIM provisioning.",
    category: "entitlements_global",
    customerBilling: "plan_entitlement_related",
  },
  employee_portal: {
    displayName: "Employee referral portal",
    shortDescription: "Legacy seed; confirm product usage before toggling.",
    category: "legacy_seed",
    customerBilling: "none",
  },
  salary_arbitrage: {
    displayName: "Salary arbitrage (phase 2)",
    shortDescription: "Legacy seed for future salary recommendation experiments.",
    category: "legacy_seed",
    customerBilling: "none",
  },
  ai_summaries: {
    displayName: "AI summaries on candidate cards",
    shortDescription: "Legacy seed for Claude summaries in UI.",
    category: "legacy_seed",
    customerBilling: "usage_meter_ready",
    meterKey: "ai_summary_generated",
  },
};

function titleCaseKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getFeatureFlagCatalogEntry(key: string): FeatureFlagCatalogEntry | null {
  return FEATURE_FLAG_CATALOG[key] ?? null;
}

export function mergeCatalogOntoFlagRow(row: {
  key: string;
  enabled: boolean;
  description?: string | null;
  updated_at?: string | null;
}) {
  const cat = getFeatureFlagCatalogEntry(row.key);
  const displayName = cat?.displayName ?? titleCaseKey(row.key);
  const catalogDescription = cat?.shortDescription;
  const dbDescription = row.description?.trim() || null;
  return {
    ...row,
    displayName,
    catalog: cat
      ? {
          displayName: cat.displayName,
          shortDescription: cat.shortDescription,
          category: cat.category,
          customerBilling: cat.customerBilling,
          meterKey: cat.meterKey,
          billingNotes: cat.billingNotes,
          complianceSensitive: cat.complianceSensitive ?? false,
        }
      : {
          displayName,
          shortDescription: null as string | null,
          category: "legacy_seed" as FeatureFlagCategory,
          customerBilling: "none" as CustomerBillingRelation,
          meterKey: undefined as string | undefined,
          billingNotes:
            "No catalog entry yet — add to src/lib/feature-flags/catalog.ts for proper naming and billing hints.",
          complianceSensitive: false,
        },
    descriptionForAdmin: [catalogDescription, dbDescription].filter(Boolean).join(" — ") || null,
  };
}

export function sortFlagRowsForAdmin<
  T extends { key: string; catalog?: { category?: FeatureFlagCategory } },
>(rows: T[]): T[] {
  const order: FeatureFlagCategory[] = [
    "compliance",
    "entitlements_global",
    "fitscore",
    "agents",
    "acknowledgements",
    "whatsapp",
    "billing_infra",
    "experimental",
    "legacy_seed",
  ];
  const rank = (c: FeatureFlagCategory | undefined) => {
    const idx = c ? order.indexOf(c) : -1;
    return idx === -1 ? order.length : idx;
  };
  return [...rows].sort((a, b) => {
    const dr = rank(a.catalog?.category) - rank(b.catalog?.category);
    if (dr !== 0) return dr;
    return a.key.localeCompare(b.key);
  });
}
