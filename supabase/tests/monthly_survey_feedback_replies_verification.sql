-- Run as postgres after the feedback replies migration. All actors, records,
-- attempted writes and helper functions are synthetic and rolled back. This
-- exercises real grants, RLS and validation triggers without disabling them.
begin;

create temporary table survey_reply_test_ids(label text primary key, id uuid not null);
create temporary table survey_reply_test_results(test text primary key, passed boolean not null);
create temporary table survey_reply_originals(submission_id uuid primary key, submission jsonb, feedback jsonb);
grant all on survey_reply_test_ids, survey_reply_test_results, survey_reply_originals to authenticated;
grant insert on survey_reply_test_results to anon;

create function pg_temp.survey_reply_assert(condition boolean, label text)
returns void language plpgsql security invoker as $$
begin
  if condition is distinct from true then
    raise exception 'Monthly survey reply assertion failed: %', label;
  end if;
  insert into survey_reply_test_results values(label, true);
end;
$$;

create function pg_temp.survey_reply_reject(statement text, label text,
  expected_states text[] default array['42501','23514'])
returns void language plpgsql security invoker as $$
declare rejected boolean := false;
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = any(expected_states) then rejected := true; else raise; end if;
  end;
  perform pg_temp.survey_reply_assert(rejected, label);
end;
$$;

select pg_temp.survey_reply_assert((
  select relrowsecurity from pg_class where oid='public.monthly_survey_feedback_replies'::regclass
), 'reply table enables RLS');
select pg_temp.survey_reply_assert(
  has_table_privilege('authenticated','public.monthly_survey_feedback_replies','SELECT')
  and has_table_privilege('authenticated','public.monthly_survey_feedback_replies','INSERT'),
  'authenticated may select and insert subject to RLS');
select pg_temp.survey_reply_assert(
  not has_table_privilege('authenticated','public.monthly_survey_feedback_replies','UPDATE')
  and not has_table_privilege('authenticated','public.monthly_survey_feedback_replies','DELETE')
  and not has_table_privilege('authenticated','public.monthly_survey_feedback_replies','TRUNCATE'),
  'authenticated has no destructive reply privileges');
select pg_temp.survey_reply_assert(
  not has_table_privilege('anon','public.monthly_survey_feedback_replies','SELECT')
  and not has_table_privilege('anon','public.monthly_survey_feedback_replies','INSERT'),
  'anonymous role has no reply privileges');

insert into survey_reply_test_ids
  select label, gen_random_uuid() from unnest(array[
    'owner','other','ceo','management','ops_manager','ops_assistant',
    'ai','unprovisioned_ai','head','inactive_ceo'
  ]) label;
insert into auth.users(id,email)
  select id, 'survey-reply-test-' || id || '@example.invalid' from survey_reply_test_ids;
insert into public.profiles(id,email,full_name,role,position,department,is_active)
  select id, 'survey-reply-test-' || id || '@example.invalid', 'Synthetic ' || label,
    case when label in ('ceo','inactive_ceo') then 'ceo'
      when label='management' then 'management'
      when label in ('ai','unprovisioned_ai') then 'ai_engineer' else 'athlete' end,
    case when label in ('ops_manager','ops_assistant') then label
      when label in ('ai','unprovisioned_ai') then 'ai_engineer'
      when label='head' then 'head_of_creative_strategy' else 'creative_strategist' end,
    case when label in ('ops_manager','ops_assistant') then 'operations' else 'delivery' end,
    label <> 'inactive_ceo'
  from survey_reply_test_ids
  on conflict(id) do update set full_name=excluded.full_name, role=excluded.role,
    position=excluded.position, department=excluded.department, is_active=excluded.is_active;
insert into private.application_access(profile_id,capability)
  select id,'ai_engineer_full_access' from survey_reply_test_ids where label='ai';

-- Each submission uses a real question-set definition but fabricated answers.
-- No production survey response or feedback text is selected by this harness.
insert into survey_reply_test_ids
  select label,gen_random_uuid() from unnest(array[
    'final','draft','absent','other_final','empty_sections','first_reply','spoof_reply'
  ]) label;
insert into public.monthly_survey_submissions(id,user_id,survey_month,question_set_version,status,responses)
  select fixture.id,
    (select id from survey_reply_test_ids where label=case when fixture.label='other_final' then 'other' else 'owner' end),
    (date_trunc('month',now() at time zone 'Asia/Dubai') -
      case fixture.label when 'final' then interval '1 month' when 'draft' then interval '2 months'
        when 'absent' then interval '3 months' when 'empty_sections' then interval '4 months'
        else interval '1 month' end)::date,
    q.question_set_version,'submitted',
    jsonb_object_agg(q.question_key,case when q.response_type='scale_1_10'
      then '7'::jsonb else to_jsonb('Synthetic answer'::text) end)
  from survey_reply_test_ids fixture cross join public.monthly_survey_questions q
  where fixture.label in ('final','draft','absent','other_final','empty_sections')
    and q.question_set_version=(select max(question_set_version) from public.monthly_survey_questions)
  group by fixture.id,fixture.label,q.question_set_version;

do $$
declare
  v_owner uuid := (select id from survey_reply_test_ids where label='owner');
  v_other uuid := (select id from survey_reply_test_ids where label='other');
  v_final uuid := (select id from survey_reply_test_ids where label='final');
  v_draft uuid := (select id from survey_reply_test_ids where label='draft');
  v_absent uuid := (select id from survey_reply_test_ids where label='absent');
  v_other_final uuid := (select id from survey_reply_test_ids where label='other_final');
  v_empty uuid := (select id from survey_reply_test_ids where label='empty_sections');
  v_first uuid := (select id from survey_reply_test_ids where label='first_reply');
  v_spoof uuid := (select id from survey_reply_test_ids where label='spoof_reply');
  v_question text;
  v_unanswered text;
  v_actor uuid;
  v_label text;
  v_key text;
  v_body text;
  v_id uuid;
  v_count bigint;
  v_initial_count bigint;
  v_can_read boolean;
  v_rejected boolean;
  v_row public.monthly_survey_feedback_replies%rowtype;
begin
  select question_key into v_question from public.monthly_survey_questions
    where question_set_version=(select max(question_set_version) from public.monthly_survey_questions)
    order by sort_order limit 1;
  select question_key into v_unanswered from public.monthly_survey_questions
    where question_set_version=(select max(question_set_version) from public.monthly_survey_questions)
      and question_key<>v_question order by sort_order limit 1;
  perform pg_temp.survey_reply_assert(v_question is not null and v_unanswered is not null,
    'fixture has two valid question keys');
  perform pg_temp.survey_reply_assert((select count(*)=5 from public.monthly_survey_submissions
    where id in (v_final,v_draft,v_absent,v_other_final,v_empty)), 'synthetic surveys pass normal validation');

  -- Publish through the actual workflow: draft first, then finalize as CEO.
  perform set_config('request.jwt.claim.sub',(select id::text from survey_reply_test_ids where label='ceo'),true);
  execute 'set local role authenticated';
  insert into public.monthly_survey_feedback(submission_id,feedback,praises,growth_notes)
    select id,jsonb_build_object(v_question,'Synthetic follow-up question?'),
      case when label='empty_sections' then '' else 'Synthetic praise question?' end,
      case when label='empty_sections' then '' else 'Synthetic growth question?' end
    from survey_reply_test_ids where label in ('final','draft','other_final','empty_sections');
  update public.monthly_survey_feedback set status='finalized'
    where submission_id in (v_final,v_other_final,v_empty);
  perform pg_temp.survey_reply_assert((select count(*)=3 from public.monthly_survey_feedback
    where submission_id in (v_final,v_other_final,v_empty) and status='finalized'),
    'synthetic feedback finalized through normal workflow');
  execute 'reset role';
  insert into survey_reply_originals
    select s.id,to_jsonb(s),to_jsonb(f) from public.monthly_survey_submissions s
    join public.monthly_survey_feedback f on f.submission_id=s.id
    where s.id in (v_final,v_draft,v_other_final,v_empty);

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  execute 'set local role authenticated';
  perform pg_temp.survey_reply_assert(exists(select 1 from public.monthly_survey_feedback where submission_id=v_final),
    'owner sees published management feedback');
  perform pg_temp.survey_reply_assert(not exists(select 1 from public.monthly_survey_feedback where submission_id=v_draft),
    'owner still cannot see private draft management feedback');
  insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body)
    values(v_first,v_final,'question:' || v_question,'  Synthetic response to your question  ')
    returning * into v_row;
  perform pg_temp.survey_reply_assert(v_row.body='Synthetic response to your question', 'reply body is trimmed');
  perform pg_temp.survey_reply_assert(v_row.author_id=v_owner and v_row.author_name='Synthetic owner',
    'owner identity is stamped by server');
  perform pg_temp.survey_reply_assert(v_row.created_at >= transaction_timestamp()
    and v_row.created_at <= clock_timestamp(), 'reply creation time is server generated');
  perform pg_temp.survey_reply_assert(v_row.id=v_first, 'client retry key is preserved');

  insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body)
    values(gen_random_uuid(),v_final,'praises','Synthetic praise reply'),
      (gen_random_uuid(),v_final,'growth_notes','Synthetic growth reply'),
      (gen_random_uuid(),v_final,'question:' || v_question,'Synthetic follow-up reply');
  perform pg_temp.survey_reply_assert((select count(*)=4 from public.monthly_survey_feedback_replies
    where submission_id=v_final), 'owner can append replies to every published section');

  -- INSERT is deliberately not UPDATE/upsert: retrying a key must never rewrite
  -- an existing reply. The frontend can verify the existing row after a retry.
  perform pg_temp.survey_reply_reject(format(
    'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
    v_first,v_final,'question:' || v_question,'Synthetic changed retry'),
    'duplicate retry key is rejected',array['23505']);
  perform pg_temp.survey_reply_assert((select body='Synthetic response to your question'
    from public.monthly_survey_feedback_replies where id=v_first), 'retry cannot overwrite existing reply');

  -- A column grant may reject spoof fields entirely; otherwise the validation
  -- trigger must overwrite every caller-supplied attribution and timestamp.
  v_rejected := false;
  begin
    insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body,author_id,author_name,created_at)
      values(v_spoof,v_final,'praises','Synthetic attribution test',v_other,'Forged CEO','2001-01-01'::timestamptz);
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.survey_reply_assert(v_rejected or exists(
    select 1 from public.monthly_survey_feedback_replies where id=v_spoof
      and author_id=v_owner and author_name='Synthetic owner'
      and created_at>=transaction_timestamp() and created_at<=clock_timestamp()
  ), 'caller cannot spoof author identity or creation time');

  foreach v_body in array array['','   ',E'\t\n\r\f',chr(160) || chr(65279),repeat('x',5001)] loop
    perform pg_temp.survey_reply_reject(format(
      'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
      gen_random_uuid(),v_final,'praises',v_body),
      'invalid reply body rejected length ' || length(v_body),array['23514']);
  end loop;
  perform pg_temp.survey_reply_reject(format(
    'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,null)',
    gen_random_uuid(),v_final,'praises'), 'null reply body denied',array['23502','23514']);
  insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body)
    values(gen_random_uuid(),v_final,'growth_notes',repeat('x',5000));
  perform pg_temp.survey_reply_assert(exists(select 1 from public.monthly_survey_feedback_replies
    where submission_id=v_final and length(body)=5000), '5000 character reply accepted');
  insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body)
    values(gen_random_uuid(),v_final,'growth_notes','x');
  perform pg_temp.survey_reply_assert(exists(select 1 from public.monthly_survey_feedback_replies
    where submission_id=v_final and body='x'), 'one character reply accepted');

  foreach v_key in array array['unknown','question:does_not_exist','question:' || v_unanswered,'question:',''] loop
    perform pg_temp.survey_reply_reject(format(
      'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
      gen_random_uuid(),v_final,v_key,'Synthetic invalid section reply'),
      'unpublished or invalid section denied ' || v_key);
  end loop;
  foreach v_key in array array['praises','growth_notes'] loop
    perform pg_temp.survey_reply_reject(format(
      'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
      gen_random_uuid(),v_empty,v_key,'Synthetic empty section reply'),
      'empty published section denied ' || v_key);
  end loop;
  foreach v_id in array array[v_draft,v_absent,v_other_final] loop
    perform pg_temp.survey_reply_reject(format(
      'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
      gen_random_uuid(),v_id,'question:' || v_question,'Synthetic forbidden reply'),
      'draft absent or other owner review cannot receive reply ' || v_id);
  end loop;
  perform pg_temp.survey_reply_reject(format(
    'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
    gen_random_uuid(),gen_random_uuid(),'praises','Synthetic missing review'),
    'nonexistent parent review denied',array['23503','42501','23514']);
  perform pg_temp.survey_reply_reject(format(
    'update public.monthly_survey_submissions set responses=''{}''::jsonb,status=''draft'' where id=%L',v_final),
    'original survey answers remain locked',array['23514']);
  update public.monthly_survey_feedback set feedback='{}'::jsonb where submission_id=v_final;
  get diagnostics v_count=row_count;
  perform pg_temp.survey_reply_assert(v_count=0, 'owner cannot edit finalized management feedback');
  select count(*) into v_initial_count from public.monthly_survey_feedback_replies where submission_id=v_final;
  execute 'reset role';

  -- Positive SELECT checks are non-vacuous: every reviewer sees real synthetic
  -- replies. Managers/reviewers may read, but cannot answer on someone's behalf.
  foreach v_label in array array['owner','other','ceo','management','ops_manager','ops_assistant',
    'ai','unprovisioned_ai','head','inactive_ceo'] loop
    select id into v_actor from survey_reply_test_ids where label=v_label;
    v_can_read := v_label in ('owner','ceo','management','ops_manager','ops_assistant','ai');
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.monthly_survey_feedback_replies where submission_id=v_final;
    perform pg_temp.survey_reply_assert(v_count=case when v_can_read then v_initial_count else 0 end,
      'reply visibility boundary ' || v_label);
    perform pg_temp.survey_reply_reject(format(
      'update public.monthly_survey_feedback_replies set body=''Unauthorized rewrite'' where id=%L',v_first),
      'reply update denied ' || v_label,array['42501']);
    perform pg_temp.survey_reply_reject(format(
      'delete from public.monthly_survey_feedback_replies where id=%L',v_first),
      'reply deletion denied ' || v_label,array['42501']);
    if v_label<>'owner' then
      perform pg_temp.survey_reply_reject(format(
        'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
        gen_random_uuid(),v_final,'praises','Synthetic impersonated owner reply'),
        'cannot answer on another member behalf ' || v_label);
    end if;
    if v_label in ('ceo','management','ops_manager','ops_assistant','ai') then
      perform pg_temp.survey_reply_assert(exists(select 1 from public.monthly_survey_feedback where submission_id=v_draft),
        'reviewer retains private draft feedback access ' || v_label);
      update public.monthly_survey_feedback set praises='Unauthorized edit' where submission_id=v_final;
      get diagnostics v_count=row_count;
      perform pg_temp.survey_reply_assert(v_count=0, 'finalized management feedback stays immutable ' || v_label);
    end if;
    execute 'reset role';
  end loop;

  -- The other member can append to their own review but their reply remains
  -- invisible to the first member, including an attempted cross-owner ID reuse.
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  execute 'set local role authenticated';
  insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body)
    values(gen_random_uuid(),v_other_final,'praises','Synthetic other member reply');
  perform pg_temp.survey_reply_assert((select count(*)=1 from public.monthly_survey_feedback_replies
    where submission_id=v_other_final), 'second owner can reply to own feedback');
  perform pg_temp.survey_reply_reject(format(
    'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
    v_first,v_other_final,'praises','Synthetic cross-owner collision'),
    'reply identity cannot be reused across owners',array['23505','42501','23514']);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  execute 'set local role authenticated';
  perform pg_temp.survey_reply_assert(not exists(select 1 from public.monthly_survey_feedback_replies
    where submission_id=v_other_final), 'owner cannot read another member replies');
  execute 'reset role';

  update public.profiles set full_name='Synthetic renamed owner' where id=v_owner;
  perform pg_temp.survey_reply_assert((select author_name='Synthetic owner'
    from public.monthly_survey_feedback_replies where id=v_first),
    'sent reply preserves original author display name after profile rename');
  update public.profiles set full_name='Synthetic owner' where id=v_owner;
  perform pg_temp.survey_reply_reject(format(
    'update public.monthly_survey_feedback_replies set body=''Privileged accidental rewrite'' where id=%L',v_first),
    'reply validation prevents privileged accidental updates',array['23514']);
  perform pg_temp.survey_reply_reject(format(
    'delete from public.monthly_survey_feedback_replies where id=%L',v_first),
    'reply validation prevents privileged accidental deletes',array['23514']);
  perform pg_temp.survey_reply_reject(format(
    'delete from public.monthly_survey_feedback where submission_id=%L',v_final),
    'parent feedback cannot be deleted underneath reply history',array['23001','23503']);

  update public.profiles set is_active=false where id=v_owner;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  execute 'set local role authenticated';
  perform pg_temp.survey_reply_assert(not exists(select 1 from public.monthly_survey_feedback_replies
    where submission_id=v_final), 'inactive owner cannot read replies');
  perform pg_temp.survey_reply_reject(format(
    'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
    gen_random_uuid(),v_final,'praises','Synthetic inactive owner reply'), 'inactive owner cannot append replies');
  execute 'reset role';
  update public.profiles set is_active=true where id=v_owner;

  -- Revoking the separate AI capability removes access immediately.
  delete from private.application_access where profile_id=(select id from survey_reply_test_ids where label='ai');
  perform set_config('request.jwt.claim.sub',(select id::text from survey_reply_test_ids where label='ai'),true);
  execute 'set local role authenticated';
  perform pg_temp.survey_reply_assert(not exists(select 1 from public.monthly_survey_feedback_replies
    where submission_id=v_final), 'revoked AI capability cannot read protected replies');
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role authenticated';
  perform pg_temp.survey_reply_assert(not exists(select 1 from public.monthly_survey_feedback_replies),
    'authenticated role without identity cannot read replies');
  perform pg_temp.survey_reply_reject(format(
    'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
    gen_random_uuid(),v_final,'praises','Synthetic missing identity reply'),
    'authenticated role without identity cannot append replies');
  execute 'reset role';
  execute 'set local role anon';
  perform pg_temp.survey_reply_reject('select count(*) from public.monthly_survey_feedback_replies',
    'anonymous reply reads denied',array['42501']);
  perform pg_temp.survey_reply_reject(format(
    'insert into public.monthly_survey_feedback_replies(id,submission_id,section_key,body) values(%L,%L,%L,%L)',
    gen_random_uuid(),v_final,'praises','Synthetic anonymous reply'),
    'anonymous reply writes denied',array['42501']);
  execute 'reset role';

  perform pg_temp.survey_reply_assert(not exists(
    select 1 from survey_reply_originals original
    join public.monthly_survey_submissions current_submission on current_submission.id=original.submission_id
    join public.monthly_survey_feedback current_feedback on current_feedback.submission_id=original.submission_id
    where to_jsonb(current_submission) is distinct from original.submission
      or to_jsonb(current_feedback) is distinct from original.feedback
  ), 'all original survey and management feedback data remains byte-for-byte unchanged');
  perform pg_temp.survey_reply_assert((select count(*)=v_initial_count
    from public.monthly_survey_feedback_replies where submission_id=v_final),
    'all denied writes leave original reply history unchanged');
end;
$$;

select count(*) as passed_checks from survey_reply_test_results;
rollback;
