import { NextRequest } from "next/server";
import { getAuthContext, jsonSuccess } from "@/lib/api-helpers";

export async function GET(_request: NextRequest) {
  const ctx = await getAuthContext();
  return jsonSuccess({
    is_platform_admin: Boolean(ctx?.isPlatformAdmin),
  });
}
