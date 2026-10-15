import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleTryoutOptions, isTryoutAllowedOrigin, withTryoutCors } from "@/lib/security/cors";
import { validateOrigin } from "@/lib/security/csrf";

/** Normalize API / Supabase errors for tryout JSON responses. */
export function tryoutErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Something went wrong. Please try again.";
}

/** OPTIONS + CSRF bypass for allowed tryout demo origins on mutating routes. */
export function tryoutPreflight(request: NextRequest): NextResponse | null {
  const options = handleTryoutOptions(request);
  if (options) return options;
  return null;
}

export function tryoutCsrfGuard(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (origin && isTryoutAllowedOrigin(origin)) return null;
  return validateOrigin(request);
}

export function tryoutJson<T>(request: NextRequest, data: T, status = 200) {
  return withTryoutCors(NextResponse.json(data, { status }), request);
}

export function tryoutError(request: NextRequest, message: string, status: number) {
  return withTryoutCors(NextResponse.json({ error: message }, { status }), request);
}
