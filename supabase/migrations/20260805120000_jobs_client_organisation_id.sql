-- Agency-owned jobs did not record which client they were being filled for.
--
-- That gap is load-bearing for tenancy. GET /api/candidates/[id] grants a
-- recruiter access via `[ownOrg, ...everyAgencyLinkedToOwnOrg]`, and
-- assertCandidateAccessForOrgs() resolves those org ids to *every* job the org
-- owns. Agencies do own jobs under their own organisation_id (see
-- api/agency/backfill-pipeline), so an agency serving two competing clients
-- made each client's recruiters able to read the other's candidates —
-- full profile, contact details included — given only a candidate UUID.
--
-- Without a client link on the job there is no way to narrow "reachable via my
-- agency" to "reachable via my agency, on my roles". This column is that link.
--
-- NULL means "not an agency-delegated job" (direct employer), which is the
-- overwhelming majority and needs no backfill.

alter table public.jobs
  add column if not exists client_organisation_id uuid
    references public.organisations(id) on delete set null;

comment on column public.jobs.client_organisation_id is
  'For agency-owned jobs: the client organisation this role is filled for. NULL for direct-employer jobs. Used by candidate tenancy checks to scope agency delegation to the delegating client.';

create index if not exists jobs_client_organisation_id_idx
  on public.jobs (client_organisation_id)
  where client_organisation_id is not null;

-- Backfill only where it is unambiguous: the owning org is an agency with
-- exactly one client, so the job can only have been for that client. Agencies
-- with several clients are left NULL deliberately — guessing there would
-- re-create the very leak this column exists to close. Those jobs stay
-- unreachable through agency delegation until someone sets the client
-- explicitly, which fails closed rather than open.
--
-- array_agg(...)[1] rather than min(): there is no min(uuid) in Postgres, so
-- this migration aborted with "function min(uuid) does not exist" on the first
-- database it was pointed at. The HAVING already guarantees a single distinct
-- value per agency, so this just takes it.
with single_client_agencies as (
  select agency_organisation_id,
         (array_agg(distinct client_organisation_id))[1] as client_organisation_id
  from public.agency_clients
  group by agency_organisation_id
  having count(distinct client_organisation_id) = 1
)
update public.jobs j
set client_organisation_id = a.client_organisation_id
from single_client_agencies a
where j.organisation_id = a.agency_organisation_id
  and j.client_organisation_id is null;
