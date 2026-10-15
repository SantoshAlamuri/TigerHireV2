# Job Board Credentials Setup Guide

## Understanding the Two Types of Keys

### 1. Encryption Key (Generate ONCE) 🔐

**What it is:** A master password that encrypts all company credentials in the database.

**When to generate:** ONCE during initial setup.

**How to generate:**

```bash
openssl rand -hex 32
```

**Where to put it:**

```bash
# .env.local
JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=<the-generated-key>
```

**Important:**

- Generate this **ONCE** and keep it secure
- **DO NOT** regenerate it - you'll lose access to all encrypted credentials
- This is like a master key that locks/unlocks all company credentials

### 2. API Keys (Each Company Enters Their Own) 🔑

**What they are:** The actual API credentials from Adzuna/Indeed that each company uses.

**When to enter:** Each company enters their own keys in the UI (`/company/settings`).

**Examples:**

- **Adzuna:** App ID, App Key, Advertiser ID (optional)
- **Indeed:** OAuth Access Token

**Important:**

- Each company enters their own keys
- These are different for each company
- Companies can update them anytime in settings

---

## Setup Steps

### Step 1: Generate Encryption Key (ONE TIME ONLY)

```bash
openssl rand -hex 32
```

Copy the output (64 characters).

### Step 2: Add Encryption Key to Environment

Add to `.env.local`:

```
JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=<paste-the-64-character-key-here>
```

**⚠️ CRITICAL:**

- Save this key securely (password manager, secure vault)
- If you lose it, you cannot decrypt existing credentials
- If you change it, all encrypted credentials become unusable

### Step 3: Run Database Migration

```bash
supabase migration up
```

This creates the table to store company credentials.

### Step 4: Configure Global Fallback (Optional - Migration Period Only)

During migration, you can allow fallback to global env vars:

```bash
# .env.local
ALLOW_JOB_BOARD_GLOBAL_FALLBACK=true
```

**⚠️ IMPORTANT:**

- Set to `false` or remove once all companies have configured their own credentials
- In production, this should be `false` to enforce tenant isolation
- When `false`, jobs will fail if company hasn't configured credentials (forces them to set up)

### Step 5: Companies Configure Their Own API Keys

Each company:

1. Goes to `/company/settings`
2. Scrolls to "Job Board Integrations"
3. Clicks "Configure" for Adzuna or Indeed
4. Enters their own API keys
5. Clicks "Save"

---

## How It Works

### The New Way (Default) ✅

1. Company posts a job
2. System looks up company's encrypted credentials in database
3. Decrypts using the master encryption key
4. Uses company's API keys to post job
5. Job appears under company's account

### The Old Way (Fallback - Migration Only) ⚠️

1. Company posts a job
2. System looks for company's credentials → Not found
3. If `ALLOW_JOB_BOARD_GLOBAL_FALLBACK=true`, uses global env vars
4. Job posts using shared account (not secure for multi-tenant)

**When to disable fallback:**

- Once all companies have configured their own credentials
- In production (for security)
- Set `ALLOW_JOB_BOARD_GLOBAL_FALLBACK=false` or remove it

---

## Security Best Practices

### ✅ DO:

- Generate encryption key ONCE and store securely
- Have each company configure their own API keys
- Disable global fallback in production
- Monitor logs for fallback usage (warns when used)

### ❌ DON'T:

- Regenerate encryption key (loses access to encrypted data)
- Share encryption key between environments
- Leave global fallback enabled in production
- Use global env vars for multiple companies

---

## Troubleshooting

### "No credentials found" error

**If fallback is enabled:**

- System will use global env vars (logged as warning)
- Company should configure their own credentials

**If fallback is disabled:**

- Company MUST configure their own credentials
- Jobs will fail until credentials are set up
- This enforces proper tenant isolation

### "Failed to decrypt credentials" error

- Check that `JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY` is set correctly
- Verify the key hasn't been changed (would break all encrypted data)
- Check logs for specific error details

### Companies can't see their credentials

- Credentials are never returned in API responses (security)
- Only metadata is shown (configured status, last used date)
- Companies can update but not view existing credentials

---

## Migration Checklist

- [ ] Generate encryption key (once)
- [ ] Add to `.env.local`
- [ ] Run database migration
- [ ] Set `ALLOW_JOB_BOARD_GLOBAL_FALLBACK=true` (temporary)
- [ ] Notify companies to configure their credentials
- [ ] Monitor logs for fallback usage
- [ ] Once all companies configured, set `ALLOW_JOB_BOARD_GLOBAL_FALLBACK=false`
- [ ] Remove global env vars (ADZUNA_APP_ID, INDEED_ACCESS_TOKEN) from production

---

## Summary

**Encryption Key:** Generate ONCE, never change it, keep it secret.

**API Keys:** Each company enters their own in the UI.

**Fallback:** Only for migration period, disable in production.

**New Way:** Always prefer org-specific credentials (default behavior).
