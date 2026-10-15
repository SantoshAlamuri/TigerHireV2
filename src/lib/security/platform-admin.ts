import type { NextRequest } from "next/server";
import { getAuthContext, jsonError, requireAuth } from "@/lib/api-helpers";

export async function requirePlatformAdmin(_request: NextRequest) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return { error: jsonError("Unauthorized", 401) };
  if (!ctx.isPlatformAdmin) return { error: jsonError("Forbidden", 403) };
  return { context: ctx };
}
