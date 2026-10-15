-- Migration 35: Processing status on candidates + WhatsApp 24hr window tracking
-- Source: V5 Supplementary G4 + G2

-- Add processing_status to candidates for idempotent CV processing
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS
  processing_status text DEFAULT 'pending';
  -- pending | processing | complete | failed

-- Add last_candidate_message_at to whatsapp_sessions for 24hr window enforcement
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS
  last_candidate_message_at timestamptz;

-- Add erased_at for retention policy tracking
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS
  erased_at timestamptz;

-- Add last_active_at for retention policy (auto-delete after 2 years inactive)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS
  last_active_at timestamptz DEFAULT now();
