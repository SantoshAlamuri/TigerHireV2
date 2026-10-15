import { jsonSuccess } from "@/lib/api-helpers";
import { env } from "@/lib/config/env";

/**
 * GET /api/auth/oauth-config
 * Public: whether the app can use TigerHire-hosted Google OAuth (redirect shows your app domain
 * on the consent screen when Google client id + secret are in env). If false, use Supabase /api/auth/sso.
 */
export async function GET() {
  const id = env.googleClientId?.trim() ?? "";
  const secret = env.googleClientSecret?.trim() ?? "";
  return jsonSuccess({ useDirectGoogle: Boolean(id && secret) });
}
