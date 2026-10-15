import { logger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";
import type { SpringVerifyCredentials } from "@/lib/integrations/springverify/credentials";

export type SpringVerifyInitPayload = {
  candidateName: string;
  email: string;
  phone?: string | null;
  /** Passed through to SpringVerify (candidate.meta_data) / stored for correlation. */
  externalReference: string;
  metadata?: Record<string, unknown>;
};

/**
 * Request body for SpringVerify India "Add Candidate":
 * POST {base_url}/external/v1/candidate/add   (base_url prod: https://api-sa.in.springverify.com)
 * Contract per SpringVerify India API docs (support.springworks.in KB + Postman collection
 * "SpringVerify India - APIs"): top-level `candidate` + `package` objects,
 * `Authorization: Bearer <token>` (token generated in the SpringVerify dashboard → Settings → API).
 */
export type SpringVerifyCreateCaseBody = {
  candidate: {
    name: string;
    email: string;
    phone?: string;
    /** Free-form correlation object echoed back on candidate reads (Postman example: meta_data.uuid). */
    meta_data: Record<string, unknown>;
  };
  /**
   * Which BGV package to run. IDs are account-specific — fetch via
   * GET {base_url}/external/v1/candidate/packages. Omitted when
   * SPRINGVERIFY_PACKAGE_ID / SPRINGVERIFY_SUBTYPE_ID are not configured
   * (confirm with SpringVerify onboarding whether the account default applies).
   */
  package?: {
    package_id: number;
    subtype_id: number;
    config: Record<string, unknown>;
  };
};

/** Pure payload builder (exported for tests). */
export function buildSpringVerifyCreateCaseBody(
  payload: SpringVerifyInitPayload,
  opts?: { packageId?: number | null; subtypeId?: number | null },
): SpringVerifyCreateCaseBody {
  const phone = payload.phone?.trim();
  const body: SpringVerifyCreateCaseBody = {
    candidate: {
      name: payload.candidateName,
      email: payload.email,
      ...(phone ? { phone } : {}),
      meta_data: {
        ...payload.metadata,
        external_reference: payload.externalReference,
        source: "tigerhire",
      },
    },
  };
  if (opts?.packageId != null && opts?.subtypeId != null) {
    body.package = {
      package_id: opts.packageId,
      subtype_id: opts.subtypeId,
      config: {},
    };
  }
  return body;
}

/**
 * SpringVerify India (SpringRole) background verification.
 * Create-case endpoint: POST https://api-sa.in.springverify.com/external/v1/candidate/add
 * (stage: https://api-acceptance-2-sa.in.springverify.com). Set the full URL in
 * SPRINGVERIFY_CREATE_CASE_URL and the dashboard-generated API token in SPRINGVERIFY_API_KEY.
 * See docs/ops/integration-golive-runbooks.md → "SpringVerify BGV".
 *
 * Pass `credentials` (resolved via getSpringVerifyCredentials) to use an
 * organisation's own SpringVerify account (BYO); when omitted/null, the
 * platform-wide env vars are used as before.
 */
export async function initiateSpringVerifyCase(
  payload: SpringVerifyInitPayload,
  credentials?: SpringVerifyCredentials | null,
): Promise<{ ok: true; status: number; body: unknown } | { ok: false; error: string }> {
  const url = (credentials?.createCaseUrl ?? env.springverifyCreateCaseUrl).trim();
  const apiKey = (credentials?.apiKey ?? env.springverifyApiKey).trim();
  if (!url || !apiKey) {
    return {
      ok: false,
      error:
        "SpringVerify is not configured. Connect SpringVerify under Company Settings → Integrations, or set SPRINGVERIFY_CREATE_CASE_URL and SPRINGVERIFY_API_KEY (see docs/ops/integration-golive-runbooks.md).",
    };
  }

  const body = buildSpringVerifyCreateCaseBody(payload, {
    packageId: credentials ? credentials.packageId : env.springverifyPackageId,
    subtypeId: credentials ? credentials.subtypeId : env.springverifySubtypeId,
  });
  if (!body.package) {
    logger.warn(
      "SpringVerify: SPRINGVERIFY_PACKAGE_ID / SPRINGVERIFY_SUBTYPE_ID not set — sending create-case without a package block (account default must be confirmed with SpringVerify)",
    );
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      logger.warn("SpringVerify API error", { status: res.status, body: text.slice(0, 500) });
      return { ok: false, error: `SpringVerify returned ${res.status}` };
    }
    return { ok: true, status: res.status, body: parsed };
  } catch (e) {
    logger.error("SpringVerify request failed", { error: String(e) });
    return { ok: false, error: "SpringVerify request failed" };
  }
}
