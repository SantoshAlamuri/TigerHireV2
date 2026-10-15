# Encryption Key Explained - Simple Guide

## The Confusion

You're thinking: "Do I give the encryption key to customers?"

**Answer: NO!** The encryption key is **YOUR system's master password** - customers never see it or need it.

---

## Two Completely Different Keys

### 1. Encryption Key (TigerHire's Master Key) 🔐

**Who generates it:** YOU (TigerHire team)

**Who uses it:** YOUR system (to encrypt/decrypt customer credentials)

**Who sees it:** ONLY TigerHire developers/admins (stored in `.env.local`)

**What it does:**

- Like a master lock that secures all customer credentials
- Encrypts customer API keys before storing in database
- Decrypts customer API keys when needed to post jobs

**Where it goes:**

```
.env.local (TigerHire's server only)
JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=<your-generated-key>
```

**Analogy:**

- It's like the bank's vault combination
- Customers don't need it
- Only the bank (TigerHire) uses it to secure customer valuables (their API keys)

---

### 2. API Keys (Customer's Own Keys) 🔑

**Who generates them:** Adzuna/Indeed (the job boards)

**Who uses them:** Customers (companies using TigerHire)

**Who sees them:** Customers enter them in TigerHire's UI

**What they do:**

- Customer's actual credentials to post jobs on Adzuna/Indeed
- Each customer has their own unique keys
- Customer gets these from Adzuna/Indeed directly

**Where they go:**

- Customer enters them in `/company/settings` in TigerHire
- TigerHire encrypts them using the encryption key
- Stored encrypted in database

**Analogy:**

- Like a customer's bank account password
- Customer creates it themselves
- Customer gives it to the bank (TigerHire) to manage their account
- Bank encrypts it before storing

---

## The Flow

### Step 1: TigerHire Setup (One Time)

```
1. You generate encryption key: openssl rand -hex 32
2. You save it in .env.local
3. Done - never touch it again
```

### Step 2: Customer Setup (Each Company)

```
1. Customer goes to Adzuna/Indeed website
2. Customer signs up and gets their API keys
3. Customer comes to TigerHire
4. Customer enters their API keys in /company/settings
5. TigerHire encrypts them using YOUR encryption key
6. Encrypted keys stored in database
```

### Step 3: When Job is Posted

```
1. Customer posts a job
2. TigerHire looks up customer's encrypted credentials
3. TigerHire decrypts using YOUR encryption key
4. TigerHire uses customer's API keys to post job
5. Job appears on Adzuna/Indeed under customer's account
```

---

## What You Need to Do

### ✅ DO:

1. Generate encryption key ONCE (for TigerHire system)
2. Store it securely in `.env.local` (never share with customers)
3. Let customers enter their own API keys in the UI

### ❌ DON'T:

1. Give encryption key to customers (they don't need it)
2. Generate API keys for customers (customers get them from Adzuna/Indeed)
3. Share encryption key between environments (dev/staging/prod should have different keys)

---

## Real-World Example

**TigerHire (You):**

- Encryption key: `a1b2c3d4...` (your master password)
- Stored in: `.env.local` (your server config)
- Purpose: Encrypt all customer credentials

**Customer A (Acme Corp):**

- Adzuna App ID: `acme-app-123` (from Adzuna)
- Adzuna App Key: `acme-key-456` (from Adzuna)
- Enters in: TigerHire UI
- Stored as: Encrypted blob in database

**Customer B (TechCo):**

- Adzuna App ID: `techco-app-789` (from Adzuna)
- Adzuna App Key: `techco-key-012` (from Adzuna)
- Enters in: TigerHire UI
- Stored as: Encrypted blob in database

**What happens:**

- Both customers' keys are encrypted using YOUR encryption key
- Each customer can only see/manage their own keys
- When posting jobs, system decrypts using YOUR key, uses customer's keys

---

## Summary

| Key Type           | Who Generates | Who Uses         | Where Stored         | Customer Sees?         |
| ------------------ | ------------- | ---------------- | -------------------- | ---------------------- |
| **Encryption Key** | TigerHire     | TigerHire system | `.env.local`         | ❌ NO                  |
| **API Keys**       | Adzuna/Indeed | Customers        | Database (encrypted) | ✅ YES (they enter it) |

**Bottom line:**

- Encryption key = Your system's master password (keep secret)
- API keys = Customer's own credentials (they enter in UI)

You generate the encryption key ONCE for your system. Customers get their own API keys from Adzuna/Indeed and enter them in your UI.
