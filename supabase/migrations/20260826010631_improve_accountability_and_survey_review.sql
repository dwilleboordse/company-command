alter table public.accountability_logs
  add column if not exists weekly_update_status text not null default 'not_sent',
  add column if not exists growth_tracker_logged boolean not null default false;

update public.accountability_logs
set weekly_update_status = case
  when weekly_update_sent is true then 'sent'
  else 'not_sent'
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accountability_logs_weekly_update_status_check'
      and conrelid = 'public.accountability_logs'::regclass
  ) then
    alter table public.accountability_logs
      add constraint accountability_logs_weekly_update_status_check
      check (weekly_update_status in ('sent', 'partial', 'not_sent'));
  end if;
end
$$;

comment on column public.accountability_logs.weekly_update_status is
  'Three-state weekly update result: sent, partial, or not_sent. Backfilled from weekly_update_sent without removing the legacy field.';
comment on column public.accountability_logs.growth_tracker_logged is
  'Whether the team member logged their Growth Tracker for this accountability week.';

create or replace function public.sync_accountability_weekly_update_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.weekly_update_status = 'not_sent' and new.weekly_update_sent is true then
      new.weekly_update_status := 'sent';
    else
      new.weekly_update_sent := new.weekly_update_status = 'sent';
    end if;
  elsif new.weekly_update_status is distinct from old.weekly_update_status then
    new.weekly_update_sent := new.weekly_update_status = 'sent';
  elsif new.weekly_update_sent is distinct from old.weekly_update_sent then
    new.weekly_update_status := case
      when new.weekly_update_sent is true then 'sent'
      else 'not_sent'
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_accountability_weekly_update_fields() from public, anon, authenticated;

drop trigger if exists trg_accountability_weekly_update_sync on public.accountability_logs;
create trigger trg_accountability_weekly_update_sync
  before insert or update of weekly_update_status, weekly_update_sent
  on public.accountability_logs
  for each row execute function public.sync_accountability_weekly_update_fields();

create index if not exists accountability_logs_logged_by_idx
  on public.accountability_logs (logged_by)
  where logged_by is not null;

alter table public.monthly_survey_feedback
  add column if not exists praises text not null default '',
  add column if not exists growth_notes text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monthly_survey_feedback_summary_notes_length'
      and conrelid = 'public.monthly_survey_feedback'::regclass
  ) then
    alter table public.monthly_survey_feedback
      add constraint monthly_survey_feedback_summary_notes_length
      check (length(praises) <= 5000 and length(growth_notes) <= 5000);
  end if;
end
$$;

comment on column public.monthly_survey_feedback.praises is
  'Overall praise drafted by Management or Operations and visible to the team member only after finalization.';
comment on column public.monthly_survey_feedback.growth_notes is
  'Overall growth notes drafted by Management or Operations and visible to the team member only after finalization.';

create or replace function public.validate_monthly_survey_feedback()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  submission_version smallint;
begin
  if caller_id is null then
    raise exception using
      errcode = '42501',
      message = 'Sign in before changing monthly survey feedback.';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = caller_id
      and profile.is_active is true
      and (
        profile.role in ('ceo', 'management')
        or profile.position in ('ops_manager', 'ops_assistant')
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only active Management or Operations team members can edit survey feedback.';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'finalized' then
      raise exception using
        errcode = '23514',
        message = 'Finalized monthly survey feedback is locked.';
    end if;

    if new.submission_id <> old.submission_id then
      raise exception using
        errcode = '23514',
        message = 'Monthly survey feedback cannot be moved to another submission.';
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
  elsif new.status <> 'draft' then
    raise exception using
      errcode = '23514',
      message = 'Monthly survey feedback must be saved as a draft before finalization.';
  else
    new.created_by := caller_id;
    new.created_at := now();
  end if;

  select submission.question_set_version
  into submission_version
  from public.monthly_survey_submissions submission
  where submission.id = new.submission_id
    and submission.status = 'submitted';

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Feedback can only be added to a submitted monthly survey.';
  end if;

  if exists (
    select 1
    from jsonb_each(new.feedback) item
    left join public.monthly_survey_questions question
      on question.question_key = item.key
      and question.question_set_version = submission_version
    where question.id is null
      or jsonb_typeof(item.value) <> 'string'
      or length(item.value #>> '{}') > 5000
  ) then
    raise exception using
      errcode = '23514',
      message = 'Feedback must use valid survey question keys and text values up to 5,000 characters.';
  end if;

  select coalesce(
    jsonb_object_agg(item.key, to_jsonb(btrim(item.value #>> '{}'))),
    '{}'::jsonb
  )
  into new.feedback
  from jsonb_each(new.feedback) item
  where nullif(btrim(item.value #>> '{}'), '') is not null;

  new.praises := btrim(coalesce(new.praises, ''));
  new.growth_notes := btrim(coalesce(new.growth_notes, ''));

  if length(new.praises) > 5000 or length(new.growth_notes) > 5000 then
    raise exception using
      errcode = '23514',
      message = 'Praises and growth notes must each be 5,000 characters or fewer.';
  end if;

  new.updated_by := caller_id;
  new.updated_at := now();

  if new.status = 'finalized' then
    if not exists (
      select 1
      from public.profiles profile
      where profile.id = caller_id
        and profile.is_active is true
        and (
          profile.role = 'ceo'
          or profile.position in ('ops_manager', 'ops_assistant')
        )
    ) then
      raise exception using
        errcode = '42501',
        message = 'Only Operations or the CEO can finalize monthly survey feedback.';
    end if;

    if new.feedback = '{}'::jsonb and new.praises = '' and new.growth_notes = '' then
      raise exception using
        errcode = '23514',
        message = 'Add feedback, praise, or a growth note before finalizing.';
    end if;

    new.finalized_by := caller_id;
    new.finalized_at := now();
  else
    new.finalized_by := null;
    new.finalized_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_monthly_survey_feedback() from public, anon, authenticated;
