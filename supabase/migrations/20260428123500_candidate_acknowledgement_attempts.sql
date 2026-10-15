create table if not exists public.candidate_acknowledgement_attempts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete set null,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  event_type text not null check (event_type in ('cv_ingested', 'status_changed', 'referral_pre_consent')),
  ingestion_path text not null check (
    ingestion_path in (
      'logged_in_apply',
      'public_apply',
      'agency_single',
      'agency_bulk',
      'email_intake',
      'referral_pre_consent'
    )
  ),
  channel text not null check (channel in ('email', 'whatsapp')),
  template_variant text,
  outcome text not null check (
    outcome in (
      'sent',
      'suppressed_no_channel',
      'suppressed_no_consent',
      'suppressed_duplicate',
      'suppressed_policy',
      'failed_provider'
    )
  ),
  reason_code text,
  reason_detail text,
  provider text,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_candidate_ack_attempts_candidate_created
  on public.candidate_acknowledgement_attempts (candidate_id, created_at desc);

create index if not exists idx_candidate_ack_attempts_application_created
  on public.candidate_acknowledgement_attempts (application_id, created_at desc)
  where application_id is not null;

create index if not exists idx_candidate_ack_attempts_job_created
  on public.candidate_acknowledgement_attempts (job_id, created_at desc)
  where job_id is not null;

alter table public.candidate_acknowledgement_attempts enable row level security;

drop policy if exists "candidate_ack_attempts_select_org" on public.candidate_acknowledgement_attempts;
create policy "candidate_ack_attempts_select_org"
  on public.candidate_acknowledgement_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      join public.profiles p on p.organisation_id = j.organisation_id
      where j.id = candidate_acknowledgement_attempts.job_id
        and p.id = auth.uid()
    )
  );

drop policy if exists "candidate_ack_attempts_service_write" on public.candidate_acknowledgement_attempts;
create policy "candidate_ack_attempts_service_write"
  on public.candidate_acknowledgement_attempts
  for all
  to service_role
  using (true)
  with check (true);

insert into public.feature_flags (key, enabled, description)
values
  ('ack_notifier_enabled', false, 'Global gate for centralized candidate acknowledgement notifier.'),
  ('ack_email_channel_enabled', false, 'Enable email acknowledgement channel in centralized notifier.'),
  ('ack_whatsapp_channel_enabled', false, 'Enable WhatsApp acknowledgement channel in centralized notifier.'),
  ('ack_logged_in_apply_enabled', false, 'Enable centralized acknowledgement on logged-in candidate apply path.'),
  ('ack_public_apply_enabled', false, 'Enable centralized acknowledgement on public apply path.'),
  ('ack_agency_single_enabled', false, 'Enable centralized acknowledgement on agency single-upload path.'),
  ('ack_agency_bulk_enabled', false, 'Enable centralized acknowledgement on agency bulk-upload path.'),
  ('ack_email_intake_enabled', false, 'Enable centralized acknowledgement on email intake path.'),
  ('ack_referral_pre_consent_enabled', false, 'Enable centralized acknowledgement handling for referral pre-consent flow.')
on conflict (key) do nothing;

