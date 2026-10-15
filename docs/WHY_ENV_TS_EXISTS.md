# Why We Have env.ts - Explained

## The Two Files Serve Different Purposes

### `.env.local` (Environment Variables File)

- **What it is:** A configuration file where you store actual secret values
- **Contains:** Real credentials (Supabase keys, API tokens, etc.)
- **Location:** Project root (hidden file)
- **Git status:** ❌ NOT committed (in `.gitignore`)
- **Purpose:** Store secrets that differ per environment (dev/staging/prod)

### `env.ts` (TypeScript Configuration File)

- **What it is:** A TypeScript file that provides type-safe access to environment variables
- **Contains:** Code that reads from `process.env` and validates it
- **Location:** `src/lib/config/env.ts` (source code)
- **Git status:** ✅ Committed to git (no secrets, just code)
- **Purpose:** Provide a safe, validated way to access env vars in your code

---

## What env.ts Does

### 1. **Type-Safe Access**

Instead of using `process.env.SUPABASE_URL` everywhere (which could be `undefined`), you use:

```typescript
import { env } from "@/lib/config/env";
const url = env.supabaseUrl; // TypeScript knows this is a string
```

### 2. **Validation**

Uses Zod to validate that required env vars are set:

```typescript
// In production, fails fast if Supabase URL is missing
validateEnv(); // Throws clear error if required vars missing
```

### 3. **Default Values**

Provides sensible defaults for optional variables:

```typescript
get baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io";
}
```

### 4. **Centralized Configuration**

All env var access goes through one place, making it easy to:

- See what env vars the app uses
- Change behavior in one place
- Add validation rules
- Provide better error messages

### 5. **Production Safety**

Validates env vars in production to fail fast with clear errors:

```typescript
if (process.env.NODE_ENV === "production") {
  // Validates all required vars are set
  validateEnv();
}
```

---

## Example: How They Work Together

### Step 1: You set values in `.env.local`

```bash
# .env.local (NOT in git)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key-here
```

### Step 2: env.ts reads and validates them

```typescript
// env.ts (IN git, no secrets)
export const env = {
  get supabaseUrl() {
    return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    // Reads from process.env (which loads .env.local)
  },
};
```

### Step 3: Your code uses env.ts

```typescript
// Some API route
import { env } from "@/lib/config/env";

const url = env.supabaseUrl; // Type-safe, validated access
```

---

## Why Not Just Use process.env Directly?

### ❌ Without env.ts (Bad):

```typescript
// Everywhere in your code:
const url = process.env.NEXT_PUBLIC_SUPABASE_URL; // Could be undefined!
if (!url) throw new Error("Missing URL"); // Repeat this everywhere
```

### ✅ With env.ts (Good):

```typescript
// One place handles validation
import { env } from "@/lib/config/env";
const url = env.supabaseUrl; // Always a string, validated
```

**Benefits:**

- ✅ Type safety (TypeScript knows it's a string)
- ✅ Validation in one place
- ✅ Better error messages
- ✅ Default values
- ✅ No repetition

---

## Real-World Analogy

**`.env.local`** = Your wallet (contains actual money/credentials)

- You keep it secret
- Different for each person/environment
- Not shared publicly

**`env.ts`** = A safe way to access your wallet (the code that reads it)

- Public code (committed to git)
- Same for everyone
- Provides security checks and validation

---

## Summary

| File         | Purpose                       | Contains Secrets? | In Git? |
| ------------ | ----------------------------- | ----------------- | ------- |
| `.env.local` | Store actual credentials      | ✅ YES            | ❌ NO   |
| `env.ts`     | Type-safe access & validation | ❌ NO             | ✅ YES  |

**env.ts is essential because:**

1. Provides type-safe access to env vars
2. Validates required vars are set
3. Centralizes configuration
4. Gives better error messages
5. Makes code more maintainable

**You need BOTH:**

- `.env.local` = Where you put your secrets
- `env.ts` = How your code safely accesses them
