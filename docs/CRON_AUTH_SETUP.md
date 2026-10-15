# Cron Authentication Setup Guide

## Quick Vercel checklist

1. In Vercel → Project → Environment variables, set **`CRON_SECRET_HASH`** (SHA-256 hex of your secret) for Production (and Preview if cron runs there). Do **not** set plain `CRON_SECRET` in production.
2. Redeploy after changing env.
3. Verify: `curl -X POST "https://<your-host>/api/cron/cleanup" -H "Authorization: Bearer <CRON_SECRET_HASH>"` should not return `401` (use the **hash** as the bearer token, not the raw secret).
4. If you use Vercel Cron in `vercel.json`, the platform injects the bearer header when `CRON_SECRET_HASH` is set.

(Older **copy-paste** notes for a specific environment were folded into this doc; any standalone “quick setup” file should redirect here.)

## Overview

All cron endpoints (`/api/cron/*`) require authentication using a shared secret. The system supports two methods:

1. **CRON_SECRET** - Plain text secret (local dev only)
2. **CRON_SECRET_HASH** - SHA-256 hash of secret (production recommended)

## Security Features

- ✅ Rate limiting: 5 failed attempts per 15 minutes per IP
- ✅ Security logging: All auth attempts logged (success and failure)
- ✅ Production warnings: Alerts if plain secret detected in production
- ✅ IP-based brute force protection
- ✅ Timing-safe comparison for hash validation

## Local Development Setup

1. Generate a secret and hash:

```bash
node -e "const s=require('crypto').randomBytes(32).toString('hex'); const h=require('crypto').createHash('sha256').update(s).digest('hex'); console.log('CRON_SECRET='+s); console.log('CRON_SECRET_HASH='+h)"
```

2. Add both to `.env.local`:

```bash
CRON_SECRET=your-generated-secret-here
CRON_SECRET_HASH=your-generated-hash-here
```

3. Restart your dev server

## Production Setup (Vercel)

### Step 1: Generate Secret and Hash

```bash
node -e "const s=require('crypto').randomBytes(32).toString('hex'); const h=require('crypto').createHash('sha256').update(s).digest('hex'); console.log('CRON_SECRET='+s); console.log('CRON_SECRET_HASH='+h)"
```

Save both values securely.

### Step 2: Configure Vercel Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add **ONLY** `CRON_SECRET_HASH`:
   - Key: `CRON_SECRET_HASH`
   - Value: `your-generated-hash-here`
   - Environment: Production (and Preview if needed)
3. **DO NOT** set `CRON_SECRET` in production

### Step 3: Configure Cron Jobs

#### Option A: Vercel Cron Jobs

In `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/score-batch",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Vercel automatically adds the `Authorization: Bearer <CRON_SECRET_HASH>` header.

#### Option B: External Scheduler (e.g., GitHub Actions, cron)

Use the **hash value** (not the secret) in your requests:

```bash
curl -X POST https://your-app.vercel.app/api/cron/score-batch \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HASH_VALUE"
```

**Important**: Use the hash value directly, not the secret.

### Step 4: Verify Setup

Test a cron endpoint:

```bash
curl -X POST https://your-app.vercel.app/api/cron/cleanup \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HASH_VALUE"
```

Should return `200 OK` (or the endpoint's normal response).

## Converting Existing Secret to Hash

If you already have a `CRON_SECRET` and want to switch to hash-only:

```bash
# Generate hash from existing secret
node -e "console.log(require('crypto').createHash('sha256').update('your-existing-secret').digest('hex'))"
```

Then:

1. Set `CRON_SECRET_HASH` in Vercel with the generated hash
2. Update all cron job configurations to use the hash value
3. Remove `CRON_SECRET` from production environment

## Troubleshooting

### "Unauthorized" (401) Errors

1. **Check hash value**: Ensure you're using the hash (64 hex characters), not the secret
2. **Check header format**: Must be `Authorization: Bearer <hash>`
3. **Check environment**: Ensure `CRON_SECRET_HASH` is set in the correct Vercel environment
4. **Check logs**: Failed auth attempts are logged with IP and reason

### Rate Limit Exceeded

- You've made 5+ failed auth attempts from the same IP in 15 minutes
- Wait 15 minutes or use a different IP
- Check logs to see why auth is failing

### Production Warning About Plain Secret

If you see: `"SECURITY: Using CRON_SECRET in production..."`

- Remove `CRON_SECRET` from Vercel environment variables
- Use only `CRON_SECRET_HASH` in production

## Security Best Practices

1. ✅ **Always use CRON_SECRET_HASH in production** - Never expose the raw secret
2. ✅ **Rotate secrets periodically** - Generate new secret + hash, update Vercel, update cron configs
3. ✅ **Monitor auth logs** - Check for suspicious failed attempts
4. ✅ **Use different secrets per environment** - Dev, staging, production should have different secrets
5. ✅ **Store secrets securely** - Use password manager or secret management service

## All Protected Endpoints

- `/api/cron/cleanup` - POST
- `/api/cron/reminders` - POST
- `/api/cron/interview-reminders` - GET
- `/api/cron/resignations` - GET
- `/api/cron/user-count-monitor` - POST
- `/api/cron/embed` - POST
- `/api/cron/trust` - POST
- `/api/cron/process-signals` - POST
- `/api/cron/job-alerts` - POST
- `/api/cron/score-batch` - POST

All require `Authorization: Bearer <CRON_SECRET_HASH>` header.
