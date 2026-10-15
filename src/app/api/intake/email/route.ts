import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { withIdempotency } from "@/lib/security/idempotency";
import { savePublicApplication } from "@/lib/agents/public-apply";
import { logger } from "@/lib/observability/logger";
import { notifyCvIngestedFromEmailIntake } from "@/lib/acknowledgements/email-intake";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { enqueue } from "@/lib/jobs/queue";
import { enqueuePendingJdApprovalPair, isJdBaseApproved } from "@/lib/fitscore/pending-jd-approval";
import { checkScoringGuard } from "@/lib/prescreen/scoring-guard";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { startCanonicalScreeningCollectionBestEffort } from "@/lib/whatsapp/screening-qa-flow";
import { detectMimeFromBuffer } from "@/lib/services/extract-document-text";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";

const INTAKE_ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

/**
 * A resume arriving by email is forwarded by a third party, so the `from`
 * address is attacker-controllable. Treat a delivery as sender-verified only
 * when the mail provider reports a passing DKIM/SPF verdict. An explicit
 * failing verdict is rejected outright; an absent verdict is allowed but logged
 * (older Resend inbound payloads omit it) — never overwrite a known candidate's
 * data on an unverified delivery.
 */
function isFailingVerdict(v: string | undefined): boolean {
  if (!v) return false;
  const n = v.trim().toLowerCase();
  return n === "fail" || n === "softfail" || n === "none" || n === "permerror";
}

const EMAIL_INTAKE_ENDPOINT = "POST /api/intake/email";
// Accept any intake domain (in.tigerhire.io live, .com legacy) — job id is the routing key.
const ADDRESS_JOB_PATTERN = /jobs\+([0-9a-f-]{36})@/i;

const emailIntakeSchema = z
  .object({
    to: z.string().trim().min(1),
    from: z.string().trim().email().optional(),
    subject: z.string().trim().optional(),
    text: z.string().trim().optional(),
    name: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().email().optional(),
    slug: z.string().trim().optional(),
    jobId: z.string().uuid().optional(),
    resumeBase64: z.string().trim().min(1),
    fileName: z.string().trim().optional(),
    contentType: z.string().trim().optional(),
    // Sender-authentication verdicts, when the mail provider supplies them.
    spf: z.string().trim().optional(),
    dkim: z.string().trim().optional(),
    spfVerdict: z.string().trim().optional(),
    dkimVerdict: z.string().trim().optional(),
  })
  .strict();

function extractJobIdFromAddress(address: string): string | null {
  const match = address.match(ADDRESS_JOB_PATTERN);
  return match?.[1] ?? null;
}

function decodeBase64File(payload: string): Buffer {
  const cleaned = payload.includes(",") ? (payload.split(",")[1] ?? "") : payload;
  return Buffer.from(cleaned, "base64");
}

function secureEquals(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.EMAIL_INTAKE_SECRET?.trim();
  if (!expected) return false;
  if (expected.length < 16) {
    logger.warn("EMAIL_INTAKE_SECRET is shorter than recommended minimum", {
      route: EMAIL_INTAKE_ENDPOINT,
      minRecommendedLength: 16,
      actualLength: expected.length,
    });
  }
  const secretHeader = request.headers.get("x-intake-secret")?.trim();
  if (secretHeader && secureEquals(secretHeader, expected)) return true;
  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice("bearer ".length).trim();
    if (token && secureEquals(token, expected)) return true;
  }
  return false;
}

function parseResendAttachment(body: unknown): {
  resumeBase64: string;
  fileName?: string;
  contentType?: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  if (attachments.length === 0) return null;
  const first = attachments[0];
  if (!first || typeof first !== "object") return null;
  const obj = first as Record<string, unknown>;
  const content =
    typeof obj.content === "string" ? obj.content : typeof obj.data === "string" ? obj.data : null;
  if (!content) return null;
  return {
    resumeBase64: content,
    fileName: typeof obj.filename === "string" ? obj.filename : undefined,
    contentType: typeof obj.contentType === "string" ? obj.contentType : undefined,
  };
}

function normalizeBody(rawBody: unknown): Record<string, unknown> {
  if (!rawBody || typeof rawBody !== "object") return {};
  const body = rawBody as Record<string, unknown>;
  if (typeof body.resumeBase64 === "string") return body;

  const attachment = parseResendAttachment(body);
  if (!attachment) return body;
  return {
    to: body.to ?? body.recipient ?? "",
    from: body.from ?? body.sender ?? "",
    subject: body.subject ?? "",
    text: body.text ?? body.plainText ?? "",
    name: body.name,
    phone: body.phone,
    email: body.email,
    slug: body.slug,
    jobId: body.jobId,
    resumeBase64: attachment.resumeBase64,
    fileName: body.fileName ?? attachment.fileName,
    contentType: body.contentType ?? attachment.contentType,
    // Carry sender-authentication verdicts through so the DKIM/SPF gate can see them.
    spf: body.spf ?? body.spfVerdict,
    dkim: body.dkim ?? body.dkimVerdict,
    spfVerdict: body.spfVerdict,
    dkimVerdict: body.dkimVerdict,
  };
}

/**
 * POST /api/intake/email
 * Ingest resumes received at jobs+<jobId>@in.tigerhire.com.
 */
export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp =
    forwardedFor?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const rl = await checkRateLimit({
    key: buildScopedRateLimitKey({
      route: "email-intake",
      ip: clientIp,
    }),
    limit: 120,
    windowSecs: 60,
  }).catch((err) => {
    logger.error("Email intake rate limit check failed", {
      route: EMAIL_INTAKE_ENDPOINT,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  if (!rl) {
    return NextResponse.json({ error: "Rate limit unavailable" }, { status: 503 });
  }
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(request, EMAIL_INTAKE_ENDPOINT, async () => {
    try {
      const body = normalizeBody(await request.json());
      const parsed = emailIntakeSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid intake payload" }, { status: 422 });
      }

      const payload = parsed.data;
      const jobIdFromAddress = extractJobIdFromAddress(payload.to);
      const resolvedJobId = payload.jobId ?? jobIdFromAddress;
      if (!resolvedJobId) {
        return NextResponse.json(
          { error: "Missing job id. Use jobs+<jobId>@in.tigerhire.com or provide jobId." },
          { status: 400 },
        );
      }

      // Reject spoofed senders: a failing DKIM/SPF verdict means the `from`
      // address (and thus which candidate we would overwrite) cannot be trusted.
      const dkimVerdict = payload.dkimVerdict ?? payload.dkim;
      const spfVerdict = payload.spfVerdict ?? payload.spf;
      if (isFailingVerdict(dkimVerdict) || isFailingVerdict(spfVerdict)) {
        logger.warn("Email intake rejected: failing sender-authentication verdict", {
          route: EMAIL_INTAKE_ENDPOINT,
          dkimVerdict: dkimVerdict ?? null,
          spfVerdict: spfVerdict ?? null,
        });
        return NextResponse.json({ error: "Sender could not be verified." }, { status: 403 });
      }
      if (!dkimVerdict && !spfVerdict) {
        logger.warn(
          "Email intake: no sender-authentication verdict present — cannot verify sender",
          {
            route: EMAIL_INTAKE_ENDPOINT,
          },
        );
      }

      const fileBuffer = decodeBase64File(payload.resumeBase64);
      if (!fileBuffer.length) {
        return NextResponse.json({ error: "Resume attachment is empty." }, { status: 400 });
      }
      if (fileBuffer.length > MAX_STANDARD_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Resume attachment is too large." }, { status: 400 });
      }
      // Sniff the real type from the bytes; don't trust the sender-supplied
      // contentType (mirrors the /api/apply validation the direct path enforces).
      const detectedMime = detectMimeFromBuffer(fileBuffer, payload.fileName ?? "");
      if (!detectedMime || !INTAKE_ALLOWED_TYPES.includes(detectedMime)) {
        return NextResponse.json(
          { error: "Attachment must be a PDF or Word document." },
          { status: 400 },
        );
      }

      const supabase = createSupabaseAdmin();
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, organisation_id, title, organisations!jobs_organisation_id_fkey ( name )")
        .eq("id", resolvedJobId)
        .maybeSingle();
      if (jobErr || !job?.organisation_id) {
        return NextResponse.json({ error: "Job not found for intake address." }, { status: 404 });
      }

      const result = await savePublicApplication({
        fileBuffer,
        fileName: payload.fileName || `${resolvedJobId}-email-resume.pdf`,
        contentType: detectedMime,
        organisationId: job.organisation_id as string,
        jobId: resolvedJobId,
        name: payload.name,
        phone: payload.phone,
        email: payload.email ?? payload.from,
        source: "email_intake",
      });

      const appId =
        (
          await supabase
            .from("applications")
            .select("id")
            .eq("candidate_id", result.candidateId)
            .eq("job_id", resolvedJobId)
            .maybeSingle()
        ).data?.id ?? null;
      // Canonical screening collection (best-effort): if this job has active screening
      // questions, ask the candidate over WhatsApp so answers land in
      // application_screening_answers and the always-on FitScore gate passes once
      // answered. No-op if no questions; candidate stays gated if unreachable by phone.
      await startCanonicalScreeningCollectionBestEffort({
        admin: supabase,
        jobId: resolvedJobId,
        candidateId: result.candidateId,
        applicationId: appId,
        organisationId: job.organisation_id as string,
        phone: payload.phone ?? null,
        source: "email_intake",
      });

      const orgRaw = (job as { organisations?: { name?: string } | { name?: string }[] | null })
        .organisations;
      const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
      const companyName = (org as { name?: string } | null | undefined)?.name ?? "the hiring team";
      void notifyCvIngestedFromEmailIntake({
        applicationId: appId,
        candidateId: result.candidateId,
        candidateName: result.candidateName,
        candidatePhone: payload.phone ?? null,
        candidateEmail: payload.email ?? payload.from ?? null,
        jobId: resolvedJobId,
        jobTitle: ((job as { title?: string } | null)?.title ?? null) as string | null,
        companyName,
      }).catch((err) => {
        logger.error("Email intake acknowledgement dispatch failed", {
          candidateId: result.candidateId,
          jobId: resolvedJobId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      const jdBaseApproved = await isJdBaseApproved(supabase, resolvedJobId);
      if (!jdBaseApproved) {
        await enqueuePendingJdApprovalPair(supabase, resolvedJobId, result.candidateId);
        logger.info("Email intake: FitScore queued pending JD approval", {
          jobId: resolvedJobId,
          candidateId: result.candidateId,
        });
      } else {
        const prescreenGuard = await checkScoringGuard({
          admin: supabase,
          jobId: resolvedJobId,
          candidateId: result.candidateId,
          organisationId: job.organisation_id as string,
        });
        if (prescreenGuard.block) {
          logger.info("Email intake: FitScore deferred by prescreen gate", {
            jobId: resolvedJobId,
            candidateId: result.candidateId,
            reason: prescreenGuard.reason,
            gate_status: prescreenGuard.gateStatus,
          });
        } else {
          await enqueue("fit-score-single", {
            jobId: resolvedJobId,
            candidateId: result.candidateId,
          }).catch((err) => {
            logger.warn("Email intake: failed to enqueue fit-score-single", {
              jobId: resolvedJobId,
              candidateId: result.candidateId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
          if (!process.env.INNGEST_EVENT_KEY) {
            void FitScoreService.computeSingle(supabase, resolvedJobId, result.candidateId, {
              source: "upload",
            }).catch((err) => {
              logger.warn("Email intake: FitScore fallback compute failed", {
                jobId: resolvedJobId,
                candidateId: result.candidateId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        }
      }

      return NextResponse.json(
        {
          ok: true,
          candidateId: result.candidateId,
          candidateName: result.candidateName,
          jobId: resolvedJobId,
          source: "email_intake",
        },
        { status: 201 },
      );
    } catch (error) {
      logger.error("Email intake failed", {
        route: EMAIL_INTAKE_ENDPOINT,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: "Failed to process email intake" }, { status: 500 });
    }
  });
}
