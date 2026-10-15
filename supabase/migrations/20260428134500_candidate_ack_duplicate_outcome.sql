alter table public.candidate_acknowledgement_attempts
  drop constraint if exists candidate_acknowledgement_attempts_outcome_check;

alter table public.candidate_acknowledgement_attempts
  add constraint candidate_acknowledgement_attempts_outcome_check
  check (
    outcome in (
      'sent',
      'suppressed_no_channel',
      'suppressed_no_consent',
      'suppressed_duplicate',
      'suppressed_policy',
      'failed_provider'
    )
  );

