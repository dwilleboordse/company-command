create table public.monthly_survey_feedback (
  submission_id uuid primary key references public.monthly_survey_submissions(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  feedback jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  finalized_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_survey_feedback_is_object check (jsonb_typeof(feedback) = 'object'),
  constraint monthly_survey_feedback_finalization_complete check (
    (status = 'draft' and finalized_by is null and finalized_at is null)
    or (status = 'finalized' and finalized_at is not null)
  )
);

comment on table public.monthly_survey_feedback is
  'Private per-answer management feedback for a submitted monthly survey. Team members can read it only after Operations or the CEO finalizes it.';
comment on column public.monthly_survey_feedback.feedback is
  'JSON object keyed by monthly_survey_questions.question_key. Blank feedback entries are removed before storage.';

create index monthly_survey_feedback_created_by_idx
  on public.monthly_survey_feedback (created_by)
  where created_by is not null;
create index monthly_survey_feedback_updated_by_idx
  on public.monthly_survey_feedback (updated_by)
  where updated_by is not null;
create index monthly_survey_feedback_finalized_by_idx
  on public.monthly_survey_feedback (finalized_by)
  where finalized_by is not null;

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

    if new.feedback = '{}'::jsonb then
      raise exception using
        errcode = '23514',
        message = 'Add feedback to at least one survey answer before finalizing.';
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

create trigger trg_monthly_survey_feedback_validate
  before insert or update on public.monthly_survey_feedback
  for each row execute function public.validate_monthly_survey_feedback();

create or replace function public.lock_monthly_survey_after_finalized_feedback()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.monthly_survey_feedback review
    where review.submission_id = old.id
      and review.status = 'finalized'
  ) then
    raise exception using
      errcode = '23514',
      message = 'This monthly survey is locked because its management feedback has been finalized.';
  end if;

  return new;
end;
$$;

revoke all on function public.lock_monthly_survey_after_finalized_feedback() from public, anon, authenticated;

create trigger trg_monthly_survey_lock_after_feedback
  before update on public.monthly_survey_submissions
  for each row execute function public.lock_monthly_survey_after_finalized_feedback();

alter table public.monthly_survey_feedback enable row level security;

revoke all on table public.monthly_survey_feedback from public, anon, authenticated;
grant select, insert, update on table public.monthly_survey_feedback to authenticated;
grant all on table public.monthly_survey_feedback to service_role;

create policy "Authorized users read survey feedback"
  on public.monthly_survey_feedback
  for select
  to authenticated
  using (
    (
      status = 'finalized'
      and exists (
        select 1
        from public.monthly_survey_submissions submission
        where submission.id = monthly_survey_feedback.submission_id
          and submission.user_id = (select auth.uid())
      )
    )
    or exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_active is true
        and (
          profile.role in ('ceo', 'management')
          or profile.position in ('ops_manager', 'ops_assistant')
        )
    )
  );

create policy "Management and Operations create survey feedback drafts"
  on public.monthly_survey_feedback
  for insert
  to authenticated
  with check (
    status = 'draft'
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_active is true
        and (
          profile.role in ('ceo', 'management')
          or profile.position in ('ops_manager', 'ops_assistant')
        )
    )
    and exists (
      select 1
      from public.monthly_survey_submissions submission
      where submission.id = monthly_survey_feedback.submission_id
        and submission.status = 'submitted'
    )
  );

create policy "Management and Operations update survey feedback"
  on public.monthly_survey_feedback
  for update
  to authenticated
  using (
    status = 'draft'
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_active is true
        and (
          profile.role in ('ceo', 'management')
          or profile.position in ('ops_manager', 'ops_assistant')
        )
    )
  )
  with check (
    (
      status = 'draft'
      and exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and profile.is_active is true
          and (
            profile.role in ('ceo', 'management')
            or profile.position in ('ops_manager', 'ops_assistant')
          )
      )
    )
    or (
      status = 'finalized'
      and exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and profile.is_active is true
          and (
            profile.role = 'ceo'
            or profile.position in ('ops_manager', 'ops_assistant')
          )
        )
    )
  );
