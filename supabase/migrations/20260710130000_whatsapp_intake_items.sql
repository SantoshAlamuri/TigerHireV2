-- WhatsApp intake inbox: resumes forwarded by partners (Apna etc.) to a dedicated
-- intake WhatsApp number. Each forwarded document lands here; processing pushes it
-- through the existing /api/intake/email pipeline (candidate create + gating + FitScore).
-- The intake number is a pure pipe — senders are partners, never candidates, so these
-- rows must never touch whatsapp_sessions or the candidate bot.

create table if not exists public.whatsapp_intake_items (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'apna',
  sender_phone text not null,
  wa_message_id text not null,
  media_id text,
  filename text,
  mime_type text,
  caption text,
  storage_path text,
  status text not null default 'received'
    check (status in ('received', 'stored', 'processed', 'failed', 'ignored')),
  error text,
  job_id uuid references public.jobs(id) on delete set null,
  candidate_id uuid references public.candidates(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Meta retries webhooks; the message id is the dedupe key.
create unique index if not exists whatsapp_intake_items_wa_message_id_key
  on public.whatsapp_intake_items (wa_message_id);

create index if not exists whatsapp_intake_items_status_created_idx
  on public.whatsapp_intake_items (status, created_at desc);

-- Service-role only (no policies): written by the webhook, read/managed via the
-- super_admin-gated /api/admin/whatsapp-intake route using the admin client.
alter table public.whatsapp_intake_items enable row level security;
