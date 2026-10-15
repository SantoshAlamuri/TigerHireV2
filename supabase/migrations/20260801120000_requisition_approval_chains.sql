-- Let a company describe its own requisition approval policy.
--
-- Today the chain is one of two hardcoded presets in
-- src/lib/workflows/requisition-approval-definitions.ts, and BOTH of them
-- always require Finance:
--
--   requisition_linear_v1              Finance -> Admin
--   requisition_parallel_hr_finance_v1 Finance + Admin, in parallel
--
-- So a company whose policy is "recruiter -> company admin", or
-- "HM -> company admin -> recruiter", or one with no finance function at all,
-- cannot express it. There is also no way to say that a role skips approval.
-- The result is that requisitions either sit waiting on an approver who does
-- not exist, or the whole gate gets worked around.
--
-- The runtime already supports this: workflow_stages carries a key, an order,
-- an approver role and its own SLA clock, and two stages sharing a step_order
-- run in parallel. Only the DEFINITION was missing. Nothing here changes how
-- approvals execute — it changes where the plan comes from.

create table if not exists public.requisition_approval_chains (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  description text,
  -- The chain used when a requisition does not name one. Exactly one per org.
  is_default boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.requisition_approval_chains is
  'Org-authored requisition approval policy. Replaces the two hardcoded presets; those remain as seed templates.';

-- One default per org, enforced by the database rather than by hoping the UI
-- gets it right — two defaults means the chain picked depends on row order.
create unique index if not exists requisition_approval_chains_one_default_idx
  on public.requisition_approval_chains (organisation_id)
  where is_default;

create index if not exists requisition_approval_chains_org_idx
  on public.requisition_approval_chains (organisation_id);

create table if not exists public.requisition_approval_chain_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.requisition_approval_chains (id) on delete cascade,
  -- Steps sharing a step_order approve in PARALLEL, which is how the existing
  -- parallel preset is expressed. Sequential is simply distinct orders.
  step_order integer not null check (step_order >= 1),
  approver_role text not null,
  sla_hours integer not null default 8 check (sla_hours > 0),

  -- Skip rules. Both are "this step does not apply", never "this step is
  -- approved" — a skipped step must not read as a granted approval.

  -- Skip when the person who raised the requisition holds one of these roles.
  -- The common case: a company admin raising their own requisition should not
  -- wait on company-admin approval.
  skip_when_raiser_role text[] not null default '{}',

  -- Skip when the requisition's budget is under this figure, in the same units
  -- as hiring_requests.budget_ctc_max. NULL means the step always applies —
  -- deliberately not 0, which would read as "skip when budget is under zero"
  -- and quietly never fire.
  skip_when_budget_below numeric,

  created_at timestamptz not null default now(),

  unique (chain_id, step_order, approver_role)
);

comment on column public.requisition_approval_chain_steps.step_order is
  'Steps sharing an order approve in parallel. Re-indexed at runtime after skips so a gap never stalls the chain.';
comment on column public.requisition_approval_chain_steps.skip_when_raiser_role is
  'Roles whose own requisitions bypass this step. A skipped step is not an approval and is recorded as skipped.';

create index if not exists requisition_approval_chain_steps_chain_idx
  on public.requisition_approval_chain_steps (chain_id, step_order);

-- Which chain a given requisition was planned from. Written at submit time so
-- that editing the policy later never rewrites the history of a decision
-- already taken — the same rule the rubric versions follow.
alter table public.hiring_requests
  add column if not exists approval_chain_id uuid
    references public.requisition_approval_chains (id) on delete set null;

comment on column public.hiring_requests.approval_chain_id is
  'The chain this requisition was planned from. Stamped at submit; editing the chain afterwards does not re-plan an in-flight requisition.';

alter table public.requisition_approval_chains enable row level security;
alter table public.requisition_approval_chain_steps enable row level security;

-- Reading the policy is not sensitive within the org — a hiring manager should
-- be able to see who will approve their requisition before they raise it.
-- Writing it is org-admin work.
drop policy if exists "requisition chains org read" on public.requisition_approval_chains;
create policy "requisition chains org read"
  on public.requisition_approval_chains
  for select
  using (organisation_id = public.auth_organisation_id());

drop policy if exists "requisition chains admin write" on public.requisition_approval_chains;
create policy "requisition chains admin write"
  on public.requisition_approval_chains
  for all
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('leadership', 'super_admin')
  )
  with check (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('leadership', 'super_admin')
  );

drop policy if exists "requisition chain steps org read" on public.requisition_approval_chain_steps;
create policy "requisition chain steps org read"
  on public.requisition_approval_chain_steps
  for select
  using (
    exists (
      select 1
      from public.requisition_approval_chains c
      where c.id = requisition_approval_chain_steps.chain_id
        and c.organisation_id = public.auth_organisation_id()
    )
  );

drop policy if exists "requisition chain steps admin write" on public.requisition_approval_chain_steps;
create policy "requisition chain steps admin write"
  on public.requisition_approval_chain_steps
  for all
  using (
    exists (
      select 1
      from public.requisition_approval_chains c
      where c.id = requisition_approval_chain_steps.chain_id
        and c.organisation_id = public.auth_organisation_id()
        and public.auth_role() in ('leadership', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.requisition_approval_chains c
      where c.id = requisition_approval_chain_steps.chain_id
        and c.organisation_id = public.auth_organisation_id()
        and public.auth_role() in ('leadership', 'super_admin')
    )
  );

-- Applied to preview (Sydney htdyomyhkvhcwoeodwas) 2026-08-01, verified green by
-- tests/integration/requisition-approval-chains.behavior.test.ts. NOT applied to
-- production (Mumbai qzhhhsvtyqyixpcdfhng).
--
-- No backfill. An org with no chain keeps using the preset it already uses, so
-- this migration changes nothing until someone authors a chain. Seeding every
-- org with a default here would silently alter who approves their requisitions.
