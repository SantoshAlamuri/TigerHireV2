-- One-time cleanup: remove junk/demo open jobs from candidate-facing WhatsApp menus.
-- Safe: listed jobs had zero applications at time of diagnosis (2026-06-05).

UPDATE jobs
SET
  status = 'closed',
  updated_at = now()
WHERE status = 'open'
  AND (
    -- Demo/seed fixture UUID prefix
    id::text LIKE 'f2000000%'
    -- Placeholder title
    OR lower(trim(title)) = 'job description'
    -- Known junk rows (prefix match; 0 applications at diagnosis)
    OR id::text LIKE '58284f4d%'
    OR id::text LIKE '7a553552%'
  );
