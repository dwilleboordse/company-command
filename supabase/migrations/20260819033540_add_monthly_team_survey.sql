create table public.monthly_survey_questions (
  id uuid primary key default gen_random_uuid(),
  question_key text not null,
  question_set_version smallint not null default 1 check (question_set_version > 0),
  sort_order smallint not null check (sort_order > 0),
  section text not null,
  prompt text not null,
  response_type text not null check (response_type in ('scale_1_10', 'long_text')),
  is_required boolean not null default true,
  scale_low_label text,
  scale_high_label text,
  source_header text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_key, question_set_version),
  unique (question_set_version, sort_order),
  constraint monthly_survey_question_key_format check (question_key ~ '^[a-z][a-z0-9_]*$'),
  constraint monthly_survey_scale_labels_valid check (
    response_type <> 'scale_1_10'
    or (scale_low_label is not null and scale_high_label is not null)
  )
);

comment on table public.monthly_survey_questions is
  'Versioned monthly team survey questions imported from the agency workbook. Questions are immutable once responses use their version.';

create table public.monthly_survey_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  survey_month date not null,
  question_set_version smallint not null default 1 check (question_set_version > 0),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  responses jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, survey_month),
  constraint monthly_survey_month_is_first_day check (extract(day from survey_month) = 1),
  constraint monthly_survey_responses_are_object check (jsonb_typeof(responses) = 'object')
);

comment on table public.monthly_survey_submissions is
  'One draft or submitted monthly survey per active team member for the calendar month being reviewed.';
comment on column public.monthly_survey_submissions.survey_month is
  'First day of the month being reviewed. A survey due on August 1 reviews July and stores 2026-07-01.';

create index monthly_survey_submissions_month_status_idx
  on public.monthly_survey_submissions (survey_month desc, status);

create or replace function public.validate_monthly_survey_submission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'draft' then
    new.submitted_at := null;
    return new;
  end if;

  if not exists (
    select 1
    from public.monthly_survey_questions question
    where question.question_set_version = new.question_set_version
  ) then
    raise exception using
      errcode = '23514',
      message = 'The selected monthly survey question set does not exist.';
  end if;

  if exists (
    select 1
    from public.monthly_survey_questions question
    where question.question_set_version = new.question_set_version
      and question.is_required is true
      and (
        not (new.responses ? question.question_key)
        or case
          when question.response_type = 'scale_1_10' then
            jsonb_typeof(new.responses -> question.question_key) <> 'number'
            or (new.responses ->> question.question_key)::numeric not between 1 and 10
          else nullif(btrim(new.responses ->> question.question_key), '') is null
        end
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Complete every required monthly survey question before submitting.';
  end if;

  new.submitted_at := coalesce(new.submitted_at, now());
  return new;
end;
$$;

revoke all on function public.validate_monthly_survey_submission() from public, anon, authenticated;

create trigger trg_monthly_survey_validate_submission
  before insert or update on public.monthly_survey_submissions
  for each row execute function public.validate_monthly_survey_submission();

create trigger trg_monthly_survey_submissions_updated_at
  before update on public.monthly_survey_submissions
  for each row execute function public.set_updated_at();

insert into public.monthly_survey_questions (
  question_key,
  question_set_version,
  sort_order,
  section,
  prompt,
  response_type,
  is_required,
  scale_low_label,
  scale_high_label,
  source_header
) values
  ('overall_performance', 1, 1, 'Performance', 'On a scale of 1–10, how would you rate your overall performance this month?', 'scale_1_10', true, 'Needs attention', 'Excellent', 'On a scale of 1–10, how would you rate your overall performance this month?'),
  ('proud_achievement', 1, 2, 'Performance', 'What’s one achievement from this month you’re most proud of?', 'long_text', true, null, null, 'What’s one achievement from this month you’re most proud of?'),
  ('client_impact', 1, 3, 'Client impact', 'On a scale of 1–10, how much impact do you feel your work had on our clients’ results this month?', 'scale_1_10', true, 'Low impact', 'High impact', 'On a scale of 1–10, how much impact do you feel your work had on our clients’ results this month?'),
  ('impact_example', 1, 4, 'Client impact', 'Can you share an example of how your work made a difference?', 'long_text', true, null, null, 'Can you share an example of how your work made a difference?'),
  ('challenge_effectiveness', 1, 5, 'Challenges', 'On a scale of 1–10, how effectively did you overcome challenges this month?', 'scale_1_10', true, 'Struggled', 'Very effectively', 'On a scale of 1–10, how effectively did you overcome challenges this month?'),
  ('biggest_challenge', 1, 6, 'Challenges', 'What was the biggest challenge you faced, and how did you handle it?', 'long_text', true, null, null, 'What was the biggest challenge you faced, and how did you handle it?'),
  ('learning_growth', 1, 7, 'Growth', 'On a scale of 1–10, how much did you learn or improve your skills this month?', 'scale_1_10', true, 'Limited growth', 'Significant growth', 'On a scale of 1–10, how much did you learn or improve your skills this month?'),
  ('valuable_learning', 1, 8, 'Growth', 'What’s the most valuable thing you learned?', 'long_text', true, null, null, 'What’s the most valuable thing you learned?'),
  ('team_collaboration', 1, 9, 'Teamwork', 'On a scale of 1–10, how well did we collaborate as a team this month?', 'scale_1_10', true, 'Poorly', 'Exceptionally', 'On a scale of 1–10, how well did we collaborate as a team this month?'),
  ('collaboration_feedback', 1, 10, 'Teamwork', 'What worked well and what could be better?', 'long_text', true, null, null, 'What worked well and what could be better?'),
  ('support_resources', 1, 11, 'Support', 'On a scale of 1–10, did you have the resources/support you needed to succeed?', 'scale_1_10', true, 'Missing support', 'Fully supported', 'On a scale of 1–10, did you have the resources/support you needed to succeed?'),
  ('missing_support', 1, 12, 'Support', 'If you were missing anything, what would have helped?', 'long_text', false, null, null, 'If you were missing anything, what would have helped?'),
  ('next_skill', 1, 13, 'Next month', 'What’s one skill you’d like to develop or strengthen next month?', 'long_text', true, null, null, 'What’s one skill you’d like to develop or strengthen next month?'),
  ('culture_feedback', 1, 14, 'Agency feedback', 'Anything you want to share that would help us improve the agency culture or client results?', 'long_text', false, null, null, 'Anything you want to share that would help us improve the agency culture or client results?');

alter table public.monthly_survey_questions enable row level security;
alter table public.monthly_survey_submissions enable row level security;

revoke all on table public.monthly_survey_questions from public, anon, authenticated;
revoke all on table public.monthly_survey_submissions from public, anon, authenticated;

grant select on table public.monthly_survey_questions to authenticated;
grant select, insert, update on table public.monthly_survey_submissions to authenticated;
grant all on table public.monthly_survey_questions to service_role;
grant all on table public.monthly_survey_submissions to service_role;

create policy "Authenticated team reads survey questions"
  on public.monthly_survey_questions
  for select
  to authenticated
  using (true);

create policy "Team members read own survey submissions"
  on public.monthly_survey_submissions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Team members create own survey submissions"
  on public.monthly_survey_submissions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Team members update own survey submissions"
  on public.monthly_survey_submissions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Management and Operations read all survey submissions"
  on public.monthly_survey_submissions
  for select
  to authenticated
  using (
    exists (
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
