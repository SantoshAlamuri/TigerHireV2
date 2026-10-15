# Tryout demo accounts

Shared credentials for **https://tryout.tigerhire.io**. Each account belongs to the TigerHire Tryout org and gets its own **5-CV-per-job** quota — rotate across accounts when demoing multiple times.

## Quick start

On the login page, click **Use next demo account** — the app round-robins through the pool automatically (stored in browser `localStorage`).

## Accounts (password shared)

| #   | Email                      | Password        |
| --- | -------------------------- | --------------- |
| 1   | demo01@tryout.tigerhire.io | TryoutDemo2026! |
| 2   | demo02@tryout.tigerhire.io | TryoutDemo2026! |
| 3   | demo03@tryout.tigerhire.io | TryoutDemo2026! |
| 4   | demo04@tryout.tigerhire.io | TryoutDemo2026! |
| 5   | demo05@tryout.tigerhire.io | TryoutDemo2026! |
| 6   | demo06@tryout.tigerhire.io | TryoutDemo2026! |
| 7   | demo07@tryout.tigerhire.io | TryoutDemo2026! |
| 8   | demo08@tryout.tigerhire.io | TryoutDemo2026! |
| 9   | demo09@tryout.tigerhire.io | TryoutDemo2026! |
| 10  | demo10@tryout.tigerhire.io | TryoutDemo2026! |

## Re-seed / reset passwords

From the main TigerHire repo (production Supabase credentials required):

```bash
TRYOUT_ORG_ID=187ccc3b-d33f-4b33-91fa-b4d688734369 \
node --env-file=.env.local scripts/seed-tryout-demo-users.mjs
```

Optional env:

- `TRYOUT_DEMO_PASSWORD` — override shared password (default `TryoutDemo2026!`)
- `TRYOUT_DEMO_ACCOUNT_COUNT` — number of accounts (default `10`)

## Org

- **TRYOUT_ORG_ID:** `187ccc3b-d33f-4b33-91fa-b4d688734369`
- **Role:** `agency` (active profile in tryout org)
