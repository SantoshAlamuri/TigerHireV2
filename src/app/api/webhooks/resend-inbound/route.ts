import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

const RESUME_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const RESUME_EXTENSIONS = /\.(pdf|docx?)$/i;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Svix-style signature check (same scheme Resend uses for all webhooks):
 * HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64 secret after
 * the `whsec_` prefix; header carries space-separated `v1,<sig>` entries.
 */
function verifySvixSignature(rawBody: string, req: NextRequest, secretRaw: string): boolean {
  const id = req.headers.get("svix-id")?.trim() ?? "";
  const timestamp = req.headers.get("svix-timestamp")?.trim() ?? "";
  const signatureHeader = req.headers.get("svix-signature")?.trim() ?? "";
  if (!secretRaw || !id || !timestamp || !signatureHeader) return false;

  // Replay protection: reject deliveries whose timestamp (unix seconds) is more
  // than 5 minutes from now, so a captured payload cannot be replayed forever.
  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
    return false;
  }

  const secret = secretRaw.startsWith("whsec_") ? secretRaw.slice("whsec_".length) : secretRaw;
  let key: Buffer;
  try {
    key = Buffer.from(secret, "base64");
  } catch {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  return signatureHeader.split(/\s+/).some((entry) => {
    const sig = entry.includes(",") ? entry.split(",")[1] : entry;
    if (!sig || sig.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

type ReceivedAttachment = { id?: string; filename?: string; content_type?: string };

/** All resume-like attachments with an id — a single email can carry several CVs (e.g. a
 *  recruiter/Naukri forward bundling multiple candidates). */
function pickResumeAttachments(attachments: ReceivedAttachment[]): ReceivedAttachment[] {
  return attachments.filter(
    (a) =>
      !!a.id &&
      ((a.content_type && RESUME_CONTENT_TYPES.has(a.content_type)) ||
        (a.filename && RESUME_EXTENSIONS.test(a.filename))),
  );
}

type ForwardOutcome = "ok" | "permanent" | "transient";

/** Fetch one attachment from Resend and forward it to the intake pipeline. Classifies the
 *  result so the caller can decide Resend retry behavior: `transient` warrants a retry
 *  (network / 5xx), `permanent` does not (intake 4xx — bad address, job not found). */
async function forwardResumeAttachment(args: {
  emailId: string;
  attachment: ReceivedAttachment;
  apiKey: string;
  intakeSecret: string;
  base: string;
  to: string;
  from?: string;
  subject?: string;
}): Promise<ForwardOutcome> {
  const { emailId, attachment, apiKey, intakeSecret, base, to, from, subject } = args;
  try {
    const metaRes = await fetch(
      `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachment.id}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!metaRes.ok) throw new Error(`attachment metadata ${metaRes.status}`);
    const meta = (await metaRes.json()) as { download_url?: string };
    if (!meta.download_url) throw new Error("no download_url in attachment response");

    const fileRes = await fetch(meta.download_url);
    if (!fileRes.ok) throw new Error(`attachment download ${fileRes.status}`);
    const buf = Buffer.from(await fileRes.arrayBuffer());
    if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
      logger.warn("[resend-inbound] attachment exceeds 10MB, skipping", {
        to,
        fileName: attachment.filename,
        bytes: buf.byteLength,
      });
      return "permanent";
    }

    const intakeRes = await fetch(`${base}/api/intake/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-intake-secret": intakeSecret,
        // Distinct per (email, attachment) so a whole-email retry de-dupes each CV.
        "idempotency-key": `resend:${emailId}:${attachment.id}`,
      },
      body: JSON.stringify({
        to,
        from,
        subject,
        resumeBase64: buf.toString("base64"),
        fileName: attachment.filename ?? "resume.pdf",
        contentType: attachment.content_type ?? "application/pdf",
      }),
    });
    if (intakeRes.ok) {
      logger.info("[resend-inbound] resume forwarded to intake", {
        to,
        fileName: attachment.filename,
        bytes: buf.byteLength,
      });
      return "ok";
    }
    // 4xx from intake = permanent (bad address / job not found / invalid payload); 5xx = transient.
    const outcome: ForwardOutcome = intakeRes.status >= 500 ? "transient" : "permanent";
    logger.error("[resend-inbound] intake rejected forwarded resume", {
      status: intakeRes.status,
      body: (await intakeRes.text()).slice(0, 300),
      to,
      fileName: attachment.filename,
      outcome,
    });
    return outcome;
  } catch (err) {
    logger.error("[resend-inbound] attachment processing failed", {
      error: err instanceof Error ? err.message : String(err),
      emailId,
      attachmentId: attachment.id,
    });
    return "transient";
  }
}

/**
 * Resend Inbound → TigerHire email intake bridge.
 *
 * Resend's `email.received` webhook carries attachment METADATA only; the
 * content is fetched via GET /emails/receiving/{email_id}/attachments/{id}
 * which returns a signed `download_url` (verified against Resend docs
 * 2026-07-09). The fetched resume is forwarded to the existing
 * POST /api/intake/email pipeline (jobs+<job-uuid>@… addressing, candidate
 * create + FitScore) using EMAIL_INTAKE_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() ?? "";
  const rawBody = await request.text();

  if (!verifySvixSignature(rawBody, request, secret)) {
    logger.warn("[resend-inbound] signature verification failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    type?: string;
    data?: {
      email_id?: string;
      from?: string;
      to?: string[] | string;
      subject?: string;
      attachments?: ReceivedAttachment[];
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type !== "email.received") {
    return NextResponse.json({ ok: true, skipped: payload.type ?? "unknown" });
  }

  const data = payload.data ?? {};
  const toList = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  const jobAddress = toList.find((t) => /jobs\+[0-9a-f-]{36}@/i.test(t)) ?? toList[0] ?? "";
  const attachments = pickResumeAttachments(data.attachments ?? []);

  if (!data.email_id || attachments.length === 0) {
    logger.info("[resend-inbound] received email without resume attachment", {
      emailId: data.email_id,
      to: jobAddress,
      attachmentCount: data.attachments?.length ?? 0,
    });
    return NextResponse.json({ ok: true, skipped: "no_resume_attachment" });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    logger.error("[resend-inbound] RESEND_API_KEY missing");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const intakeSecret = process.env.EMAIL_INTAKE_SECRET?.trim() ?? "";
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  // Forward every resume attachment (a Naukri/recruiter forward may bundle several CVs).
  // Sequential to stay within the function's request budget and avoid hammering Resend.
  const emailId = data.email_id;
  const outcomes: ForwardOutcome[] = [];
  for (const attachment of attachments) {
    outcomes.push(
      await forwardResumeAttachment({
        emailId,
        attachment,
        apiKey,
        intakeSecret,
        base,
        to: jobAddress,
        from: data.from,
        subject: data.subject,
      }),
    );
  }

  const forwarded = outcomes.filter((o) => o === "ok").length;
  const transient = outcomes.filter((o) => o === "transient").length;
  logger.info("[resend-inbound] email processed", {
    to: jobAddress,
    total: attachments.length,
    forwarded,
    permanent: outcomes.filter((o) => o === "permanent").length,
    transient,
  });

  // Any transient failure -> 500 so Resend retries the whole email. Re-processing is safe:
  // each forward carries a per-attachment idempotency key, and savePublicApplication
  // de-dupes candidates by email/phone, so already-forwarded CVs won't duplicate.
  if (transient > 0) {
    return NextResponse.json({ ok: false, forwarded, transient }, { status: 500 });
  }
  return NextResponse.json({ ok: true, forwarded, total: attachments.length });
}
