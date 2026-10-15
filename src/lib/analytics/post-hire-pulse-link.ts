import crypto from "node:crypto";

/**
 * Signed links for the post-hire pulse response page.
 *
 * The respond route (`GET /api/post-hire-pulse/respond`) is unauthenticated —
 * hiring managers open it straight from a WhatsApp link — so the only thing
 * standing between an attacker and writing an attrition/performance rating into
 * any tenant's data is that they must not be able to forge the link. Every link
 * therefore carries an HMAC over (pulseId, day); the route rejects any request
 * whose signature does not verify. Guessing a `pipeline_candidate_id` is no
 * longer enough.
 */
function secretBytes(): Buffer {
  const secret =
    process.env.POST_HIRE_PULSE_LINK_SECRET?.trim() ||
    process.env.APPROVAL_DEEP_LINK_SECRET?.trim() ||
    "";
  if (!secret) {
    throw new Error(
      "POST_HIRE_PULSE_LINK_SECRET (or APPROVAL_DEEP_LINK_SECRET) is required to sign/verify post-hire pulse links",
    );
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function signPostHirePulseLink(pulseId: string, day: number): string {
  return crypto
    .createHmac("sha256", secretBytes())
    .update(`${pulseId}:${day}`, "utf8")
    .digest("hex");
}

export function verifyPostHirePulseLink(pulseId: string, day: number, sig: string): boolean {
  try {
    const expected = Buffer.from(signPostHirePulseLink(pulseId, day), "hex");
    const actual = Buffer.from(sig, "hex");
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Absolute respond URL for a given pulse check-in, carrying the HMAC signature. */
export function buildPostHirePulseUrl(baseUrl: string, pulseId: string, day: number): string {
  const sig = signPostHirePulseLink(pulseId, day);
  const u = new URL("/api/post-hire-pulse/respond", baseUrl);
  u.searchParams.set("pulseId", pulseId);
  u.searchParams.set("day", String(day));
  u.searchParams.set("sig", sig);
  return u.toString();
}
