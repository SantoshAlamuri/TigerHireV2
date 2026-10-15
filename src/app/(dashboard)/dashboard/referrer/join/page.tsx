import { redirect } from "next/navigation";

/**
 * Legacy `/dashboard/referrer/join` route. The referrer setup flow now lives
 * inline on `/dashboard/referrer` — it detects `needs_setup: true` and renders
 * the WhatsApp-OTP form there, which calls the same `/api/refer/join` endpoint.
 * Forwarding here directly so we don't bounce through the deprecated
 * `/refer/join` redirect (which would send an authenticated user out to
 * `/register` unnecessarily).
 */
export default function LegacyReferrerJoinPage() {
  redirect("/dashboard/referrer");
}
