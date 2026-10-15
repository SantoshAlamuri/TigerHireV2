/**
 * Google Indexing API notifier for Google for Jobs (Delta #5c).
 *
 * Pings https://indexing.googleapis.com/v3/urlNotifications:publish so Google re-crawls a
 * job's public page when it is published (URL_UPDATED) or removed (URL_DELETED), instead of
 * waiting for the organic crawl. This is the correct API for JobPosting / BroadcastEvent
 * structured data per Google's documentation.
 *
 * Safely no-ops when credentials are absent (mirrors the offer-BGV / vendor-key pattern), so
 * dev, tests, and un-provisioned environments never fail a publish because of this. Requires a
 * Google Cloud service account with the Indexing API enabled and the account added as an owner
 * of the verified tigerhire.io property in Search Console:
 *   GOOGLE_INDEXING_CLIENT_EMAIL   - service account email
 *   GOOGLE_INDEXING_PRIVATE_KEY    - service account private key (PEM; \n-escaped is fine)
 */

import crypto from "node:crypto";
import { logger } from "@/lib/observability/logger";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUBLISH_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

export type IndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

export interface IndexingPingResult {
  skipped: boolean;
  ok: boolean;
  reason?: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getCredentials(): { clientEmail: string; privateKey: string } | null {
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY;
  if (!clientEmail || !rawKey) return null;
  // Env vars commonly store the PEM with escaped newlines; restore them.
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return { clientEmail, privateKey };
}

/** Mint a short-lived OAuth access token via the service-account JWT-bearer grant. */
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signature = base64url(crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    logger.warn("Google Indexing token exchange failed", {
      status: res.status,
      body: (await res.text()).slice(0, 300),
    });
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

function publicJobUrl(jobId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io").replace(/\/$/, "");
  return `${base}/jobs/${jobId}`;
}

/**
 * Notify Google's Indexing API about a job's public page. Never throws; returns a result the
 * caller can log. `skipped: true` means credentials were not configured.
 */
export async function pingGoogleJobIndexing(params: {
  jobId: string;
  type: IndexingNotificationType;
}): Promise<IndexingPingResult> {
  const creds = getCredentials();
  if (!creds) return { skipped: true, ok: false, reason: "credentials_not_configured" };

  const url = publicJobUrl(params.jobId);
  try {
    const token = await getAccessToken(creds.clientEmail, creds.privateKey);
    if (!token) return { skipped: false, ok: false, reason: "token_exchange_failed" };

    const res = await fetch(PUBLISH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type: params.type }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      logger.warn("Google Indexing publish failed", {
        jobId: params.jobId,
        status: res.status,
        body,
      });
      return { skipped: false, ok: false, reason: `http_${res.status}` };
    }
    logger.info("Google Indexing notified", { jobId: params.jobId, type: params.type });
    return { skipped: false, ok: true };
  } catch (err) {
    logger.warn("Google Indexing ping error", {
      jobId: params.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { skipped: false, ok: false, reason: "exception" };
  }
}
