-- Add replies without reopening or rewriting finalized feedback/survey answers.
create table public.monthly_survey_feedback_replies (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.monthly_survey_feedback(submission_id) on delete restrict,
  section_key text not null,
  body text not null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_name text not null,
  created_at timestamptz not null default now(),
  constraint monthly_survey_reply_body_length check (char_length(body) between 1 and 5000),
  constraint monthly_survey_reply_section_format check (
    section_key in ('praises', 'growth_notes') or section_key ~ '^question:[a-z][a-z0-9_]*$'
  )
);

comment on table public.monthly_survey_feedback_replies is
  'Append-only replies from a survey owner to published management feedback. Original answers and finalized feedback remain locked.';
comment on column public.monthly_survey_feedback_replies.section_key is
  'question:<question_key> links to per-answer feedback; praises and growth_notes link to published month-level notes.';
comment on column public.monthly_survey_feedback_replies.id is
  'Client-generated UUID retained across uncertain retries to avoid duplicate messages.';
comment on column public.monthly_survey_feedback_replies.author_name is
  'Display-name snapshot stamped from the authenticated author profile, never trusted from the client.';

create index monthly_survey_feedback_replies_review_order_idx
  on public.monthly_survey_feedback_replies (submission_id, created_at, id);
create index monthly_survey_feedback_replies_author_idx
  on public.monthly_survey_feedback_replies (author_id);

create function public.validate_monthly_survey_feedback_reply()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_name text;
  review public.monthly_survey_feedback%rowtype;
  survey_version smallint;
  question_key_value text;
  published_text text;
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '23514',
      message = 'Sent survey feedback replies cannot be edited or deleted. Send a follow-up reply instead.';
  end if;

  select profile.full_name into caller_name
  from public.profiles profile
  where profile.id = caller_id and profile.is_active is true;
  if caller_id is null or not found then
    raise exception using errcode = '42501',
      message = 'Only an active signed-in team member can send a survey feedback reply.';
  end if;

  select feedback.* into review
  from public.monthly_survey_feedback feedback
  join public.monthly_survey_submissions submission on submission.id = feedback.submission_id
  where feedback.submission_id = new.submission_id
    and feedback.status = 'finalized'
    and submission.status = 'submitted'
    and submission.user_id = caller_id;
  if not found then
    raise exception using errcode = '42501',
      message = 'You can only reply to finalized feedback on your own submitted survey.';
  end if;

  if new.section_key = 'praises' then
    published_text := review.praises;
  elsif new.section_key = 'growth_notes' then
    published_text := review.growth_notes;
  elsif left(new.section_key, 9) = 'question:' then
    question_key_value := substr(new.section_key, 10);
    select submission.question_set_version into survey_version
    from public.monthly_survey_submissions submission where submission.id = new.submission_id;
    if not exists (
      select 1 from public.monthly_survey_questions question
      where question.question_key = question_key_value
        and question.question_set_version = survey_version
    ) or jsonb_typeof(review.feedback -> question_key_value) is distinct from 'string' then
      raise exception using errcode = '23514', message = 'Choose an existing published feedback item to reply to.';
    end if;
    published_text := review.feedback ->> question_key_value;
  else
    raise exception using errcode = '23514', message = 'Choose an existing published feedback item to reply to.';
  end if;

  if nullif(btrim(published_text, E' \t\n\r\f' || chr(11) || chr(160) || chr(65279)), '') is null then
    raise exception using errcode = '23514', message = 'Replies are only available for feedback that was published.';
  end if;

  new.body := btrim(new.body, E' \t\n\r\f' || chr(11) || chr(160) || chr(65279));
  if new.body is null or char_length(new.body) not between 1 and 5000 then
    raise exception using errcode = '23514', message = 'Enter a reply between 1 and 5,000 characters.';
  end if;

  new.author_id := caller_id;
  new.author_name := coalesce(nullif(btrim(caller_name), ''), 'Team member');
  new.created_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.validate_monthly_survey_feedback_reply() from public, anon, authenticated;

create trigger trg_monthly_survey_feedback_reply_validate
  before insert or update or delete on public.monthly_survey_feedback_replies
  for each row execute function public.validate_monthly_survey_feedback_reply();

alter table public.monthly_survey_feedback_replies enable row level security;
revoke all on table public.monthly_survey_feedback_replies from public, anon, authenticated;
grant select, insert on table public.monthly_survey_feedback_replies to authenticated;
grant select, insert on table public.monthly_survey_feedback_replies to service_role;

create policy "Survey owners and reviewers read published feedback replies"
  on public.monthly_survey_feedback_replies for select to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.is_active is true
        and (
          profile.id = monthly_survey_feedback_replies.author_id
          or profile.role in ('ceo', 'management')
          or profile.position in ('ops_manager', 'ops_assistant')
          or (select public.has_ai_engineer_access())
        )
    )
    and exists (
      select 1 from public.monthly_survey_feedback feedback
      where feedback.submission_id = monthly_survey_feedback_replies.submission_id
        and feedback.status = 'finalized'
    )
  );

create policy "Active survey owners send replies after feedback finalization"
  on public.monthly_survey_feedback_replies for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.is_active is true
    )
    and exists (
      select 1 from public.monthly_survey_submissions submission
      join public.monthly_survey_feedback feedback on feedback.submission_id = submission.id
      where submission.id = monthly_survey_feedback_replies.submission_id
        and submission.user_id = (select auth.uid())
        and submission.status = 'submitted'
        and feedback.status = 'finalized'
    )
  );
