import crypto from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

interface ScimAuthResult {
  ok: boolean;
  status: number;
  error?: string;
  organisationId?: string;
}

function parseBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length).trim();
}

function safeEqual(a: string, b: string): boolean {
  // Hash both to fixed-length digests before comparing so the early length-mismatch
  // return can't leak the expected token's length via timing. (#352)
  const aBuf = crypto.createHash("sha256").update(a).digest();
  const bBuf = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function parseOrgTokenMap(): Record<string, string> | null {
  const raw = process.env.SCIM_BEARER_TOKENS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: Record<string, string> = {};
    for (const [orgId, token] of Object.entries(parsed)) {
      if (typeof token === "string" && token.trim().length > 0) {
        normalized[orgId] = token.trim();
      }
    }
    return normalized;
  } catch {
    return null;
  }
}

export function requireScimContext(
  request: Request,
  options?: { requireOrganisationHeader?: boolean },
): ScimAuthResult {
  const token = parseBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const organisationId = request.headers.get("x-scim-organisation-id")?.trim() || undefined;
  if (options?.requireOrganisationHeader && !organisationId) {
    return { ok: false, status: 400, error: "Missing x-scim-organisation-id header" };
  }

  // Per-org token map takes precedence. If SCIM_BEARER_TOKENS_JSON is set at all,
  // it is authoritative and we FAIL CLOSED on a parse failure — we must never
  // silently fall through to a shared global token that trusts a client-supplied
  // org id (that was a cross-tenant hole).
  const rawOrgTokens = process.env.SCIM_BEARER_TOKENS_JSON?.trim();
  if (rawOrgTokens) {
    const orgTokenMap = parseOrgTokenMap();
    if (!orgTokenMap || Object.keys(orgTokenMap).length === 0) {
      logger.error("SCIM_BEARER_TOKENS_JSON is set but unparseable/empty — refusing SCIM auth");
      return { ok: false, status: 500, error: "SCIM misconfigured" };
    }
    if (!organisationId) {
      return { ok: false, status: 400, error: "Missing x-scim-organisation-id header" };
    }
    const orgToken = orgTokenMap[organisationId];
    if (!orgToken || !safeEqual(token, orgToken)) {
      return { ok: false, status: 403, error: "Unauthorized for requested organisation" };
    }
    return { ok: true, status: 200, organisationId };
  }

  // Single global token fallback. The org id is pinned from server config, never
  // from the request header, so this token cannot be pointed at another tenant.
  const expected = process.env.SCIM_BEARER_TOKEN;
  if (!expected || !safeEqual(token, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const pinnedOrg = process.env.SCIM_BEARER_TOKEN_ORG_ID?.trim();
  if (!pinnedOrg) {
    logger.error(
      "SCIM_BEARER_TOKEN is set without SCIM_BEARER_TOKEN_ORG_ID — refusing to trust a client-supplied org id",
    );
    return { ok: false, status: 500, error: "SCIM misconfigured" };
  }
  if (organisationId && organisationId !== pinnedOrg) {
    return { ok: false, status: 403, error: "Unauthorized for requested organisation" };
  }
  return { ok: true, status: 200, organisationId: pinnedOrg };
}

export function requireScimBearer(request: Request): boolean {
  return requireScimContext(request).ok;
}

export async function logScimEvent(
  eventType: string,
  payload: Record<string, unknown>,
  organisationId?: string | null,
  externalId?: string | null,
): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("scim_provisioning_events").insert({
    event_type: eventType,
    organisation_id: organisationId ?? null,
    external_id: externalId ?? null,
    payload,
  });
  if (error) {
    logger.warn("Failed to log SCIM event", { eventType, error: String(error) });
  }
}
