import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonSuccess } from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { deleteCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { z } from "zod";

const logoutBodySchema = z.object({}).strict();

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const body = await request.json().catch(() => ({}));
  const bodyParsed = logoutBodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Get current user before signing out so we can clear their cache
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  // Clear cached auth profile from Redis so stale role/org data doesn't persist
  if (user?.id) {
    await deleteCachedAuthProfile(user.id);
  }

  return jsonSuccess({ ok: true });
}
