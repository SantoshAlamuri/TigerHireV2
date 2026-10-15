-- Give rejection reasons somewhere to live.
--
-- The v2 review queue asks for a structured reason on every reject, validates
-- it against a fixed list, and then has nowhere to put it: there is no
-- rejection_reason column on applications. The reason is discarded on write.
--
-- Three features are hollow as a result — the Talent Pool grouped by why
-- someone was passed over, the fairness view's reason distribution, and the
-- agency close-reason. All three currently render as empty or "no reason
-- recorded" for every row, which reads as "nobody gave reasons" rather than
-- "the product threw them away".
--
-- Additive and nullable: existing rows keep NULL, and NULL is displayed as
-- "No reason recorded" rather than being counted as a reason.

alter table public.applications
  add column if not exists rejection_reason text;

comment on column public.applications.rejection_reason is
  'Structured reason a candidate was rejected, from the fixed list in src/lib/v2/review-queue.ts. NULL means no reason was captured — it is never treated as a reason in its own right.';

-- Adverse-impact monitoring reads this grouped by reason, so the index matches
-- the access pattern rather than being speculative.
create index if not exists applications_rejection_reason_idx
  on public.applications (rejection_reason)
  where rejection_reason is not null;
