# Quick Start - Job Board Credentials Setup

## ✅ What's Already Done

1. ✅ Database migration applied
2. ✅ Encryption key generated and saved to `.env.local`
3. ✅ All code files created and updated
4. ✅ UI component added to settings page
5. ✅ API routes created

## 🚀 To Start the Server

### Option 1: Standard Start

```bash
npm run dev
```

### Option 2: If Port 3000 is Busy

```bash
PORT=3001 npm run dev
```

### Option 3: Clear Cache First

```bash
rm -rf .next
npm run dev
```

## 🔍 If Server Won't Start

### Step 1: Check .env.local

```bash
cat .env.local
```

Should show:

```
JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=4fb6bbafaca42dfea1987bbf0f95f70c3ec61aeaea94da88c1e79916632f38c9
ALLOW_JOB_BOARD_GLOBAL_FALLBACK=false
```

### Step 2: Check Node Version

```bash
node --version
```

Should be 18+ or 20+

### Step 3: Reinstall Dependencies

```bash
npm install
```

### Step 4: Check for TypeScript Errors

```bash
npm run typecheck
```

### Step 5: Kill Existing Process

```bash
# Find and kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

Then try again:

```bash
npm run dev
```

## 📋 Verification Checklist

Run this in your terminal to verify setup:

```bash
# Check .env.local exists
test -f .env.local && echo "✅ .env.local exists" || echo "❌ .env.local missing"

# Check encryption key is set
grep -q "JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=" .env.local && echo "✅ Encryption key found" || echo "❌ Encryption key missing"

# Check key length (should be 64 chars)
KEY=$(grep "JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=" .env.local | cut -d'=' -f2)
if [ ${#KEY} -eq 64 ]; then
  echo "✅ Encryption key has correct length"
else
  echo "❌ Encryption key has wrong length (should be 64)"
fi

# Check required files exist
test -f src/lib/security/credentials-encryption.ts && echo "✅ Encryption utility exists" || echo "❌ Missing encryption utility"
test -f src/lib/distribution/credentials.ts && echo "✅ Credentials helper exists" || echo "❌ Missing credentials helper"
test -f src/app/api/org/job-board-credentials/route.ts && echo "✅ API route exists" || echo "❌ Missing API route"
```

## 🎯 Test the Feature

Once server is running:

1. Go to: `http://localhost:3000/company/settings`
2. Scroll to "Job Board Integrations" section
3. Click "Configure" for Adzuna or Indeed
4. Enter test credentials
5. Click "Save"

## 🐛 Common Errors & Fixes

### Error: "Cannot find module"

**Fix:** Run `npm install`

### Error: "Port 3000 already in use"

**Fix:** Kill the process or use different port

### Error: "JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY is required"

**Fix:** Make sure `.env.local` exists with the key

### Error: "Encryption key must be 64 hex characters"

**Fix:** Check the key in `.env.local` is exactly 64 characters

### Error: TypeScript compilation errors

**Fix:** Run `npm run typecheck` to see specific errors

## 📞 Still Having Issues?

Share the exact error message from your terminal when running `npm run dev`, and I can help debug!
