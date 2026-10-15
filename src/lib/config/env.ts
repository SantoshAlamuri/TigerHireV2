import { z } from "zod";

/** Server-only required vars (validated in production at runtime). */
const envServerSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
    CRON_SECRET: z.string().optional(),
    CRON_SECRET_HASH: z.string().optional(),
    ADZUNA_APP_ID: z.string().optional(),
    ADZUNA_APP_KEY: z.string().optional(),
    RAPIDAPI_KEY: z.string().optional(),
    SYNC_SECRET: z.string().optional(),
    JOBS_AGGREGATED_ORG_ID: z.string().uuid().optional(),
    JOBS_AGGREGATED_ORG_SLUG: z.string().optional(),
    INNGEST_EVENT_KEY: z.string().optional(),
    BOLNA_API_KEY: z.string().optional(),
    BOLNA_WEBHOOK_SECRET: z.string().optional(),
    BOLNA_WEBHOOK_FALLBACK_SECRET: z.string().optional(),
    BOLNA_AGENT_ID: z.string().optional(),
    BOLNA_FROM_PHONE_NUMBER: z.string().optional(),
    SCREENING_BILLING_CRON_SECRET: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.CRON_SECRET && data.CRON_SECRET.length > 0) ||
      (data.CRON_SECRET_HASH && data.CRON_SECRET_HASH.length > 0),
    { message: "Either CRON_SECRET or CRON_SECRET_HASH is required" },
  )
  .refine(
    (data) => {
      // Adzuna: both or neither (optional in dev, required in prod if distribution is enabled)
      const hasAdzunaId = data.ADZUNA_APP_ID && data.ADZUNA_APP_ID.length > 0;
      const hasAdzunaKey = data.ADZUNA_APP_KEY && data.ADZUNA_APP_KEY.length > 0;
      return hasAdzunaId === hasAdzunaKey;
    },
    { message: "ADZUNA_APP_ID and ADZUNA_APP_KEY must both be set or both be empty" },
  )
  .refine(
    (data) => {
      const from = (data.BOLNA_FROM_PHONE_NUMBER ?? "").trim();
      if (!from) return true;
      return /^\+\d{10,15}$/.test(from);
    },
    { message: "BOLNA_FROM_PHONE_NUMBER must be E.164 (example: +919876543210)" },
  );

/** Build-time required vars only. */
const envBuildSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    if (process.env.NODE_ENV === "test") return `test-${name}`;
    return "";
  }
  return value;
}

/**
 * Validate that all required env vars are set. Call once at startup in
 * production to fail fast. Uses Zod for schema validation and clear errors.
 */
/**
 * When real outbound is enabled in production, Meta WhatsApp config must be present
 * (launch plan: fail fast instead of silent drops).
 */
export function validateWhatsappForProductionOutbound(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.OUTBOUND_NOTIFICATIONS_ENABLED !== "true") return;

  const phone = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  const verify = (process.env.WHATSAPP_WEBHOOK_SECRET ?? "").trim();
  const appSecret =
    (process.env.WHATSAPP_META_APP_SECRET ?? "").trim() ||
    (process.env.META_APP_SECRET ?? "").trim();
  const missing: string[] = [];
  if (!phone) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!token) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!verify) missing.push("WHATSAPP_WEBHOOK_SECRET (hub verify token)");
  if (!appSecret) missing.push("WHATSAPP_META_APP_SECRET (webhook HMAC)");
  if (missing.length > 0) {
    throw new Error(
      `OUTBOUND_NOTIFICATIONS_ENABLED=true but WhatsApp is not fully configured. Missing: ${missing.join(", ")}`,
    );
  }
}

export function validateEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const schema = isBuildPhase ? envBuildSchema : envServerSchema;
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const { fieldErrors, formErrors } = result.error.flatten();
    const fieldPart = Object.entries(fieldErrors)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("; ");
    // The schema-level .refine() rules above (CRON_SECRET/CRON_SECRET_HASH,
    // Adzuna pairing and Bolna number format) report through formErrors, NOT fieldErrors.
    // Reading only fieldErrors meant a refinement failure threw
    // "Environment validation failed: " with nothing after the colon — the whole
    // server refuses to boot and the log names nothing. This crashed production
    // on 2026-09-13 and the message was no help in diagnosing it.
    const formPart = formErrors.join("; ");
    const flat = [fieldPart, formPart].filter(Boolean).join("; ") || "(no details reported)";
    throw new Error(`Environment validation failed: ${flat}`);
  }

  if (!isBuildPhase) {
    validateWhatsappForProductionOutbound();
    // Voice is optional. Provisioning the API key/agent before buying a number
    // must not prevent unrelated hiring routes from starting. The outbound
    // integration still refuses production calls without a valid from-number.
    if (
      ((process.env.BOLNA_API_KEY ?? "").trim() || (process.env.BOLNA_AGENT_ID ?? "").trim()) &&
      !(process.env.BOLNA_FROM_PHONE_NUMBER ?? "").trim()
    ) {
      console.warn(
        "[STARTUP] bolna_voice_unavailable: outbound voice calls are unavailable until BOLNA_FROM_PHONE_NUMBER is configured.",
      );
    }
    // The outbound hold suppresses EVERY transactional email (invites, offer
    // letters, interview invites, OTP codes). It is a deploy misconfiguration,
    // not a runtime mode, and it used to be discoverable only by noticing that
    // nobody received anything. Make it loud at boot.
    if (env.isProductionOutboundHold) {
      console.error(
        "[STARTUP] OUTBOUND_NOTIFICATIONS_ENABLED is not set on a production deployment — " +
          "all transactional email is suppressed. Set it to 'true' before serving users.",
      );
    }
  }
}

/**
 * Vercel deployment environment.
 * - "production" → main branch deploy (tigerhire.io)
 * - "preview"    → dev / feature branch deploy (*.vercel.app)
 * - "development" → local dev server
 *
 * Vercel auto-sets VERCEL_ENV; locally we fall back to NODE_ENV.
 */
export type VercelEnv = "production" | "preview" | "development";

export function getVercelEnv(): VercelEnv {
  const v = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  if (v === "production") return "production";
  if (v === "preview") return "preview";
  return "development";
}

/**
 * Inbound email clients (e.g. Gmail) cannot fetch images from localhost or plain HTTP.
 * Use a public HTTPS origin for /public assets in HTML emails.
 * Override with EMAIL_LOGO_BASE_URL (e.g. https://tigerhire.io or a CDN).
 */
export function resolveEmailAssetBaseUrl(appBase: string): string {
  const override = (process.env.EMAIL_LOGO_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (override) return override;
  const normalized = appBase.replace(/\/$/, "");
  try {
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (isLoopback || u.protocol !== "https:") {
      return "https://tigerhire.io";
    }
  } catch {
    return "https://tigerhire.io";
  }
  return normalized;
}

export const env = {
  /** Current Vercel deployment environment. */
  get vercelEnv(): VercelEnv {
    return getVercelEnv();
  },
  /** True only on the production deployment (main branch). */
  get isProduction(): boolean {
    return getVercelEnv() === "production";
  },
  /** True on preview deployments (dev branch, PRs, feature branches). */
  get isPreview(): boolean {
    return getVercelEnv() === "preview";
  },
  /** True on local dev server. */
  get isDevelopment(): boolean {
    return getVercelEnv() === "development";
  },
  get supabaseUrl() {
    return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY ?? "";
  },
  get stripePublishableKey() {
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  },
  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET ?? "";
  },
  get razorpayKeyId() {
    return process.env.RAZORPAY_KEY_ID ?? "";
  },
  get razorpayKeySecret() {
    return process.env.RAZORPAY_KEY_SECRET ?? "";
  },
  get razorpayWebhookSecret() {
    return process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  },
  get billingDefaultProvider(): "stripe" | "razorpay" {
    const provider = (process.env.BILLING_DEFAULT_PROVIDER ?? "razorpay").trim().toLowerCase();
    return provider === "stripe" ? "stripe" : "razorpay";
  },
  get billingForceStripe(): boolean {
    return process.env.BILLING_FORCE_STRIPE === "true";
  },
  /**
   * Optional enterprise override: organisations in this CSV can consume manual unlock credits
   * even after the plan monthly unlock cap is reached.
   */
  get manualUnlockCapBypassOrgIds(): string[] {
    const raw = process.env.MANUAL_UNLOCK_CAP_BYPASS_ORG_IDS ?? "";
    if (!raw.trim()) return [];
    return Array.from(
      new Set(
        raw
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    );
  },
  get anthropicApiKey() {
    const exact = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_KEY ?? "";
    if (typeof exact === "string" && exact.trim().length > 0) return exact.trim();
    // Fallback: .env sometimes has BOM or alternate names; find any key that looks like Anthropic
    for (const key of Object.keys(process.env)) {
      const k = key.replace(/^\uFEFF/, "").trim();
      if ((k === "ANTHROPIC_API_KEY" || k === "ANTHROPIC_KEY") && process.env[key]) {
        const v = process.env[key];
        if (typeof v === "string" && v.trim().length > 0) return v.trim();
      }
    }
    return "";
  },
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY ?? "";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get resendFromEmail() {
    return process.env.RESEND_FROM_EMAIL ?? "noreply@app.tigerhire.io";
  },
  /**
   * Optional absolute URL to a logo (PNG is most compatible; SVG works in many clients when hosted on HTTPS).
   * Otherwise: logo-light.svg on resolveEmailAssetBaseUrl(NEXT_PUBLIC_APP_URL) so local dev does not use localhost in img src.
   */
  get emailBrandingLogoUrl() {
    const u = (process.env.EMAIL_BRAND_LOGO_URL ?? "").trim();
    if (u) return u;
    const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io").replace(/\/$/, "");
    const base = resolveEmailAssetBaseUrl(appBase);
    return `${base}/logo-light.svg`;
  },
  /**
   * When EMAIL_MODE=sandbox, outbound email is logged and skipped (no Resend call).
   * Pair with Resend test API key (re_test_...) for beta: test key still hits Resend without delivery.
   */
  get emailSandbox(): boolean {
    return process.env.EMAIL_MODE?.toLowerCase() === "sandbox";
  },
  /** Cron auth: prefer CRON_SECRET_HASH in production so raw secret never appears in logs. */
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get cronSecretHash() {
    return process.env.CRON_SECRET_HASH ?? "";
  },
  get apifyApiToken() {
    return process.env.APIFY_API_TOKEN ?? "";
  },
  /** Meta WhatsApp Cloud API phone number id (path param in /{phone-number-id}/messages). */
  get whatsappPhoneNumberId() {
    return process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  },
  get whatsappWebhookSecret() {
    return (process.env.WHATSAPP_WEBHOOK_SECRET ?? "").trim();
  },
  /**
   * HMAC key for inbound POST `x-hub-signature-256`.
   * Meta WhatsApp Cloud API signs the raw body with the **App Secret** (App → Settings → Basic), not the webhook verify token.
   * Set `WHATSAPP_META_APP_SECRET` (or `META_APP_SECRET`) to match; if unset, falls back to `WHATSAPP_WEBHOOK_SECRET` for BSPs that reuse one secret.
   */
  get whatsappWebhookSignatureSecret() {
    const meta =
      process.env.WHATSAPP_META_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
    if (meta) return meta;
    return (process.env.WHATSAPP_WEBHOOK_SECRET ?? "").trim();
  },
  /** Meta WhatsApp Cloud API token (Bearer). */
  get whatsappAccessToken() {
    return process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  },
  /**
   * Phone number id of the dedicated partner-intake WhatsApp number (Apna resume
   * forwarding). Messages arriving on this number bypass the candidate bot entirely
   * and land in whatsapp_intake_items. Empty = intake number not provisioned; all
   * traffic is treated as candidate traffic.
   */
  get whatsappIntakePhoneNumberId() {
    return (process.env.WHATSAPP_INTAKE_PHONE_NUMBER_ID ?? "").trim();
  },
  /** When WHATSAPP_MODE=sandbox, WhatsApp Cloud API sends are logged and skipped. */
  get whatsappSandbox(): boolean {
    return process.env.WHATSAPP_MODE?.toLowerCase() === "sandbox";
  },
  /**
   * Digits-only default country calling code for Meta `to` when OTP is sent with exactly 10 digits
   * (e.g. `91` for India). Used by referrer OTP only; leave unset for multi-country or when all UIs
   * already send full international numbers. See docs/WHATSAPP_OUTBOUND_TROUBLESHOOTING.md.
   */
  get whatsappOtpDefaultCountryCode(): string {
    return (process.env.WHATSAPP_OTP_DEFAULT_COUNTRY_CODE ?? "").trim().replace(/\D/g, "");
  },
  /**
   * Meta WhatsApp **template name** for the pre-screening link (3 body params: first name, job, URL).
   * Must match the approved template in Meta; override if your WABA uses a different name.
   */
  get whatsappScreeningTemplateName(): string {
    const n = (process.env.WHATSAPP_SCREENING_TEMPLATE_NAME ?? "").trim();
    return n || "screening_questions";
  },
  /**
   * Vercel **production** only: set `OUTBOUND_NOTIFICATIONS_ENABLED=true` to allow real email and WhatsApp.
   * Until then, all outbound notifications are logged and skipped (same as a global hold).
   * Preview and local dev ignore this — use EMAIL_MODE / WHATSAPP_MODE=sandbox there if needed.
   */
  get outboundNotificationsEnabled(): boolean {
    return process.env.OUTBOUND_NOTIFICATIONS_ENABLED === "true";
  },
  /** True on production deployment when outbound notifications are not explicitly enabled. */
  get isProductionOutboundHold(): boolean {
    return getVercelEnv() === "production" && process.env.OUTBOUND_NOTIFICATIONS_ENABLED !== "true";
  },
  /** App origin for links/redirects; always without trailing slash to avoid double slashes when concatenating. */
  get baseUrl() {
    const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io";
    return url.replace(/\/$/, "");
  },
  /** When set with GOOGLE_CLIENT_SECRET, OAuth uses our callback so Google shows tigerhire.io */
  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET ?? "";
  },
  get redisRestUrl() {
    return process.env.UPSTASH_REDIS_REST_URL ?? "";
  },
  get redisRestToken() {
    return process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  },
  /** FitScore peer review: when true, Sonnet first pass then Opus in 50-85 band. */
  get fitScorePeerReviewEnabled() {
    return process.env.FITSCORE_PEER_REVIEW_ENABLED === "true";
  },
  /** Ambiguous band min (inclusive). Peer review runs when pass1 score in [min, max]. */
  get fitScorePeerReviewBandMin() {
    const v = process.env.FITSCORE_PEER_REVIEW_BAND_MIN;
    const n = v ? parseInt(v, 10) : 50;
    return Number.isFinite(n) ? n : 50;
  },
  get fitScorePeerReviewBandMax() {
    const v = process.env.FITSCORE_PEER_REVIEW_BAND_MAX;
    const n = v ? parseInt(v, 10) : 85;
    return Number.isFinite(n) ? n : 85;
  },
  /** Above this |pass1 - pass2|, set confidence low and human_review_required. */
  get fitScorePeerReviewDivergenceThreshold() {
    const v = process.env.FITSCORE_PEER_REVIEW_DIVERGENCE_THRESHOLD;
    const n = v ? parseInt(v, 10) : 15;
    return Number.isFinite(n) ? n : 15;
  },
  /** When finalScore in [min, max] (inclusive), set human_review_required. e.g. "70,75". */
  get fitScoreHumanReviewScoreBand(): [number, number] {
    const v = process.env.FITSCORE_HUMAN_REVIEW_SCORE_BAND ?? "70,75";
    const [a, b] = v.split(",").map((s) => parseInt(s.trim(), 10));
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
    return [70, 75];
  },
  /** FitScore batch scoring concurrency gate for candidate-level LLM calls. */
  get fitscoreBatchConcurrency(): number {
    const raw = process.env.FITSCORE_BATCH_CONCURRENCY;
    const parsed = raw ? Number(raw) : 5;
    if (!Number.isFinite(parsed)) return 5;
    return Math.max(1, Math.min(20, Math.floor(parsed)));
  },
  /** Allow fallback to global env vars for job board credentials (for migration period only). */
  get allowJobBoardGlobalFallback(): boolean {
    return process.env.ALLOW_JOB_BOARD_GLOBAL_FALLBACK === "true";
  },
  get adzunaAppId() {
    return process.env.ADZUNA_APP_ID ?? "";
  },
  get adzunaAppKey() {
    return process.env.ADZUNA_APP_KEY ?? "";
  },
  get rapidApiKey() {
    return process.env.RAPIDAPI_KEY ?? "";
  },
  get syncSecret() {
    return process.env.SYNC_SECRET ?? "";
  },
  get jobsAggregatedOrgId() {
    return process.env.JOBS_AGGREGATED_ORG_ID ?? "";
  },
  get jobsAggregatedOrgSlug() {
    return (process.env.JOBS_AGGREGATED_ORG_SLUG ?? "tigerhire-aggregated").trim();
  },
  /**
   * Org slugs hidden from public/candidate job feeds.
   * - CSV in env: HIDDEN_PUBLIC_JOB_ORG_SLUGS=slug-a,slug-b
   * - Production default hides demo seed orgs.
   */
  get hiddenPublicJobOrgSlugs(): string[] {
    const raw = process.env.HIDDEN_PUBLIC_JOB_ORG_SLUGS ?? "";
    const parsed = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    if (parsed.length > 0) return Array.from(new Set(parsed));
    if (getVercelEnv() === "production") {
      return ["finstack", "talentbridge"];
    }
    return [];
  },
  get inngestEventKey() {
    return process.env.INNGEST_EVENT_KEY ?? "";
  },
  get bolnaApiKey() {
    return process.env.BOLNA_API_KEY ?? "";
  },
  get bolnaWebhookSecret() {
    return process.env.BOLNA_WEBHOOK_SECRET ?? "";
  },
  get bolnaWebhookFallbackSecret() {
    return process.env.BOLNA_WEBHOOK_FALLBACK_SECRET ?? "";
  },
  get bolnaAgentId() {
    return process.env.BOLNA_AGENT_ID ?? "";
  },
  get bolnaFromPhoneNumber() {
    return process.env.BOLNA_FROM_PHONE_NUMBER ?? "";
  },
  /**
   * Internal COGS estimate (INR per billed minute, after ceil(duration/60)) written to
   * `screening_jobs.cost_inr` on Bolna completion. Customer charge is separate (RPC free tier + 99 INR).
   * Default 6 aligns with typical Bolna usage rates; override if your contract differs.
   */
  get bolnaInternalCostInrPerMinute(): number {
    const raw = (process.env.BOLNA_INTERNAL_COST_INR_PER_MINUTE ?? "").trim();
    if (!raw) return 6;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 6;
  },
  get screeningBillingCronSecret() {
    return process.env.SCREENING_BILLING_CRON_SECRET ?? "";
  },
  // --- Recall.ai AI notetaker (one platform key serves all orgs; bots join via the public link) ---
  get recallApiKey() {
    return process.env.RECALL_API_KEY ?? "";
  },
  /** Regional API host, e.g. https://us-west-2.recall.ai (Pay-as-you-go region). */
  get recallBaseUrl() {
    return (process.env.RECALL_BASE_URL ?? "https://us-west-2.recall.ai").replace(/\/$/, "");
  },
  /** Svix-style signing secret (whsec_...) used to verify Recall webhook payloads. */
  get recallWebhookSecret() {
    return process.env.RECALL_WEBHOOK_SECRET ?? "";
  },
  /** Optional shared-secret fallback header for Recall webhooks (dev/staging convenience). */
  get recallWebhookFallbackSecret() {
    return process.env.RECALL_WEBHOOK_FALLBACK_SECRET ?? "";
  },
  /**
   * Internal COGS estimate (USD per recording hour) written to interview_recordings.cost_usd.
   * Default 0.50 aligns with Recall Pay-as-you-go ($0.50/hr, prorated). Override per contract.
   */
  get recallInternalCostUsdPerHour(): number {
    const raw = (process.env.RECALL_INTERNAL_COST_USD_PER_HOUR ?? "").trim();
    if (!raw) return 0.5;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0.5;
  },
  /** USD→INR conversion used only for the notetaker monthly-cap guardrail. */
  get usdToInrRate(): number {
    const raw = (process.env.USD_TO_INR_RATE ?? "").trim();
    if (!raw) return 85;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 85;
  },
  get vercelApiToken() {
    return process.env.VERCEL_API_TOKEN ?? "";
  },
  get vercelTeamId() {
    return process.env.VERCEL_TEAM_ID ?? "";
  },
  get vercelTeamSlug() {
    return process.env.VERCEL_TEAM_SLUG ?? "";
  },
  get supabaseManagementToken() {
    return process.env.SUPABASE_MANAGEMENT_TOKEN ?? "";
  },
  get supabaseProjectRef() {
    return process.env.SUPABASE_PROJECT_REF ?? "";
  },
  get supabaseUsdPerMillionRequests() {
    const raw = process.env.SUPABASE_USD_PER_MILLION_REQUESTS;
    const parsed = raw ? Number(raw) : 2.5;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2.5;
  },
  get anthropicAdminApiKey() {
    return process.env.ANTHROPIC_ADMIN_API_KEY ?? "";
  },
  /**
   * Meta WhatsApp Business Account (WABA) id — required to call the Graph API
   * `pricing_analytics` / `conversation_analytics` endpoints used by platform
   * cost sync. NOT the same as `WHATSAPP_PHONE_NUMBER_ID`. Accepts the legacy
   * `WHATSAPP_WABA_ID` (existing convention) as a fallback.
   */
  get metaWabaId() {
    return (
      process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ??
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ??
      process.env.WHATSAPP_WABA_ID ??
      ""
    );
  },
  /** Meta Graph API access token used for billing analytics (falls back to outbound WhatsApp token). */
  get metaGraphAccessToken() {
    return process.env.META_GRAPH_ACCESS_TOKEN ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  },
  /** Graph API version pin for cost sync calls (default v21.0). */
  get metaGraphApiVersion() {
    return (process.env.META_GRAPH_API_VERSION ?? "v21.0").trim();
  },
  /**
   * Per-conversation USD fallback rates used when the Graph
   * `pricing_analytics` payload omits explicit costs (Meta only emits cost in
   * some markets/billing tiers). Source: Meta WhatsApp Pricing → tune for your
   * primary geography or set per-category overrides.
   */
  get metaWhatsappUsdPerConversation() {
    const fromEnv = (key: string, fallback: number): number => {
      const raw = process.env[key];
      if (!raw) return fallback;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    return {
      marketing: fromEnv("META_WHATSAPP_USD_PER_MARKETING_CONVO", 0.025),
      utility: fromEnv("META_WHATSAPP_USD_PER_UTILITY_CONVO", 0.005),
      authentication: fromEnv("META_WHATSAPP_USD_PER_AUTH_CONVO", 0.005),
      service: fromEnv("META_WHATSAPP_USD_PER_SERVICE_CONVO", 0.0),
    } as const;
  },
  /**
   * FitScore Stage 2: hybrid two-step (CVFacts extraction + deterministic grading).
   * Default ON. Set USE_HYBRID_STAGE2=false to use legacy single-call Haiku grading (v1.1).
   */
  get useHybridStage2(): boolean {
    return process.env.USE_HYBRID_STAGE2 !== "false";
  },
  /**
   * Rollout switch for showing structured CV evidence quotes on verdict cards.
   * Can be controlled by private server var and/or NEXT_PUBLIC var.
   */
  get ffVerdictCvEvidence(): boolean {
    const server = process.env.FF_VERDICT_CV_EVIDENCE;
    const client = process.env.NEXT_PUBLIC_FF_VERDICT_CV_EVIDENCE;
    return server !== "false" && client !== "false";
  },
  /**
   * Rollout switch for showing confidence band in recruiter-facing score surfaces.
   * Can be controlled by private server var and/or NEXT_PUBLIC var.
   */
  get ffConfidenceBand(): boolean {
    const server = process.env.FF_CONFIDENCE_BAND;
    const client = process.env.NEXT_PUBLIC_FF_CONFIDENCE_BAND;
    return server !== "false" && client !== "false";
  },
  /**
   * Interview scheduling v1: profile-linked interviewer picker + round ladder in recruit UI.
   * Default ON in non-production; in production requires explicit FF_ or NEXT_PUBLIC_FF_ "true".
   *
   * Coupling: in production the **browser** only reads `NEXT_PUBLIC_FF_*`; this getter also
   * honors `FF_*` so server routes can be toggled independently. For rollout, set both to the
   * same intent so POST validation, `GET .../interviewer-profile-options`, and client UI agree
   * (see `.env.example` and README).
   */
  get ffInterviewerIdentityV1(): boolean {
    const server = process.env.FF_INTERVIEWER_IDENTITY_V1;
    const client = process.env.NEXT_PUBLIC_FF_INTERVIEWER_IDENTITY_V1;
    if (process.env.NODE_ENV === "production") {
      return server === "true" || client === "true";
    }
    return server !== "false" && client !== "false";
  },
  /**
   * Brief 11: plan-first job workspace (Plan document + Candidates tabs).
   * Default OFF in production until explicitly enabled.
   */
  get ffPlanDocument(): boolean {
    const server = process.env.FF_PLAN_DOCUMENT;
    const client = process.env.NEXT_PUBLIC_FF_PLAN_DOCUMENT;
    if (process.env.NODE_ENV === "production") {
      return server === "true" || client === "true";
    }
    return server === "true" || client === "true";
  },
  /** Brief 11 Phase C: auto-fire comms and slot picker on plan stage entry (requires ffPlanDocument). */
  get ffPlanAutoExecute(): boolean {
    if (!this.ffPlanDocument) return false;
    const server = process.env.FF_PLAN_AUTO_EXECUTE;
    const client = process.env.NEXT_PUBLIC_FF_PLAN_AUTO_EXECUTE;
    if (process.env.NODE_ENV === "production") {
      return server === "true" || client === "true";
    }
    return server === "true" || client === "true";
  },
  /**
   * When true, `extractCVFactsStructured` may be used (OpenAI). Default false — Stage 2A uses Haiku → Sonnet only.
   */
  get openaiFitscoreEnabled(): boolean {
    return process.env.OPENAI_FITSCORE_ENABLED === "true";
  },
  /**
   * A15/A14: HMAC signing for public offer OTP + session cookie.
   * Set explicitly in production; falls back to service role prefix in dev/test only.
   */
  get offerPublicLinkSecret(): string {
    const explicit = process.env.OFFER_PUBLIC_LINK_SECRET?.trim();
    if (explicit) return explicit;
    if (process.env.NODE_ENV === "test") return "test-offer-public-link-secret";
    const srk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (srk) return srk;
    return "dev-offer-public-link-secret";
  },
  /** A14: optional; defaults to `offerPublicLinkSecret` so one secret can cover A15 + email approvals. */
  get approvalDeepLinkSecret(): string {
    const explicit = process.env.APPROVAL_DEEP_LINK_SECRET?.trim();
    if (explicit) return explicit;
    return env.offerPublicLinkSecret;
  },
  /**
   * B8 escape hatch: allow `POST /api/offers` when the job has no linked hiring requisition or the
   * requisition is not yet approved/converted. **Do not enable in production** unless migrating legacy data.
   */
  get offerSkipHiringRequestLinkGate(): boolean {
    return process.env.OFFER_SKIP_HIRING_REQUEST_LINK_GATE === "true";
  },
  /** Verify agent guardrail: max Claude calls per candidate invocation. */
  get verifyMaxClaudeCallsPerCandidate(): number {
    const raw = process.env.VERIFY_MAX_CLAUDE_CALLS_PER_CANDIDATE;
    const parsed = raw ? Number(raw) : 2;
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 2;
  },
  /** Verify agent guardrail: rough max Claude tokens consumed per candidate invocation. */
  get verifyMaxClaudeTokensPerCandidate(): number {
    const raw = process.env.VERIFY_MAX_CLAUDE_TOKENS_PER_CANDIDATE;
    const parsed = raw ? Number(raw) : 2500;
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 2500;
  },
  /** Candidate Authenticity Check guardrail: max Claude calls per candidate invocation. */
  get ghostbusterMaxClaudeCallsPerCandidate(): number {
    const raw = process.env.GHOSTBUSTER_MAX_CLAUDE_CALLS_PER_CANDIDATE;
    const parsed = raw ? Number(raw) : 1;
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 1;
  },
  /** Candidate Authenticity Check guardrail: rough max Claude tokens per candidate invocation. */
  get ghostbusterMaxClaudeTokensPerCandidate(): number {
    const raw = process.env.GHOSTBUSTER_MAX_CLAUDE_TOKENS_PER_CANDIDATE;
    const parsed = raw ? Number(raw) : 2000;
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 2000;
  },
  /** WhatsApp referral abuse guard: max referrals per referrer identity per 24h. Set <= 0 to disable. */
  get referralDailyCap(): number {
    const raw = process.env.REFERRAL_DAILY_CAP;
    const parsed = raw ? Number(raw) : 20;
    return Number.isFinite(parsed) ? Math.floor(parsed) : 20;
  },
  /** Rolling dedup window for same (referrer, target_phone) referral attempts. Set <= 0 to disable. */
  get referralTargetDedupWindowHours(): number {
    const raw = process.env.REFERRAL_TARGET_DEDUP_WINDOW_HOURS;
    const parsed = raw ? Number(raw) : 24;
    return Number.isFinite(parsed) ? Math.floor(parsed) : 24;
  },
  /** OTP send throttle (primary): per phone number. */
  get referOtpSendPhoneLimit(): number {
    const raw = process.env.REFER_OTP_SEND_PHONE_LIMIT;
    const parsed = raw ? Number(raw) : 3;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
  },
  get referOtpSendPhoneWindowSecs(): number {
    const raw = process.env.REFER_OTP_SEND_PHONE_WINDOW_SECS;
    const parsed = raw ? Number(raw) : 3600;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3600;
  },
  /** OTP send throttle (secondary): per source IP guardrail. */
  get referOtpSendIpLimit(): number {
    const raw = process.env.REFER_OTP_SEND_IP_LIMIT;
    const parsed = raw ? Number(raw) : 20;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 20;
  },
  get referOtpSendIpWindowSecs(): number {
    const raw = process.env.REFER_OTP_SEND_IP_WINDOW_SECS;
    const parsed = raw ? Number(raw) : 60;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 60;
  },
  /**
   * SpringVerify India background verification (https://in.springverify.com/api-integrations).
   * Create-case URL (prod): https://api-sa.in.springverify.com/external/v1/candidate/add
   * (stage: https://api-acceptance-2-sa.in.springverify.com). API key = dashboard-generated
   * token (SpringVerify → Settings → API → Generate token), sent as `Authorization: Bearer`.
   * See docs/ops/integration-golive-runbooks.md → "SpringVerify BGV".
   */
  get springverifyApiKey() {
    return process.env.SPRINGVERIFY_API_KEY ?? "";
  },
  get springverifyCreateCaseUrl() {
    return process.env.SPRINGVERIFY_CREATE_CASE_URL ?? "";
  },
  /** Account-specific BGV package id (GET {base}/external/v1/candidate/packages). Optional. */
  get springverifyPackageId(): number | null {
    const raw = process.env.SPRINGVERIFY_PACKAGE_ID?.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
  /** Subtype id within the configured SpringVerify package. Optional (pairs with package id). */
  get springverifySubtypeId(): number | null {
    const raw = process.env.SPRINGVERIFY_SUBTYPE_ID?.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
  /** Shared secret for POST /api/webhooks/springverify (send a matching header from SpringVerify or a reverse proxy). */
  get springverifyWebhookSecret() {
    return process.env.SPRINGVERIFY_WEBHOOK_SECRET ?? "";
  },
  /** idibu job board aggregator — webhook validation secret. */
  get idibuWebhookSecret() {
    return process.env.IDIBU_WEBHOOK_SECRET ?? "";
  },
  /** idibu developer app id (iframe POST `id` field). */
  get idibuAppId() {
    return process.env.IDIBU_APP_ID ?? "";
  },
  /** idibu developer app secret (server-side iframe POST only). */
  get idibuAppSecret() {
    return process.env.IDIBU_APP_SECRET ?? "";
  },
  /** idibu integration slug assigned by idibu (e.g. tigerhire). */
  get idibuIntegrationName() {
    return process.env.IDIBU_INTEGRATION_NAME ?? "";
  },
  /** Default idibu sector id when role_category is unmapped. */
  get idibuDefaultSector() {
    return process.env.IDIBU_DEFAULT_SECTOR ?? "1";
  },
} as const;
