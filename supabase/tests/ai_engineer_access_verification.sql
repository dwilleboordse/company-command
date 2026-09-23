-- Run as postgres after the AI Engineer migration. Every fixture, attempted
-- write, temporary function and capability change is rolled back. Real John
-- Carlo's identity is checked read-only; only synthetic users are mutated.
begin;
create temporary table ai_access_test_ids(label text primary key, id uuid not null);
create temporary table ai_access_test_results(test text primary key, passed boolean not null);
create temporary table ai_access_ceo_counts(table_name text primary key, visible_rows bigint not null);
grant all on ai_access_test_ids, ai_access_test_results, ai_access_ceo_counts to authenticated;
-- Anonymous assertions need only to record their result in this temporary
-- harness table; no application or fixture table access is granted.
grant insert on ai_access_test_results to anon;

create function pg_temp.ai_assert(condition boolean, label text)
returns void language plpgsql security invoker as $$
begin
  if condition is distinct from true then raise exception 'AI Engineer assertion failed: %', label; end if;
  insert into ai_access_test_results values(label, true);
end;
$$;
create function pg_temp.ai_reject(statement text, label text, expected_states text[] default array['42501'])
returns void language plpgsql security invoker as $$
declare rejected boolean := false;
begin
  begin execute statement;
  exception when others then
    if sqlstate = any(expected_states) then rejected := true; else raise; end if;
  end;
  perform pg_temp.ai_assert(rejected, label);
end;
$$;

select pg_temp.ai_assert(exists(
  select 1 from auth.users u join public.profiles p on p.id=u.id
  where u.id='266325ff-1f6a-41ad-b8fc-dc37ee9c88be'
    and lower(u.email)='john.carlo@d-doubleumedia.com'
    and p.role='ai_engineer' and p.position='ai_engineer' and p.is_active is true
), 'John has the intended active identity and distinct role');
select pg_temp.ai_assert(exists(
  select 1 from private.application_access
  where profile_id='266325ff-1f6a-41ad-b8fc-dc37ee9c88be' and capability='ai_engineer_full_access'
), 'John has an administrator-provisioned capability');
select pg_temp.ai_assert(exists(
  select 1 from public.creative_lead_access
  where profile_id='266325ff-1f6a-41ad-b8fc-dc37ee9c88be' and capability='reviewer'
), 'John has the separate Creative Leadership reviewer capability');

insert into ai_access_test_ids select label, gen_random_uuid()
  from unnest(array['ai','unprovisioned','revoked','inactive','wrong_role','ceo','ops','head','member']) label;
insert into auth.users(id,email)
  select id, 'ai-access-test-' || id || '@example.invalid' from ai_access_test_ids;
insert into public.profiles(id,email,full_name,role,position,department,is_active)
  select id, 'ai-access-test-' || id || '@example.invalid', 'Synthetic ' || label,
    case when label in ('ai','unprovisioned','revoked','inactive') then 'ai_engineer'
      when label='ceo' then 'ceo' when label='ops' then 'management' else 'athlete' end,
    case when label in ('ai','unprovisioned','revoked','inactive','wrong_role') then 'ai_engineer'
      when label='head' then 'head_of_creative_strategy'
      when label='ops' then 'ops_manager' else 'creative_strategist' end,
    case when label='ops' then 'operations' else 'engineering' end,
    label <> 'inactive'
  from ai_access_test_ids
  on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,
    position=excluded.position,department=excluded.department,is_active=excluded.is_active;
insert into private.application_access(profile_id,capability)
  select id,'ai_engineer_full_access' from ai_access_test_ids where label in ('ai','revoked','inactive','wrong_role');
delete from private.application_access where profile_id=(select id from ai_access_test_ids where label='revoked');
insert into public.creative_lead_access(profile_id,capability)
  select id,case when label='head' then 'lead' else 'reviewer' end
  from ai_access_test_ids where label in ('ai','inactive','wrong_role','ceo','ops','head');

-- A nonempty private survey/plan ensures the parity checks cannot pass merely
-- because these protected tables happen to be empty on the live database.
insert into public.monthly_survey_submissions(user_id,survey_month,question_set_version,status,responses)
  select (select id from ai_access_test_ids where label='member'),
    (date_trunc('month',now() at time zone 'Asia/Dubai') - interval '1 month')::date,
    q.question_set_version,'submitted',
    jsonb_object_agg(q.question_key,case when q.response_type='scale_1_10' then '7'::jsonb else to_jsonb('Synthetic answer'::text) end)
  from public.monthly_survey_questions q
  where q.question_set_version=(select max(question_set_version) from public.monthly_survey_questions)
  group by q.question_set_version;
insert into ai_access_test_ids
  select 'survey',id from public.monthly_survey_submissions where user_id=(select id from ai_access_test_ids where label='member');
insert into public.hundred_day_plans(user_id,name)
  select id,'Synthetic protected plan' from ai_access_test_ids where label='member';
insert into ai_access_test_ids
  select 'plan',id from public.hundred_day_plans where user_id=(select id from ai_access_test_ids where label='member');

do $$
declare
  v_label text;
  v_actor uuid;
  v_count bigint;
  v_table text;
  v_row record;
  v_review public.creative_lead_reviews%rowtype;
  v_survey uuid := (select id from ai_access_test_ids where label='survey');
  v_plan uuid := (select id from ai_access_test_ids where label='plan');
  v_ai uuid := (select id from ai_access_test_ids where label='ai');
  v_model uuid;
  v_hire uuid;
  v_client uuid;
begin
  -- Validate the actual account without writing its profile or credentials.
  perform set_config('request.jwt.claim.sub','266325ff-1f6a-41ad-b8fc-dc37ee9c88be',true);
  execute 'set local role authenticated';
  perform pg_temp.ai_assert(public.has_ai_engineer_access(), 'John passes trusted capability authorization');
  perform pg_temp.ai_assert(public.get_my_role()='ai_engineer', 'John is not impersonated as CEO');
  perform pg_temp.ai_assert(public.can_manage_ops(), 'John has operations access');
  perform pg_temp.ai_assert(public.can_access_creative_lead() and public.can_review_creative_lead(), 'John has Creative Leadership reviewer access');
  perform pg_temp.ai_assert(not public.is_creative_lead(), 'John does not impersonate the Head of Creative Strategy');
  execute 'reset role';

  foreach v_label in array array['ai','unprovisioned','revoked','inactive','wrong_role','ceo','ops','head','member'] loop
    select id into v_actor from ai_access_test_ids where label=v_label;
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    execute 'set local role authenticated';
    perform pg_temp.ai_assert(public.has_ai_engineer_access()=(v_label='ai'), 'trusted AI capability boundary ' || v_label);
    perform pg_temp.ai_assert(public.can_manage_ops()=(v_label in ('ai','ceo','ops')), 'operations boundary ' || v_label);
    perform pg_temp.ai_assert(public.can_access_creative_lead()=(v_label in ('ai','ceo','ops','head')), 'Creative Leadership boundary ' || v_label);
    perform pg_temp.ai_assert(public.can_review_creative_lead()=(v_label in ('ai','ceo','ops')), 'reviewer boundary ' || v_label);
    perform pg_temp.ai_assert(not exists(select 1 from private.application_access where profile_id<>v_actor), 'capability rows remain self-only ' || v_label);
    perform pg_temp.ai_reject(format('insert into private.application_access(profile_id,capability) values(%L,''ai_engineer_full_access'')',v_actor), 'client cannot provision capability ' || v_label);
    perform pg_temp.ai_reject(format('delete from private.application_access where profile_id=%L',v_actor), 'client cannot delete capability ' || v_label);
    perform pg_temp.ai_reject(format('update private.application_access set capability=''ai_engineer_full_access'' where profile_id=%L',v_actor), 'client cannot rewrite capability ' || v_label);
    if v_label in ('unprovisioned','revoked','inactive','wrong_role','member') then
      perform pg_temp.ai_assert(not exists(select 1 from public.ceo_models), 'CEO models denied ' || v_label);
      perform pg_temp.ai_assert(not exists(select 1 from public.hiring_roadmap_items), 'hiring roadmap denied ' || v_label);
      perform pg_temp.ai_assert(not exists(select 1 from public.creative_lead_reviews), 'private reviews denied ' || v_label);
      if v_label<>'member' then
        perform pg_temp.ai_assert(not exists(select 1 from public.monthly_survey_submissions where id=v_survey), 'other survey denied ' || v_label);
        perform pg_temp.ai_assert(not exists(select 1 from public.hundred_day_plans where id=v_plan), 'other plan denied ' || v_label);
      end if;
    end if;
    execute 'reset role';
  end loop;

  -- Authenticated profile editing cannot self-provision the new privilege.
  select id into v_actor from ai_access_test_ids where label='member';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  update public.profiles set role='ai_engineer',position='ai_engineer' where id=v_actor;
  perform pg_temp.ai_assert(not public.has_ai_engineer_access(), 'self-edited AI role has no trusted privilege');
  execute 'reset role';
  update public.profiles set role='athlete',position='creative_strategist' where id=v_actor;

  -- Create the review through the real lead workflow, never disabling triggers.
  select id into v_actor from ai_access_test_ids where label='head';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  insert into public.creative_lead_reviews(week_start)
    values(date_trunc('week',now() at time zone 'Asia/Dubai')::date-7) returning * into v_review;
  update public.creative_lead_reviews r set summary='Synthetic AI access verification',client_reviews=(
    select coalesce(jsonb_agg(jsonb_build_object('client_id',c->>'id','quality_status','on_track',
      'research_check','pass','brief_check','pass','signoff_check','pass','learning_check','pass',
      'growth_guide_status','updated','diagnosis','','next_tests','Synthetic next test','blocker','',
      'evidence_url','https://example.invalid/evidence','results',jsonb_build_object(
        'status','no_tests','eligible_ads',0,'winners',0,'super_winners',0,'blocked_ads',0,'inconclusive_ads',0,
        'evidence_url','https://example.invalid/results','notes',''))),'[]'::jsonb)
    from jsonb_array_elements(r.client_snapshot) c
  ) where id=v_review.id;
  update public.creative_lead_reviews set status='submitted' where id=v_review.id;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',v_ai::text,true);
  execute 'set local role authenticated';
  insert into public.ceo_models(model_type,metric_name,current_value)
    values('business','Synthetic AI access model',0) returning id into v_model;
  insert into public.ceo_model_entries(model_id,value,week_start)
    values(v_model,1,date_trunc('week',now() at time zone 'Asia/Dubai')::date);
  update public.ceo_models set current_value=1 where id=v_model;
  perform pg_temp.ai_assert(exists(select 1 from public.ceo_models where id=v_model and current_value=1)
    and exists(select 1 from public.ceo_model_entries where model_id=v_model and value=1), 'AI can create and update CEO models and entries');
  insert into public.hiring_roadmap_items(role_key,role_label,created_by,updated_by)
    values('ai_engineer','Synthetic AI access hire',v_ai,v_ai) returning id into v_hire;
  update public.hiring_roadmap_items set status='on_hold' where id=v_hire;
  perform pg_temp.ai_assert(exists(select 1 from public.hiring_roadmap_items where id=v_hire and status='on_hold'), 'AI can create and update hiring roadmap items');
  insert into public.clients(name,is_active,is_archived)
    values('Synthetic AI access churn client',false,true) returning id into v_client;
  insert into public.client_churn_profiles(client_id,churn_notes,updated_by)
    values(v_client,'Synthetic churn note',v_ai);
  update public.client_churn_profiles set churn_notes='Synthetic revised note' where client_id=v_client;
  perform pg_temp.ai_assert(exists(select 1 from public.client_churn_profiles where client_id=v_client and churn_notes='Synthetic revised note'), 'AI can manage client roster and churn records');
  perform pg_temp.ai_assert(exists(select 1 from public.monthly_survey_submissions where id=v_survey), 'AI reads another member survey');
  perform pg_temp.ai_assert(exists(select 1 from public.hundred_day_plans where id=v_plan), 'AI reads another member plan');
  update public.hundred_day_plans set name='Unauthorized rewrite' where id=v_plan;
  get diagnostics v_count=row_count;
  perform pg_temp.ai_assert(v_count=0, 'AI cannot rewrite another member plan');
  update public.monthly_survey_submissions set responses='{}'::jsonb,status='draft' where id=v_survey;
  get diagnostics v_count=row_count;
  perform pg_temp.ai_assert(v_count=0, 'AI cannot rewrite another member survey answers');
  perform pg_temp.ai_reject($q$select public.close_design_cs_month('2026-01-01'::date,'2026-03-01'::date,'Synthetic invalid month',20::smallint,'[]'::jsonb)$q$,
    'AI passes rollover authorization and reaches unchanged validation',array['22023']);

  perform pg_temp.ai_reject($q$insert into public.creative_lead_reviews(week_start) values(date_trunc('week',now() at time zone 'Asia/Dubai')::date-7)$q$,
    'AI cannot create a Head of Creative Strategy review');
  perform pg_temp.ai_reject(format('update public.creative_lead_reviews set summary=''Unauthorized body edit'',status=''finalized'' where id=%L',v_review.id),
    'AI reviewer cannot rewrite the lead review body');
  update public.creative_lead_reviews set status='finalized',reviewer_feedback='Synthetic verification approved' where id=v_review.id returning * into v_review;
  perform pg_temp.ai_assert(v_review.status='finalized' and v_review.finalized_by=v_ai, 'AI can finalize submitted Creative Leadership reviews');
  perform pg_temp.ai_reject(format('update public.creative_lead_reviews set reviewer_feedback=''Unauthorized post-finalization edit'' where id=%L',v_review.id),
    'AI cannot change finalized reviews');
  perform pg_temp.ai_reject(format('delete from public.creative_lead_reviews where id=%L',v_review.id), 'AI cannot delete retained reviews');

  perform pg_temp.ai_reject(format('insert into public.monthly_survey_feedback(submission_id,status,praises) values(%L,''finalized'',''Synthetic praise'')',v_survey),
    'AI survey feedback must first be saved as draft',array['42501','23514']);
  insert into public.monthly_survey_feedback(submission_id,praises,growth_notes)
    values(v_survey,'Synthetic praise','Synthetic growth note');
  perform pg_temp.ai_assert(exists(select 1 from public.monthly_survey_feedback where submission_id=v_survey and status='draft' and created_by=v_ai),
    'AI can create and read survey feedback drafts');
  execute 'reset role';

  select id into v_actor from ai_access_test_ids where label='member';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.ai_assert(not exists(select 1 from public.monthly_survey_feedback where submission_id=v_survey), 'member cannot see AI feedback draft');
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',v_ai::text,true);
  execute 'set local role authenticated';
  update public.monthly_survey_feedback set status='finalized' where submission_id=v_survey;
  perform pg_temp.ai_assert(exists(select 1 from public.monthly_survey_feedback where submission_id=v_survey and status='finalized' and finalized_by=v_ai),
    'AI can finalize survey feedback with attributed audit');
  update public.monthly_survey_feedback set praises='Unauthorized final edit' where submission_id=v_survey;
  get diagnostics v_count=row_count;
  perform pg_temp.ai_assert(v_count=0, 'AI cannot rewrite finalized survey feedback');
  execute 'reset role';

  select id into v_actor from ai_access_test_ids where label='member';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.ai_assert(exists(select 1 from public.monthly_survey_feedback where submission_id=v_survey and status='finalized'), 'member sees feedback only after AI finalization');
  perform pg_temp.ai_reject(format('update public.monthly_survey_submissions set status=''draft'' where id=%L',v_survey),
    'finalized feedback still locks survey answers',array['23514']);
  execute 'reset role';

  -- Exact CEO read parity over every app data table with a role-gated policy.
  -- Capability tables and other applications sharing this database are excluded.
  select id into v_actor from ai_access_test_ids where label='ceo';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  foreach v_table in array array[
    'accountability_logs','ceo_model_entries','ceo_models','change_log','client_actions','client_churn_profiles',
    'client_health_entries','clients','creative_lead_actions','creative_lead_coaching','creative_lead_feedback',
    'creative_lead_review_completions','creative_lead_reviews','day_entries','design_cs_allocations',
    'design_cs_capacity_settings','design_cs_import_snapshots','design_cs_months','design_cs_people','hiring_roadmap_items',
    'hundred_day_plan_checkpoints','hundred_day_plan_cycle_pulses','hundred_day_plan_cycles','hundred_day_plan_dependencies',
    'hundred_day_plan_goals','hundred_day_plan_milestones','hundred_day_plan_weekly_pulses','hundred_day_plans',
    'key_results','kpi_entries','kpis','kr_values','meeting_preps','meeting_recaps','milestones',
    'monthly_survey_feedback','monthly_survey_submissions','objectives','onboarding_checklists','spend_entries',
    'team_reviews','user_kpi_values','user_kpis','week_outcomes'
  ] loop
    execute format('select count(*) from public.%I',v_table) into v_count;
    insert into ai_access_ceo_counts values(v_table,v_count);
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_ai::text,true);
  execute 'set local role authenticated';
  for v_row in select * from ai_access_ceo_counts order by table_name loop
    execute format('select count(*) from public.%I',v_row.table_name) into v_count;
    perform pg_temp.ai_assert(v_count=v_row.visible_rows, 'CEO read parity ' || v_row.table_name);
  end loop;
  execute 'reset role';

  -- Revocation is effective immediately: authorization is not a stale JWT claim.
  delete from private.application_access where profile_id=v_ai;
  perform set_config('request.jwt.claim.sub',v_ai::text,true);
  execute 'set local role authenticated';
  perform pg_temp.ai_assert(not public.has_ai_engineer_access() and not public.can_manage_ops(), 'capability revocation immediately removes elevated access');
  perform pg_temp.ai_assert(not public.can_access_creative_lead() and not public.can_review_creative_lead(), 'revocation also removes Creative Leadership access');
  perform pg_temp.ai_assert(not exists(select 1 from public.monthly_survey_submissions where id=v_survey), 'revocation hides protected survey rows');
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  perform pg_temp.ai_reject('select public.has_ai_engineer_access()', 'anonymous capability RPC denied');
  perform pg_temp.ai_reject('select count(*) from private.application_access', 'anonymous capability table denied');
  execute 'reset role';
end;
$$;

select count(*) as passed_checks from ai_access_test_results;
rollback;
