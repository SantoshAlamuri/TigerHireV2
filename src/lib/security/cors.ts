import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { addOriginVariants } from "@/lib/security/csrf-allowed-origins";

const DEFAULT_TRYOUT_ORIGINS = [
  "https://tryout.tigerhire.io",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3000",
];

/** Origins allowed to call /api/tryout/* cross-origin from the demo app. */
export function getTryoutAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  for (const raw of DEFAULT_TRYOUT_ORIGINS) {
    addOriginVariants(allowed, raw);
  }
  const extra = (process.env.TRYOUT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const raw of extra) {
    addOriginVariants(allowed, raw);
  }
  return allowed;
}

export function isTryoutAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return getTryoutAllowedOrigins().has(origin);
}

export function withTryoutCors(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  if (origin && isTryoutAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, x-csrf-token, x-requested-with",
    );
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  return response;
}

export function handleTryoutOptions(request: NextRequest): NextResponse | null {
  if (request.method !== "OPTIONS") return null;
  return withTryoutCors(new NextResponse(null, { status: 204 }), request);
}
