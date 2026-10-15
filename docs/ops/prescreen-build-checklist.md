# Phase 3 — Finish prescreen build (merge-ready checklist)

**Accurate status:** designed + soak-ready, **partially implemented**. Do **not** open PR → `dev` until every row in §6 is checked.

**Ground truth (run before every status update):**

```bash
git fetch origin
git diff --stat dev...claude/prescreen-per-channel-gate   # target branch — should grow
git diff --stat dev...claude/cascade-v3-scoring           # has partial prescreen today — do not treat as Phase 3 PR
```

As of last audit:

| Location                            | What’s there                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude/prescreen-per-channel-gate` | **0 files** vs `dev` (branch stale; no prescreen commits)                                                                                                   |
| `claude/cascade-v3-scoring`         | Partial: `derive`, `gate`, `save-gated`, `prescreen-flow`, hybrid `pipeline` hook; cascade migration has `prescreen_questions` / `prescreen_responses` only |
| Working tree (cascade)              | Soak pack uncommitted (`docs/ops/prescreen-*`, `scripts/prescreen-soak-verify.ts`)                                                                          |
| Safety net                          | **Not implemented** (stub removed)                                                                                                                          |
| `fix/hybrid-quote-validator`        | Already at `dev` tip — validator unblock may be done; confirm quote tests on `dev`                                                                          |

**Branch hygiene before build:** checkout `claude/prescreen-per-channel-gate`, rebase on `dev`, cherry-pick or port only prescreen-related commits/files from cascade (not the whole cascade diff).

---

## 1. Database

**New migration** (do not rely on cascade schema alone): e.g. `supabase/migrations/20260604120000_prescreen_per_channel_gate.sql`

| Object                               | Purpose                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `prescreen_sessions`                 | Per application: channel, state (`awaiting_reply`, `reminded`, `complete`), `questions_sent_at`, `reminder_sent_at` |
| `applications.gate_status`           | `pending` \| `passed` \| `failed` \| `unverified`                                                                   |
| `applications.unverified_must_haves` | Labels for timeout path                                                                                             |
| Feature flag seed                    | `ff_whatsapp_gate` = false (if not already global)                                                                  |
| RLS                                  | Org read on sessions; service-role writes                                                                           |

**Already on cascade migration (reuse, don’t duplicate):** `jd_requirements`, `prescreen_questions`, `prescreen_responses`.

**Acceptance**

- [ ] Migration applies cleanly on staging
- [ ] Soak SQL §1 (`prescreen_sessions` join) runs without missing columns

---

## 2. Core library (`src/lib/prescreen/`)

| File                             | Responsibility                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `types.ts`                       | Session states, channel enum, terminal outcomes                                        |
| `config.ts`                      | `prescreenReminderHours()`, `prescreenTimeoutHours()` from env                         |
| `flag.ts`                        | `isPrescreenGateEnabled(orgId)` → `ff_whatsapp_gate`                                   |
| `derive.ts`                      | ✅ exists — sync must-haves → questions (≤5)                                           |
| `gate.ts`                        | **Refactor** → `resolveGateFromSignals()` (form > WhatsApp > CV); keep flag-off = skip |
| `cv-evidence.ts`                 | CV keyword check for must-haves (extract from current `gate.ts`)                       |
| `channel-router.ts`              | `routePrescreenAfterApplication()`, `finalizePrescreenPassed/Failed/Timeout()`         |
| `dispatch.ts`                    | Board/email WhatsApp send + enqueue lifecycle                                          |
| `lifecycle.ts`                   | Reminder + timeout handlers (called from Inngest)                                      |
| `repository.ts`                  | Session/response CRUD                                                                  |
| `messages.ts` / `interactive.ts` | Copy + sequential Yes/No (max 3 buttons → one Q at a time)                             |
| `ensure-application.ts`          | Application row + gate_status init                                                     |
| `scoring-guard.ts`               | Block scoring when `failed` **or** `pending`; allow `passed` / `unverified`            |
| `pending-sweep.ts`               | Force `finalizePrescreenTimeout` for stale `pending`                                   |
| `save-gated.ts`                  | ✅ exists — failed gate persisted score row (no Anthropic)                             |

**Acceptance**

- [ ] Flag OFF → guard returns skip; scoring unchanged
- [ ] Flag ON + failed → no `FitScoreService` Anthropic path (Soak B)
- [ ] Flag ON + pending → scoring blocked until timeout/pass/fail

---

## 3. Inngest lifecycle (anti-stranding primary)

Mirror `screeningInactivity` pattern (`step.sleepUntil` + stale-event guard).

| Piece       | Detail                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Event       | e.g. `prescreen/lifecycle`                                                                           |
| Queue       | `prescreen-lifecycle` in `src/lib/jobs/queue.ts` + `JOB_TO_EVENT`                                    |
| Function    | `prescreenLifecycle` in `src/inngest/functions.ts`                                                   |
| Register    | `src/app/api/inngest/route.ts`                                                                       |
| Steps       | `sleepUntil` reminder → send once; `sleepUntil` timeout → `finalizePrescreenTimeout` + enqueue score |
| Idempotency | Skip if session state advanced or `questions_sent_at` newer than event watermark                     |

**Acceptance (Soak A — staging env)**

- [ ] `PRESCREEN_TIMEOUT_HOURS=0.05` → within ~3–10 min: `gate_status=unverified`, fit score exists
- [ ] Inngest dashboard shows function run + both sleeps
- [ ] No Anthropic rows for `failed`; Anthropic allowed for `unverified` timeout score

---

## 4. Safety net (required — not optional)

Blocking on `pending` is only safe with **both** paths:

| Piece                                               | Detail                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pending-sweep.ts`                                  | Sweep `applications.gate_status=pending` older than `T_timeout + PRESCREEN_PENDING_SWEEP_BUFFER_HOURS` |
| `src/app/api/cron/prescreen-pending-sweep/route.ts` | `POST`, `CRON_SECRET`                                                                                  |
| `vercel.json`                                       | Cron every 6h                                                                                          |

**Acceptance (Soak D monitoring)**

- [ ] `npx tsx scripts/prescreen-soak-verify.ts --pending-report` exits 0 after soak
- [ ] Deliberately break Inngest on staging → cron still resolves within 6h + buffer (one manual test)

---

## 5. Channel integrations

| Channel               | Entry                                                         | Behaviour                                 |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| WhatsApp              | `src/lib/whatsapp/handler.ts` + `sessions.ts` states          | Sequential prescreen; replies → router    |
| Apply page            | `api/apply/[slug]/route.ts`, `(public)/apply/[slug]/page.tsx` | Form answers → immediate pass/fail        |
| idibu / board         | `src/lib/idibu/process-webhook.ts`                            | Dispatch WhatsApp → `pending` + lifecycle |
| Email intake          | `api/intake/email/route.ts`                                   | Same as board                             |
| Public apply / lane-a | existing apply paths                                          | Form-first where configured               |

**Scoring / product**

| Piece                               | Detail                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `FitScoreService` / hybrid pipeline | Call `scoring-guard` before Anthropic; pass `unverifiedMustHaves` into pipeline |
| `pipeline.ts`                       | Append `Unverified: …` to `ideal_gaps`                                          |
| Shortlist                           | Exclude `gate_status = failed`                                                  |

**Acceptance**

- [ ] Soak E — apply Yes → score; apply No → failed, zero Anthropic
- [ ] Soak C — UI Key gaps shows `Unverified:` prefix (human + `--expect-unverified-gaps`)

---

## 6. Tests & ops pack (same PR)

| Item                 | Path                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Unit tests           | `tests/unit/prescreen-gate.test.ts` — resolution precedence, flag-off skip, terminal outcomes                 |
| Soak runbook         | `docs/ops/prescreen-pilot-soak.md` — **commit on prescreen branch**                                           |
| Soak SQL             | `docs/ops/prescreen-soak-queries.sql`                                                                         |
| Soak CLI             | `scripts/prescreen-soak-verify.ts`                                                                            |
| Env docs             | `.env.example`: `PRESCREEN_REMINDER_HOURS`, `PRESCREEN_TIMEOUT_HOURS`, `PRESCREEN_PENDING_SWEEP_BUFFER_HOURS` |
| Pilot checklist link | `docs/ops/v3-cascade-pilot-gate-checklist.md` §4                                                              |

**Acceptance**

- [ ] `npm run typecheck` clean
- [ ] `npm test -- tests/unit/prescreen-gate.test.ts` green
- [ ] `git diff --stat dev...HEAD` lists all files above (no “intent only”)

---

## 7. PR gate (after §1–6)

1. Rebase `claude/prescreen-per-channel-gate` on latest `dev`.
2. PR → `dev`, **`ff_whatsapp_gate` OFF** globally.
3. Staging: flag ON for **one org you control (test/staging — not a live customer)**; fast-timeout env; run Soaks A–E + `--pending-report`. (Correctness only; gate-rate/cost numbers come from real usage per `docs/ops/active-track-plan.md`.)
4. Record board **reply rate** (Soak doc cost table) before any Option B discussion.

**Do not merge if:** any soak fails, stale `pending` without explanation, or diff missing router/lifecycle/sweep/tests.

---

## 8. Sequence vs cascade (parallel tracks)

| Track                     | Order                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Validator / hybrid quotes | ✅ on `dev` if branch tip matches — run regression + cost on `dev` or rebased cascade                          |
| Cascade v3                | Rebase on `dev` → regression + cost → PR                                                                       |
| Prescreen Phase 3         | **Finish build on prescreen branch** → PR → staging soak (independent of cascade merge, but shares `dev` base) |

Half-built prescreen merged with `pending` blocking and no timeout/sweep is **worse than flag-off** — treat as production incident class.
