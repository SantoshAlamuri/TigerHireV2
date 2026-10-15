import { headers } from "next/headers";
import { env } from "@/lib/config/env";

/**
 * Origin for absolute hrefs to this Next app from server-rendered marketing pages.
 * - Production / preview: `NEXT_PUBLIC_APP_URL` (supports marketing vs app on different domains).
 * - Local dev: incoming `Host` so port matches the running dev server (avoids broken links when
 *   `.env` uses a different port than `next dev`).
 */
export async function getBrowserAppOrigin(): Promise<string> {
  if (process.env.NODE_ENV !== "development") {
    return env.baseUrl;
  }

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return env.baseUrl;

    const rawProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto: "http" | "https" =
      rawProto === "https" || rawProto === "http"
        ? rawProto
        : host.includes("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https";

    const safeHost = host.split(",")[0].trim();
    return `${proto}://${safeHost}`;
  } catch {
    return env.baseUrl;
  }
}
