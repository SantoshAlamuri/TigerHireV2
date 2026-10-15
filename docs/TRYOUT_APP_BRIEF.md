# TigerHire Tryout App — Cursor Brief

Frontend-only Next.js app at **tryout.tigerhire.io**. Zero new backend in the tryout repo; all API calls hit **tigerhire.io** production API. Same Supabase project; data isolated by dedicated org (`TRYOUT_ORG_ID`).

## Architecture

```
tryout.tigerhire.io (tryout UI)  ──Bearer──>  tigerhire.io /api/tryout/*
         │                                        │
         └── Supabase Auth (same project) ────────┘
```

## Performance targets

| Action                        | Max wait                       |
| ----------------------------- | ------------------------------ |
| Paste JD → rubric + ICP       | <10s                           |
| 1 CV → score + dimension bars | 8–12s                          |
| 5 CVs → all score cards       | 15–20s                         |
| Explanation per card          | 5–10s after score (background) |

Scoring returns immediately without explanation; frontend calls `/api/tryout/explanation` per card after render.

## Backend routes (main app)

Implemented under `src/app/api/tryout/`. See [TRYOUT.md](../TRYOUT.md).

## Frontend repo structure

```
tigerhire-tryout/
  src/app/page.tsx           # Login
  src/app/tryout/            # 4-step flow
  src/components/            # JDInput, RubricEditor, ICPEditor, ScoreCard, ScoreResults
  src/lib/api.ts             # Calls tigerhire.io
  src/lib/supabase.ts
```

## Env (demo app)

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_BASE=https://tigerhire.io
NEXT_PUBLIC_TRYOUT_ORG_ID=
```

## Success criteria

- JD paste → rubric in <10s
- 5 CVs scored in <20s (parallel)
- Score card before explanation on every CV
- Mobile-friendly (WhatsApp link)
- Scores match main platform for same JD + CV

## Do not build

No backend in tryout repo, no signup, no analytics/WhatsApp/export.
