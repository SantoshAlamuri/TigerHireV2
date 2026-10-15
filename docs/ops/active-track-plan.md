# Active track — post-Haiku plan (no named pilot org)

> **Addendum 2026-07-08:** the v3 cascade flags shipped ON globally in prod +
> preview on 2026-06-26 (`ff_path_unification`, `ff_cascade_rerank`,
> `ff_ctc_tiering`, `ff_structured_jd`; `ff_whatsapp_gate` held OFF — the
> per-org WhatsApp screening setting gates instead). First customer (Masai
> School) scored 363 CVs on the merged Sonnet path 2026-07-07. Batch API and
> volume-tiered depth remain the open cost levers. Current platform snapshot:
> `docs/ops/STATUS-2026-07-08.md`.

**Decided 2026-06-04.** The pilot-gate model question is answered: **Haiku is not a drop-in for Sonnet.** In-memory A/B on 3 real CVs (Finstack QA Engineer, same set as the Sonnet cost run): Haiku scored **+3 / +4 / +5** vs Sonnet on the displayed 0–100 score — `max |Δ| 5` against a **±0.5** gate (fails 6–10×), and **directional** (Haiku systematically _higher_ = inflates weaker candidates = false positives on the top 10). Caveats (path-unif OFF both, `tryout` leaves cv-parse on Sonnet, n=3) all point toward the real result being equal-or-worse. See `docs/ops/v3-cascade-regression.md` for the gate definition.

**Consequence:** the merged path stays **Sonnet, full stop**. The per-call cost lever (cheap model) is closed. Under the B-everyone choice, Phase 4 (cascade/lazy-verdict) is a **ranking-quality** feature, not a cost lever — lazy verdict has nothing to defer when everyone already gets a Sonnet verdict. The real cost levers are the parked **Batch API (50%)** and **volume-tiered depth**, both unparked after the query pack returns real cost/gate/mix. Pitch positioning is now **"equivalent at a defensible cost, cheap via architecture, not via small model."**

---

## Active sequence

1. **Finish Phase 3 prescreen (§1–6)** — router, Inngest lifecycle, migration, safety-net sweep, tests. Checklist: `docs/ops/prescreen-build-checklist.md`. No org named; flag `ff_whatsapp_gate` OFF.
2. **Open cascade → `dev` PR** (all `ff_*` OFF). Confirm staging/prod schema parity (both already carry cascade schema — see `docs/ops/cascade-migration-ledger-note.md`).
3. **Enable flags on Sonnet-merged and measure on real usage** the three things still unknown:
   - **Real ₹/profile** on the actual job mix (not the Haiku-assumed ₹0.94 — that number is dead).
   - **Gate rate** (~40% hypothesis) — `applications.gate_status` distribution.
   - **Job-size / depth mix** — drives volume-tiered depth decision.
4. **Unpark Batch / volume-tiered depth** and apply where the real cost/mix data says it matters (see triggers below).

`ff_haiku_extraction` stays **OFF permanently** unless re-measured against a changed band or a calibrated Haiku.

---

## Measurement: where it runs (locked)

- **Cost / gate-rate / mix numbers → real usage only.** These are properties of real traffic; a test org would produce a fake gate rate and fake mix. Captured via a **standing query pack** (below) so it's automatic once flags flip, not a manual step that silently never happens.
- **Soak correctness (timeout fires, zero-Anthropic on failed) → a test org you control.** Controlled, no live-customer mutation (the Finstack lesson: never mutate a live org's scores for an experiment).

**Standing query pack (run on any window once flags are ON; no org pinned):**

```sql
-- Real ₹/profile (Sonnet-merged), last 7d, per scored profile
WITH scored AS (
  SELECT fs.job_id, fs.candidate_id
  FROM fit_scores fs
  WHERE fs.created_at > now() - interval '7 days'
    AND fs.scoring_status = 'scored' AND fs.superseded_at IS NULL
),
costs AS (
  SELECT (p.metadata->>'jobId')::uuid AS job_id, p.candidate_id, sum(p.amount_usd) AS usd
  FROM platform_cost_events p
  WHERE p.created_at > now() - interval '7 days' AND p.provider = 'anthropic'
  GROUP BY 1, 2
)
SELECT count(*) AS profiles, round(avg(c.usd)::numeric, 4) AS avg_usd_per_profile
FROM scored s JOIN costs c ON c.job_id = s.job_id AND c.candidate_id = s.candidate_id;

-- Gate rate (the ~40% hypothesis)
SELECT gate_status, count(*) FROM applications
WHERE created_at > now() - interval '7 days' GROUP BY gate_status;

-- Job-size / depth mix (candidates per job → tiering signal)
SELECT j.id, count(*) AS scored
FROM fit_scores fs JOIN jobs j ON j.id = fs.job_id
WHERE fs.created_at > now() - interval '7 days' AND fs.scoring_status = 'scored'
GROUP BY j.id ORDER BY scored DESC;
```

---

## Parked — with explicit unpark triggers

| Parked item               | Unpark trigger                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Batch API**             | After real ₹/profile (Sonnet-merged) is measured on actual mix — apply where cost data shows it pays. |
| **Volume-tiered depth**   | After the job-size / depth mix is observed — only worth it if the mix is skewed enough.               |
| **`ff_haiku_extraction`** | Only if the ±0.5 band changes or a calibrated Haiku is re-measured. Default: stays OFF.               |

**Why triggers, not "later":** Batch stays parked by default forever unless the number that justifies it is actually produced. The standing query pack is the mechanism that produces it.
