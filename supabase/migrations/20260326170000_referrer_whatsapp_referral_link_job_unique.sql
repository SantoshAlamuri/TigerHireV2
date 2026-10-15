-- One referrer row per WhatsApp (public re-onboarding upserts on this column).
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrers_whatsapp_unique
ON referrers (whatsapp_number)
WHERE whatsapp_number IS NOT NULL;

-- One shareable link per referrer per job (idempotent link generation).
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_links_referrer_job
ON referral_links (referrer_id, job_id);
