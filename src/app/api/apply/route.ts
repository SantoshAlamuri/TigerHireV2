import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { OrganisationRepository } from "@/lib/repositories/OrganisationRepository";
import { processPublicApplication, type PublicApplyResult } from "@/lib/agents/public-apply";
import { ensureClaimToken } from "@/lib/candidates/claim-token";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { withIdempotency } from "@/lib/security/idempotency";
import { reportError } from "@/lib/observability/report-error";
import { detectMimeFromBuffer } from "@/lib/services/extract-document-text";
import { ApplicationApplyError } from "@/lib/applications/application-apply-error";
import { z } from "zod";
import {
  screeningAnswersPayloadSchema,
  type ScreeningAnswerItem,
} from "@/lib/screening/job-screening";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";

/** Public apply runs full parse + FitScore in one request when possible. */
export const maxDuration = 180;

const MAX_FILE_SIZE = MAX_STANDARD_UPLOAD_BYTES;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const APPLY_ENDPOINT = "POST /api/apply";
type ApplyOrg = Awaited<ReturnType<typeof OrganisationRepository.getBySlug>>;
const applyFileSchema = z.custom<File>(
  (value) =>
    Boolean(
      value &&
      typeof value === "object" &&
      "name" in value &&
      "type" in value &&
      "size" in value &&
      "arrayBuffer" in value,
    ),
  { message: "Invalid file payload" },
);
const applyBodySchema = z
  .object({
    file: applyFileSchema,
    slug: z.string().trim().min(1),
    jobId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    // Length + character class caps prevent storage bloat and CRLF / header
    // injection if these values ever get embedded in WhatsApp / email templates.
    source: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9._:-]+$/)
      .optional(),
    ref: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9._:-]+$/)
      .optional(),
    whatsappOptIn: z.string().optional(),
  })
  .strict();

/**
 * Stable outcome for the public success screen (honest about parse/score state).
 * Order matters: pending parse beats “no jobs”, etc.
 */
export type PublicApplyOutcome =
  | "scored"
  | "processing"
  | "no_open_roles"
  | "manual_review"
  | "submitted";

function publicApplyOutcome(r: PublicApplyResult): PublicApplyOutcome {
  if (r.parsingPending) return "processing";
  if (r.noOpenJobs) return "no_open_roles";
  if (r.scoringFailed) return "manual_review";
  if (r.jobsScored > 0) return "scored";
  return "submitted";
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  return withIdempotency(request, APPLY_ENDPOINT, async () => {
    try {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
      // Per-IP burst cap (20/min) — catches double-clicks and naive bots.
      const ipBurstRl = await checkRateLimit({
        key: `apply:${ip}`,
        ...RATE_LIMIT_PRESETS.apply,
      });
      if (!ipBurstRl.allowed) {
        return NextResponse.json(
          { error: "Too many applications. Please try again in a minute." },
          { status: 429 },
        );
      }
      // Per-IP daily cap (50/day) — defends against rotating-IP bot farms that
      // would otherwise stay below the burst limit while pinning Claude spend.
      // A real candidate applying to 50 companies a day is highly unusual.
      const ipDailyRl = await checkRateLimit({
        key: `apply:day:${ip}`,
        limit: 50,
        windowSecs: 86_400,
      });
      if (!ipDailyRl.allowed) {
        return NextResponse.json(
          { error: "Daily application limit reached. Please try again tomorrow." },
          { status: 429 },
        );
      }

      const formData = await request.formData();
      const payload = {
        file: formData.get("file"),
        slug: formData.get("slug"),
        jobId: formData.get("jobId") ?? undefined,
        name: formData.get("name") ?? undefined,
        phone: formData.get("phone") ?? undefined,
        email: formData.get("email") ?? undefined,
        source: formData.get("source") ?? undefined,
        ref: formData.get("ref") ?? undefined,
        whatsappOptIn: formData.get("whatsappOptIn")?.toString(),
      };
      const parsed = applyBodySchema.safeParse(payload);
      if (!parsed.success) {
        const missingFile = !payload.file;
        const missingSlug =
          payload.slug == null || (typeof payload.slug === "string" && !payload.slug.trim());
        if (missingFile) {
          return NextResponse.json({ error: "Please upload your resume." }, { status: 400 });
        }
        if (missingSlug) {
          return NextResponse.json({ error: "Organisation not specified." }, { status: 400 });
        }
        return NextResponse.json({ error: "Invalid application payload." }, { status: 400 });
      }
      const {
        file,
        slug,
        jobId,
        name,
        phone,
        email,
        source,
        ref,
        whatsappOptIn: waRaw,
      } = parsed.data;
      const whatsappOptIn: boolean | undefined =
        waRaw === "true" || waRaw === "on" ? true : waRaw === "false" ? false : undefined;

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File too large. Maximum size is 10 MB." },
          { status: 400 },
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const detectedMime = detectMimeFromBuffer(buffer, file.name ?? "");
      if (!detectedMime || !ALLOWED_TYPES.includes(detectedMime)) {
        return NextResponse.json(
          { error: "Please upload a PDF or Word document (.pdf, .doc, .docx)." },
          { status: 400 },
        );
      }

      const supabase = createSupabaseAdmin();
      let org: ApplyOrg = await OrganisationRepository.getBySlug(supabase, slug);
      if (!org && jobId) {
        const { data: jobOrg } = await supabase
          .from("jobs")
          .select(
            "organisation_id, organisations!jobs_organisation_id_fkey(id, type, name, slug, approval, company_plan, stripe_customer_id, created_at, updated_at)",
          )
          .eq("id", jobId)
          .eq("status", "open")
          .eq("list_on_public_job_board", true)
          .eq("is_active", true)
          .maybeSingle();
        const linkedOrg = Array.isArray(
          (jobOrg as { organisations?: unknown } | null)?.organisations,
        )
          ? ((jobOrg as { organisations?: Record<string, unknown>[] } | null)?.organisations?.[0] ??
            null)
          : ((jobOrg as { organisations?: Record<string, unknown> | null } | null)?.organisations ??
            null);
        if (linkedOrg && typeof linkedOrg.slug === "string" && linkedOrg.slug === slug) {
          org = linkedOrg as NonNullable<ApplyOrg>;
        }
      }

      if (!org) {
        return NextResponse.json({ error: "Company not found." }, { status: 404 });
      }

      // Per-org hourly cap (200/hour) — caps the Anthropic spend that any single
      // target organisation can drive through this endpoint, even under
      // distributed bot attack. 200/hour ≈ 4,800/day ≈ $240/day at current
      // Claude resume-parse pricing — high enough not to throttle real demand
      // for a popular role, low enough to fail closed on abuse.
      const slugRl = await checkRateLimit({
        key: `apply:slug:${org.id}`,
        limit: 200,
        windowSecs: 3_600,
      });
      if (!slugRl.allowed) {
        return NextResponse.json(
          { error: "This company is receiving a lot of applications right now. Try again later." },
          { status: 429 },
        );
      }

      const screeningRaw = formData.get("screeningAnswers");
      let screeningAnswers: ScreeningAnswerItem[] | undefined;
      if (screeningRaw != null && String(screeningRaw).trim() !== "") {
        let parsedJ: unknown;
        try {
          parsedJ = JSON.parse(String(screeningRaw));
        } catch {
          return NextResponse.json({ error: "Invalid screening answers." }, { status: 400 });
        }
        const s = screeningAnswersPayloadSchema.safeParse(parsedJ);
        if (!s.success) {
          return NextResponse.json({ error: "Invalid screening answers." }, { status: 400 });
        }
        screeningAnswers = s.data;
      }

      const result = await processPublicApplication({
        fileBuffer: buffer,
        fileName: file.name,
        contentType: detectedMime,
        organisationId: org.id,
        jobId: jobId || undefined,
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        source: source || undefined,
        ref: ref?.trim() || undefined,
        screeningAnswers,
        whatsappOptIn,
      });

      const status = publicApplyOutcome(result);

      // B2.2: hand back a one-time claim token for an unclaimed candidate so the
      // success screen can offer a deterministic "claim your profile" link.
      // Non-fatal — a failure here just falls back to the email-claim path.
      //
      // SECURITY (#331): only mint a token when THIS request created a brand-new
      // candidate. If the apply deduped onto a pre-existing candidate row, that
      // row may belong to someone else; returning its claim token to an
      // unauthenticated caller would let them bind the victim's profile,
      // applications and CV to their own account. Pre-existing candidates recover
      // their profile through the verified email-claim path instead.
      let claimToken: string | null = null;
      if (!result.wasExistingCandidate) {
        try {
          claimToken = await ensureClaimToken(createSupabaseAdmin(), result.candidateId);
        } catch {
          claimToken = null;
        }
      }

      return NextResponse.json({
        success: true,
        candidateName: result.candidateName,
        jobsScored: result.jobsScored,
        topScore: result.topScore,
        status,
        parsingPending: Boolean(result.parsingPending),
        noOpenJobs: Boolean(result.noOpenJobs),
        scoringFailed: Boolean(result.scoringFailed),
        claimToken,
      });
    } catch (err) {
      if (err instanceof ApplicationApplyError) {
        if (err.code === "cooling_off") {
          return NextResponse.json(
            {
              error: err.message,
              code: "cooling_off",
              retryAfter: err.retryAfterIso,
              retryAfterIso: err.retryAfterIso,
            },
            { status: 403 },
          );
        }
        if (err.code === "public_apply_invalid_target" || err.code === "screening_incomplete") {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        if (err.code === "screening_not_passed") {
          return NextResponse.json({ error: err.message }, { status: 403 });
        }
      }
      reportError(err, { route: APPLY_ENDPOINT });
      return NextResponse.json(
        {
          error: "Something went wrong processing your application. Please try again.",
        },
        { status: 500 },
      );
    }
  });
}
