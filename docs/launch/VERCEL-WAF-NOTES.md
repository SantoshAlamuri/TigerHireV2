# Vercel WAF (optional hardening)

Application routes already use **per-IP and per-key rate limiting** in `src/lib/security/rate-limit.ts` for auth, public apply, and public schedule. For stricter **edge** blocking (geo, bot, known-bad ASNs) without changing code:

1. Open the project in the [Vercel Dashboard](https://vercel.com/docs/security/firewall) → **Firewall** / WAF (product name may vary with plan).
2. Add rules to challenge or block traffic to high-risk paths (examples): `/api/auth/login`, `/api/apply*`, `/api/schedule/self-serve*`, admin routes if public.
3. Set **Vercel Bot / BotID** (if available on your plan) to reduce automated noise on unauthenticated pages.

**Note:** OAuth callbacks and legitimate mobile/NAT users share IPs; prefer **rate limits + challenge** over blanket IP blocks. Test login with Google/SSO after turning on strict rules.
