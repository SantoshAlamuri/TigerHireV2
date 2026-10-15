create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  created_by_name text null,
  created_by_email text null,
  organisation_id uuid null references public.organisations(id) on delete set null,
  source text not null default 'in_app',
  category text not null,
  priority text not null default 'p3',
  status text not null default 'open',
  owner_team text not null default 'support_desk',
  assignee_user_id uuid null,
  subject text not null,
  description text not null,
  context_path text null,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz null,
  resolved_by uuid null,
  resolution_notes text null,
  constraint support_requests_source_check check (source in ('in_app', 'whatsapp', 'email', 'admin')),
  constraint support_requests_category_check check (
    category in ('billing', 'onboarding', 'access', 'reliability', 'general')
  ),
  constraint support_requests_priority_check check (priority in ('p1', 'p2', 'p3', 'p4')),
  constraint support_requests_status_check check (status in ('open', 'in_progress', 'resolved', 'cancelled'))
);

create index if not exists support_requests_status_idx on public.support_requests (status);
create index if not exists support_requests_priority_idx on public.support_requests (priority);
create index if not exists support_requests_org_idx on public.support_requests (organisation_id);
create index if not exists support_requests_created_at_idx on public.support_requests (created_at desc);

drop trigger if exists support_requests_updated_at on public.support_requests;
create trigger support_requests_updated_at
before update on public.support_requests
for each row execute function public.set_updated_at();
