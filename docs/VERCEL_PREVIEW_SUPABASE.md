# Vercel Preview → Supabase (TigerHire primary project)

Preview deployments embed `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` **at build time** from Vercel environment variables. They are **not** read from this repo.

If the browser shows `net::ERR_NAME_NOT_RESOLVED` for `*.supabase.co`, Preview is pointing at a **deleted or wrong** project ref. Fix it in Vercel, then redeploy.

## Primary TigerHire database (current)

| Item        | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| Project ref | `htdyomyhkvhcwoeodwas`                                      |
| API URL     | `https://htdyomyhkvhcwoeodwas.supabase.co`                  |
| Dashboard   | https://supabase.com/dashboard/project/htdyomyhkvhcwoeodwas |

## Fix Preview auth / DB calls

1. **Vercel** → your TigerHire project → **Settings** → **Environment Variables**.
2. For **Preview** (and Production if you use the same DB):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://htdyomyhkvhcwoeodwas.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key from Supabase → Settings → API
   - `SUPABASE_SERVICE_ROLE_KEY` = service role key (same place; never expose client-side)
3. Optional test login on Preview: set **`SEED_DEMO_PASSWORD`** for **Preview** only (see `src/app/api/auth/test-login/route.ts`).
4. **Supabase** → Authentication → URL configuration → add redirect URLs:
   - `https://*.vercel.app/api/auth/callback`
   - Your stable preview URL if you use one.
5. **Redeploy** the latest Preview (or push an empty commit) so the new env is baked into the build.

## Local `.env.local`

Keep `NEXT_PUBLIC_SUPABASE_URL` aligned with the project you intend to hit (same host as above if you develop against primary DB).
