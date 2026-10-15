import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { initiateSpringVerifyCase } from "@/lib/integrations/springverify/client";
import { getSpringVerifyCredentials } from "@/lib/integrations/springverify/credentials";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";

type WorkflowErrorCode =
  | "forbidden"
  | "application_not_found"
  | "candidate_not_found"
  | "candidate_email_missing"
  | "not_configured"
  | "upstream_error";

export type SpringVerifyInitiateResult =
  | {
      ok: true;
      organisationId: string;
      applicationId: string;
      offerId: string | null;
      response: unknown;
    }
  | {
      ok: false;
      code: WorkflowErrorCode;
      status: number;
      error: string;
      organisationId?: string;
      applicationId?: string;
      offerId?: string | null;
    };

type InitiateInput = {
  applicationId: string;
  initiatedBy: string;
  expectedOrganisationId?: string | null;
  source: "api" | "offer_accept";
};

function parseNotConfigured(error: string): boolean {
  return error.toLowerCase().includes("not configured");
}

export async function initiateSpringVerifyForApplication(
  input: InitiateInput,
): Promise<SpringVerifyInitiateResult> {
  const admin = createSupabaseAdmin();

  const { data: app, error: appErr } = await admin
    .from("applications")
    .select("id, candidate_id, jobs!inner(organisation_id)")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (appErr || !app) {
    return {
      ok: false,
      code: "application_not_found",
      status: 404,
      error: "Application not found",
    };
  }

  const organisationId = (app.jobs as { organisation_id?: string } | null)?.organisation_id;
  if (!organisationId) {
    return {
      ok: false,
      code: "application_not_found",
      status: 404,
      error: "Application organisation not found",
    };
  }

  if (input.expectedOrganisationId && organisationId !== input.expectedOrganisationId) {
    return {
      ok: false,
      code: "forbidden",
      status: 403,
      error: "Forbidden",
      organisationId,
      applicationId: input.applicationId,
    };
  }

  const [{ data: cand, error: candErr }, { data: offer }] = await Promise.all([
    admin
      .from("candidates")
      .select("email, name, full_name, phone")
      .eq("id", app.candidate_id as string)
      .maybeSingle(),
    admin
      .from("offers")
      .select("id")
      .eq("application_id", input.applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (candErr || !cand) {
    return {
      ok: false,
      code: "candidate_not_found",
      status: 404,
      error: "Candidate not found for this application",
      organisationId,
      applicationId: input.applicationId,
      offerId: (offer?.id as string | undefined) ?? null,
    };
  }

  const email = (cand.email as string | null | undefined)?.trim() ?? "";
  if (!email) {
    return {
      ok: false,
      code: "candidate_email_missing",
      status: 400,
      error: "Candidate email is required to initiate SpringVerify",
      organisationId,
      applicationId: input.applicationId,
      offerId: (offer?.id as string | undefined) ?? null,
    };
  }

  const candidateName =
    ((cand.full_name as string | null | undefined) ?? "").trim() ||
    ((cand.name as string | null | undefined) ?? "").trim() ||
    "Candidate";
  const externalReference = `tigerhire:application:${input.applicationId}`;

  // BYO-account model: the application's organisation may have its own
  // SpringVerify credentials; platform env vars are only a testing fallback.
  const credentials = await getSpringVerifyCredentials(organisationId);

  const result = await initiateSpringVerifyCase(
    {
      candidateName,
      email,
      phone: (cand.phone as string | null | undefined) ?? null,
      externalReference,
      metadata: {
        organisation_id: organisationId,
        application_id: input.applicationId,
        initiated_by: input.initiatedBy,
        source: input.source,
      },
    },
    credentials,
  );

  const offerId = (offer?.id as string | undefined) ?? null;

  if (!result.ok) {
    const notConfigured = parseNotConfigured(result.error);
    if (offerId) {
      // The not-configured error message carries internal env-var setup
      // instructions; customer-facing audit trails must never surface those.
      // Record a clean informational skip event instead of a failure.
      await recordHiringOfferAuditEvent({
        organisationId,
        entityType: "offer",
        entityId: offerId,
        eventType: notConfigured ? "BGV_SKIPPED_NOT_CONFIGURED" : "BGV_INITIATE_FAILED",
        actorProfileId: input.source === "api" ? input.initiatedBy : null,
        actorRole: input.source === "api" ? "recruiter" : "system",
        prevStatus: null,
        newStatus: null,
        channel: input.source === "api" ? "api" : "system",
        metadata: notConfigured
          ? { applicationId: input.applicationId }
          : {
              applicationId: input.applicationId,
              error: result.error,
            },
      });
    }

    return {
      ok: false,
      code: notConfigured ? "not_configured" : "upstream_error",
      status: notConfigured ? 400 : 502,
      error: result.error,
      organisationId,
      applicationId: input.applicationId,
      offerId,
    };
  }

  if (offerId) {
    await recordHiringOfferAuditEvent({
      organisationId,
      entityType: "offer",
      entityId: offerId,
      eventType: "BGV_INITIATED",
      actorProfileId: input.source === "api" ? input.initiatedBy : null,
      actorRole: input.source === "api" ? "recruiter" : "system",
      prevStatus: null,
      newStatus: null,
      channel: input.source === "api" ? "api" : "system",
      metadata: {
        applicationId: input.applicationId,
        springverify: result.body,
      },
    });
  }

  return {
    ok: true,
    organisationId,
    applicationId: input.applicationId,
    offerId,
    response: result.body,
  };
}

function parseExternalReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("tigerhire:application:")) return null;
  const id = value.slice("tigerhire:application:".length).trim();
  return id.length > 0 ? id : null;
}

function extractApplicationIdFromRecord(record: Record<string, unknown>): string | null {
  const directId = record.applicationId;
  if (typeof directId === "string" && directId.length > 0) return directId;

  // We send correlation data as `candidate.meta_data` on create-case
  // (SpringVerify India external/v1 contract); older assumption was `metadata`.
  for (const key of ["meta_data", "metadata"]) {
    const meta = record[key];
    if (meta && typeof meta === "object") {
      const metaRecord = meta as Record<string, unknown>;
      const metaAppId = metaRecord.application_id;
      if (typeof metaAppId === "string" && metaAppId.length > 0) return metaAppId;
      const fromRef = parseExternalReference(metaRecord.external_reference);
      if (fromRef) return fromRef;
    }
  }

  const externalRefCandidates = [
    record.external_reference,
    record.external_id,
    record.externalId,
    record.reference_id,
    record.referenceId,
    record.case_reference,
    record.caseReference,
  ];
  for (const value of externalRefCandidates) {
    const fromRef = parseExternalReference(value);
    if (fromRef) return fromRef;
  }

  return null;
}

export function extractApplicationIdFromSpringVerifyPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const direct = extractApplicationIdFromRecord(record);
  if (direct) return direct;

  // SpringVerify's webhook shape is not publicly documented; tolerate the candidate
  // object (or a `data` wrapper) carrying the meta_data we sent on create.
  for (const key of ["candidate", "data"]) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const found = extractApplicationIdFromRecord(nested as Record<string, unknown>);
      if (found) return found;
    }
  }

  return null;
}

function extractStatusFromRecord(record: Record<string, unknown>): string | null {
  const candidates = [
    record.status,
    record.case_status,
    record.caseStatus,
    record.check_status,
    record.verification_status,
    record.verificationStatus,
    record.result,
    record.decision,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().toLowerCase();
    }
  }
  return null;
}

export function extractSpringVerifyStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const direct = extractStatusFromRecord(record);
  if (direct) return direct;

  for (const key of ["candidate", "data"]) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const found = extractStatusFromRecord(nested as Record<string, unknown>);
      if (found) return found;
    }
  }

  return null;
}
