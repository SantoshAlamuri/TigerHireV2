# TigerHire Tryout App

Frontend-only demo at **tryout.tigerhire.io** — same Supabase auth and production API on **tigerhire.io**, isolated by tryout org.

See the full brief in [TRYOUT_APP_BRIEF.md](./TRYOUT_APP_BRIEF.md).

## Backend (main TigerHire app)

Tryout-specific routes live under `/api/tryout/*`:

| Method | Path                           | Purpose                                       |
| ------ | ------------------------------ | --------------------------------------------- |
| POST   | `/api/tryout/jd-base/extract`  | Extract JD text from PDF / Word / TXT upload  |
| POST   | `/api/tryout/jd-base/generate` | Create job + JD Base from pasted JD text      |
| PUT    | `/api/tryout/jd-base`          | Update rubric / ICP / thresholds              |
| POST   | `/api/tryout/jd-base/approve`  | Approve JD Base for scoring                   |
| POST   | `/api/tryout/score`            | Upload PDF, score (fast path, no explanation) |
| POST   | `/api/tryout/explanation`      | Load explanation after score card renders     |

### Server env (tigerhire.io)

```bash
TRYOUT_ORG_ID=187ccc3b-d33f-4b33-91fa-b4d688734369  # TigerHire Tryout org (production)
TRYOUT_ALLOWED_ORIGINS=https://tryout.tigerhire.io,http://localhost:3001  # optional extras
```

Enable `fitscore_hybrid_v2` for the tryout org. Demo accounts are seeded via `node --env-file=.env.local scripts/seed-tryout-demo-users.mjs` (see [TRYOUT_DEMO_ACCOUNTS.md](./TRYOUT_DEMO_ACCOUNTS.md)).

### CORS

`tryout.tigerhire.io` and `localhost:3001` are allowed on tryout routes. Auth uses `Authorization: Bearer <supabase_access_token>` from the demo app.

## Frontend repo

The UI lives in sibling repo **`tigerhire-tryout/`**. It has zero API routes — all calls go to `NEXT_PUBLIC_API_BASE=https://tigerhire.io`.
