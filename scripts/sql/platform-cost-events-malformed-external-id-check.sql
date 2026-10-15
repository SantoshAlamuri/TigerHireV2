-- Acceptance test E (platform-cost-ledger-hardening): alert if stringified-object bugs land in external_id.
-- Run manually or schedule (e.g. weekly). Expect count = 0 after ledger hardening deploy.
SELECT id,
       external_id,
       occurred_at,
       metadata ->> 'label' AS label
FROM platform_cost_events
WHERE provider = 'anthropic'
  AND (
    external_id = '[object Object]'
    OR external_id LIKE '%[object Object]%'
  )
  AND occurred_at > (now() AT TIME ZONE 'utc') - interval '7 days'
ORDER BY occurred_at DESC
LIMIT 100;
