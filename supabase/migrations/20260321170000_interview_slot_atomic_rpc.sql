-- Atomic interview slot mutations to avoid partial state updates in API handlers.

create or replace function public.th_reschedule_interview_slot(
  p_job_id uuid,
  p_old_slot_id uuid,
  p_new_slot_id uuid
)
returns table (
  success boolean,
  pipeline_candidate_id uuid,
  new_start_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_candidate_id uuid;
  v_new_start_at timestamptz;
begin
  update public.interview_availability_slots
  set status = 'available',
      pipeline_candidate_id = null
  where id = p_old_slot_id
    and job_id = p_job_id
    and status = 'booked'
    and pipeline_candidate_id is not null
  returning interview_availability_slots.pipeline_candidate_id into v_pipeline_candidate_id;

  if v_pipeline_candidate_id is null then
    return query select false, null::uuid, null::timestamptz, 'old_slot_not_booked'::text;
    return;
  end if;

  update public.interview_availability_slots
  set status = 'booked',
      pipeline_candidate_id = v_pipeline_candidate_id
  where id = p_new_slot_id
    and job_id = p_job_id
    and status = 'available'
  returning start_at into v_new_start_at;

  if v_new_start_at is null then
    -- Restore old slot before returning failure.
    update public.interview_availability_slots
    set status = 'booked',
        pipeline_candidate_id = v_pipeline_candidate_id
    where id = p_old_slot_id
      and job_id = p_job_id
      and status = 'available';

    return query select false, v_pipeline_candidate_id, null::timestamptz, 'new_slot_unavailable'::text;
    return;
  end if;

  update public.pipeline_candidates
  set interview_scheduled_at = v_new_start_at,
      reminder_sent_at = null
  where id = v_pipeline_candidate_id;

  if not found then
    -- Restore both slots and abort the operation.
    update public.interview_availability_slots
    set status = 'available',
        pipeline_candidate_id = null
    where id = p_new_slot_id
      and job_id = p_job_id
      and pipeline_candidate_id = v_pipeline_candidate_id;

    update public.interview_availability_slots
    set status = 'booked',
        pipeline_candidate_id = v_pipeline_candidate_id
    where id = p_old_slot_id
      and job_id = p_job_id
      and status = 'available';

    return query select false, v_pipeline_candidate_id, null::timestamptz, 'pipeline_candidate_missing'::text;
    return;
  end if;

  return query select true, v_pipeline_candidate_id, v_new_start_at, null::text;
end;
$$;

create or replace function public.th_cancel_interview_slot(
  p_job_id uuid,
  p_slot_id uuid
)
returns table (
  success boolean,
  pipeline_candidate_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_candidate_id uuid;
begin
  update public.interview_availability_slots
  set status = 'available',
      pipeline_candidate_id = null
  where id = p_slot_id
    and job_id = p_job_id
    and status = 'booked'
    and pipeline_candidate_id is not null
  returning interview_availability_slots.pipeline_candidate_id into v_pipeline_candidate_id;

  if v_pipeline_candidate_id is null then
    return query select false, null::uuid, 'slot_not_booked'::text;
    return;
  end if;

  update public.pipeline_candidates
  set interview_scheduled_at = null,
      reminder_sent_at = null
  where id = v_pipeline_candidate_id;

  if not found then
    -- Restore slot assignment before returning failure.
    update public.interview_availability_slots
    set status = 'booked',
        pipeline_candidate_id = v_pipeline_candidate_id
    where id = p_slot_id
      and job_id = p_job_id
      and status = 'available';

    return query select false, v_pipeline_candidate_id, 'pipeline_candidate_missing'::text;
    return;
  end if;

  return query select true, v_pipeline_candidate_id, null::text;
end;
$$;

grant execute on function public.th_reschedule_interview_slot(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.th_cancel_interview_slot(uuid, uuid) to authenticated, service_role;
