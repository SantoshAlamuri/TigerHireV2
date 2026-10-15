-- V3 cascade cost measurement (run immediately after a test CV batch)
-- Replace :window_start / :window_end with ISO timestamps (UTC) bracketing the run only.
-- Database: htdyomyhkvhcwoeodwas (TigerHire prod) or your soak project.
--
-- Flag intent for a meaningful "new path" number:
--   ff_path_unification ON, ff_haiku_extraction ON, ff_whatsapp_gate OFF
-- Same approved JD Base + same test CVs as baseline when possible.

-- ---------------------------------------------------------------------------
-- 1) Anthropic spend by label + model (primary comparison to baseline)
-- ---------------------------------------------------------------------------
SELECT
  metadata->>'label' AS label,
  metadata->>'model' AS model,
  count(*) AS events,
  round(sum(amount_usd)::numeric, 4) AS usd
FROM platform_cost_events
WHERE created_at >= :window_start::timestamptz
  AND created_at < :window_end::timestamptz
  AND provider = 'anthropic'
  AND metadata->>'label' IN (
    'cv-parser-text',
    'fitscore-hybrid-extraction',
    'fitscore-hybrid-extraction-verdict',
    'fitscore-hybrid-explanation',
    'fitscore_extraction_validation_failed'
  )
GROUP BY 1, 2
ORDER BY usd DESC, events DESC;

-- ---------------------------------------------------------------------------
-- 2) Per job/candidate profile total (2-profile run)
-- ---------------------------------------------------------------------------
SELECT
  (metadata->>'jobId')::uuid AS job_id,
  candidate_id,
  metadata->>'model' AS model,
  round(sum(amount_usd)::numeric, 4) AS usd
FROM platform_cost_events
WHERE created_at >= :window_start::timestamptz
  AND created_at < :window_end::timestamptz
  AND provider = 'anthropic'
  AND candidate_id IN (:candidate_id_1, :candidate_id_2)  -- optional filter
GROUP BY 1, 2, 3
ORDER BY job_id, candidate_id, usd DESC;

-- Blended INR (set FX manually; example 83 INR/USD):
-- SELECT round(sum(amount_usd) * 83.0 / count(DISTINCT candidate_id), 2) AS inr_per_profile ...

-- ---------------------------------------------------------------------------
-- 3) Retry storm check (expect 0 rows)
-- ---------------------------------------------------------------------------
SELECT count(*) AS validation_failed_events
FROM platform_cost_events
WHERE created_at >= :window_start::timestamptz
  AND created_at < :window_end::timestamptz
  AND metadata->>'label' = 'fitscore_extraction_validation_failed';

-- ---------------------------------------------------------------------------
-- 4) WhatsApp OFF confirmation (expect 0 rows in window)
-- ---------------------------------------------------------------------------
SELECT count(*) AS whatsapp_send_events
FROM platform_cost_events
WHERE created_at >= :window_start::timestamptz
  AND created_at < :window_end::timestamptz
  AND (
    provider ILIKE '%whatsapp%'
    OR metadata->>'label' ILIKE '%whatsapp%'
    OR metadata->>'channel' = 'whatsapp'
  );

-- Optional: no new prescreen gate rows if gate is off
SELECT count(*) AS prescreen_gate_scores
FROM fit_scores
WHERE created_at >= :window_start::timestamptz
  AND created_at < :window_end::timestamptz
  AND scoring_method = 'prescreen_gate';

-- ---------------------------------------------------------------------------
-- 5) scoring_method hygiene for this window (expect hybrid_merged, model_used set)
-- ---------------------------------------------------------------------------
SELECT scoring_method, model_used, count(*)
FROM fit_scores
WHERE created_at >= :window_start::timestamptz
  AND created_at < :window_end::timestamptz
  AND scoring_status = 'scored'
GROUP BY 1, 2
ORDER BY 3 DESC;

-- ---------------------------------------------------------------------------
-- Baseline reference (prod 30d, pre-flag, for diff interpretation)
-- fitscore-hybrid-extraction-verdict  472  $8.01  (mostly Sonnet)
-- cv-parser-text                       66  $2.05
-- fitscore-hybrid-extraction           33  $0.10  (split path — should disappear)
-- fitscore-hybrid-explanation          18  $0.01
-- Welded path: verdict is inside fitscore-hybrid-extraction-verdict (same model as extraction).
-- Step 2 (Haiku) cuts that whole call ~2–3×. Phase 4 lazy verdict defers the *merged* call when
-- nobody opens a candidate — not a separate Sonnet verdict line.
