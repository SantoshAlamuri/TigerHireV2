import crypto from "node:crypto";
import { env } from "@/lib/config/env";

export const OFFER_PUBLIC_SESSION_COOKIE = "th_offer_pub";

const OTP_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_SEC = 2 * 60 * 60;

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(s: string): Buffer {
  let padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  if (pad) padded += "=".repeat(4 - pad);
  return Buffer.from(padded, "base64");
}

function secretBytes(): Buffer {
  return crypto.createHash("sha256").update(env.offerPublicLinkSecret, "utf8").digest();
}

export function hashOfferPublicOtp(offerId: string, code: string): string {
  const key = secretBytes();
  return crypto.createHmac("sha256", key).update(`${offerId}:${code.trim()}`, "utf8").digest("hex");
}

export function verifyOfferPublicOtpHash(
  storedHex: string,
  offerId: string,
  code: string,
): boolean {
  try {
    const expected = Buffer.from(hashOfferPublicOtp(offerId, code), "hex");
    const actual = Buffer.from(storedHex, "hex");
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function generateOfferPublicOtpCode(): string {
  // crypto.randomInt, not Math.random: this code gates offer viewing and signing.
  // V8's PRNG state is recoverable from observed outputs.
  return crypto.randomInt(100000, 1000000).toString();
}

export function offerPublicOtpExpiresAtIso(): string {
  return new Date(Date.now() + OTP_TTL_MS).toISOString();
}

interface SessionPayload {
  oid: string;
  cid: string;
  exp: number;
}

export function signOfferPublicSession(offerId: string, candidateUserId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload: SessionPayload = { oid: offerId, cid: candidateUserId, exp };
  const payloadJson = JSON.stringify(payload);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(payloadJson);
  const sig = crypto
    .createHmac("sha256", secretBytes())
    .update(`${header}.${body}`, "utf8")
    .digest();
  const sigB64 = b64url(sig);
  return `${header}.${body}.${sigB64}`;
}

export function verifyOfferPublicSession(
  token: string,
): { offerId: string; candidateUserId: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const expectedSig = crypto
      .createHmac("sha256", secretBytes())
      .update(`${h}.${p}`, "utf8")
      .digest();
    const got = b64urlToBuf(s);
    if (expectedSig.length !== got.length || !crypto.timingSafeEqual(expectedSig, got)) return null;
    const payloadJson = b64urlToBuf(p).toString("utf8");
    const payload = JSON.parse(payloadJson) as SessionPayload;
    if (!payload?.oid || !payload?.cid || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { offerId: payload.oid, candidateUserId: payload.cid };
  } catch {
    return null;
  }
}

export function readOfferPublicSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((c) => c.trim());
  for (const part of parts) {
    if (part.startsWith(`${OFFER_PUBLIC_SESSION_COOKIE}=`)) {
      return decodeURIComponent(part.slice(OFFER_PUBLIC_SESSION_COOKIE.length + 1));
    }
  }
  return null;
}
