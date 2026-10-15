-- Run on existing DBs that already have jobs without DeliverFlow columns.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shortlist_due_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shortlist_delivered_at timestamptz;
