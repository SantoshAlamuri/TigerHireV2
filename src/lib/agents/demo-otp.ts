import crypto from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/config/env";

/**
 * WhatsApp-OTP access tokens for the homepage demo's upload tier. The open
 * tier (sample pool) needs no verification; scoring your own CVs requires a
 * verified phone so the 2-runs-per-number cap is enforceable. Uses the same
 * HMAC-session pattern (and secret) as offer-public-link; payload shapes are
 * disjoint so tokens can't be confused across surfaces.
 */

export const DEMO_TOKEN_TTL_SEC = 24 * 60 * 60;

export const demoOtpSendSchema = z.object({
  phone: z.string().trim().min(8).max(20),
});

export const demoOtpVerifySchema = z.object({
  phone: z.string().trim().min(8).max(20),
  code: z.string().trim().min(6).max(8),
});

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
  return crypto
    .createHash("sha256")
    .update(`demo-otp:${env.offerPublicLinkSecret}`, "utf8")
    .digest();
}

interface DemoTokenPayload {
  ph: string;
  exp: number;
}

export function signDemoAccessToken(phoneNorm: string, nowMs = Date.now()): string {
  const payload: DemoTokenPayload = {
    ph: phoneNorm,
    exp: Math.floor(nowMs / 1000) + DEMO_TOKEN_TTL_SEC,
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secretBytes())
    .update(`${header}.${body}`, "utf8")
    .digest();
  return `${header}.${body}.${b64url(sig)}`;
}

/** Returns the verified phone (normalized digits) or null. */
export function verifyDemoAccessToken(token: string, nowMs = Date.now()): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto
      .createHmac("sha256", secretBytes())
      .update(`${header}.${body}`, "utf8")
      .digest();
    const actual = b64urlToBuf(sig);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return null;
    }
    const payload = JSON.parse(b64urlToBuf(body).toString("utf8")) as Partial<DemoTokenPayload>;
    if (typeof payload.ph !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < nowMs) return null;
    return payload.ph;
  } catch {
    return null;
  }
}
