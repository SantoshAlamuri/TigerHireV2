# Fix 401 Unauthorized Error on Vercel Preview

## Problem

Getting `401 Unauthorized` when trying to create jobs on preview deployment:

- URL: `https://tigerhire-git-dev-santoshalamuris-projects.vercel.app`
- Error: `POST /api/jobs 401 (Unauthorized)`

## Root Cause

The middleware is checking for authentication but not finding a valid session. This can happen because:

1. **Environment variables not set for Preview deployments**
2. **User not logged in on preview URL**
3. **Supabase not configured to allow preview URL**

## Solution

### Step 1: Set Environment Variables in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your **TigerHire** project
3. Go to **Settings → Environment Variables**
4. For each required variable, ensure it's set for **Preview** environment:

| Variable                        | Value                                                             | Environment             |
| ------------------------------- | ----------------------------------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://htdyomyhkvhcwoeodwas.supabase.co` (primary TigerHire DB) | **Preview, Production** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key from Supabase → Settings → API                           | **Preview, Production** |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service role key (same screen)                                    | **Preview, Production** |
| `NEXT_PUBLIC_APP_URL`           | `https://tigerhire-git-dev-santoshalamuris-projects.vercel.app`   | **Preview**             |

**Important**: Make sure these are set for **Preview** environment, not just Production!

### Step 2: Configure Supabase to Allow Preview URL

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/htdyomyhkvhcwoeodwas) for the project matching `NEXT_PUBLIC_SUPABASE_URL`
2. Navigate to **Authentication → URL Configuration**
3. Under **Redirect URLs**, add:
   - `https://tigerhire-git-dev-santoshalamuris-projects.vercel.app/api/auth/callback`
   - `https://*.vercel.app/api/auth/callback` (for all preview deployments)
4. Save changes

### Step 3: Redeploy

After setting environment variables:

1. Go to Vercel Dashboard → **Deployments**
2. Click **Redeploy** on the latest deployment
3. Or push a new commit to trigger a new deployment

### Step 4: Login Again

1. Go to your preview URL: `https://tigerhire-git-dev-santoshalamuris-projects.vercel.app`
2. **Log in** (your session from production/local won't carry over)
3. Try creating a job again

## Verification

After fixing, check:

1. **Browser Console**: Should not show 401 errors
2. **Network Tab**: Check that cookies are being set (look for `sb-*` cookies)
3. **Application → Cookies**: Should see Supabase session cookies

## Common Issues

### Issue: "Environment variables not found"

**Solution**: Make sure variables are set for **Preview** environment in Vercel, not just Production.

### Issue: "Redirect URL not allowed"

**Solution**: Add the preview URL to Supabase's allowed redirect URLs (Step 2 above).

### Issue: "Session not persisting"

**Solution**:

- Clear browser cookies for the preview domain
- Log in again
- Check that cookies are being set in DevTools

### Issue: "Still getting 401 after login"

**Solution**:

- Check Vercel function logs for errors
- Verify `NEXT_PUBLIC_SUPABASE_URL` matches a **live** Supabase project (see [VERCEL_PREVIEW_SUPABASE.md](./VERCEL_PREVIEW_SUPABASE.md))
- Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct

## Quick Test

To verify auth is working:

```bash
# In browser console on preview URL:
fetch('/api/profiles', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

Should return your profile, not `{ error: "Unauthorized" }`.

## Next Steps

Once auth is working:

1. The 401 error should be resolved
2. Job creation should work
3. All authenticated API calls should work
