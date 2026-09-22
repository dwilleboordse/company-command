-- Run as postgres after applying the additive migration. Synthetic fixtures
-- and all verification writes are rolled back; no real identity is hardcoded.
begin;
create temporary table creative_lead_test_ids(label text primary key, id uuid not null);
create temporary table creative_lead_test_results(test text primary key, passed boolean not null);
create temporary table creative_lead_test_baseline as
  select (select count(*) from public.clients) clients,
    (select count(*) from public.spend_entries) spend,
    (select count(*) from public.profiles) profiles;
grant all on creative_lead_test_ids, creative_lead_test_results to authenticated;
insert into creative_lead_test_ids select label,gen_random_uuid()
  from unnest(array['head','head_other','ops_manager','ceo','ops_assistant','cs','management','inactive_head','forged_head','client','spend']) label;
insert into auth.users(id,email)
  select id, 'creative-lead-test-' || id || '@example.invalid'
  from creative_lead_test_ids where label not in ('client','spend');
insert into public.profiles(id,email,full_name,role,position,department,is_active)
  select id,'creative-lead-test-' || id || '@example.invalid','Synthetic ' || label,
    case when label = 'ceo' then 'ceo' when label in ('ops_manager','management') then 'management' else 'athlete' end,
    case when label in ('head','head_other','inactive_head','forged_head') then 'head_of_creative_strategy'
      when label='cs' then 'creative_strategist' else label end,
    case when label in ('ops_manager','ops_assistant') then 'operations' else 'delivery' end,
    label <> 'inactive_head'
  from creative_lead_test_ids where label not in ('client','spend')
  on conflict (id) do update set full_name=excluded.full_name,role=excluded.role,
    position=excluded.position,department=excluded.department,is_active=excluded.is_active;
insert into public.creative_lead_access(profile_id,capability)
  select id,case when label in ('ops_manager','ceo') then 'reviewer' else 'lead' end
  from creative_lead_test_ids where label in ('head','head_other','ops_manager','ceo','inactive_head');
insert into public.clients(id,name,is_active,is_archived,cs_ids,assigned_cs_id)
  select c.id,'Synthetic Creative Leadership Test Client',true,false,jsonb_build_array(s.id),s.id
    from creative_lead_test_ids c cross join creative_lead_test_ids s where c.label='client' and s.label='cs';
insert into public.spend_entries(id,client_id,week_start,ddu_spend,total_spend)
  select s.id,c.id,date_trunc('week',now() at time zone 'Asia/Dubai')::date - 7,10,100
    from creative_lead_test_ids s cross join creative_lead_test_ids c where s.label='spend' and c.label='client';

create function pg_temp.cl_assert(condition boolean, label text)
returns void language plpgsql security invoker as $$
begin
  if condition is distinct from true then raise exception 'Creative Leadership assertion failed: %',label; end if;
  insert into creative_lead_test_results values(label,true);
end;
$$;
create function pg_temp.cl_reject(statement text,label text)
returns void language plpgsql security invoker as $$
declare rejected boolean := false;
begin
  begin execute statement;
  exception when others then
    if sqlstate in ('42501','22023','23514','23502') then rejected := true; else raise; end if;
  end;
  perform pg_temp.cl_assert(rejected,label);
end;
$$;

do $$
declare
  v_label text;
  v_actor uuid;
  v_review public.creative_lead_reviews%rowtype;
  v_client uuid := (select id from creative_lead_test_ids where label='client');
  v_cs uuid := (select id from creative_lead_test_ids where label='cs');
  v_action uuid;
  v_coaching uuid;
  v_count integer;
begin
  foreach v_label in array array['head','head_other','ops_manager','ceo','ops_assistant','cs','management','inactive_head','forged_head'] loop
    select id into v_actor from creative_lead_test_ids where label=v_label;
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    execute 'set local role authenticated';
    perform pg_temp.cl_assert(public.can_access_creative_lead() = (v_label in ('head','head_other','ops_manager','ceo')), 'hub access ' || v_label);
    perform pg_temp.cl_assert(public.can_review_creative_lead() = (v_label in ('ops_manager','ceo')), 'review access ' || v_label);
    if v_label not in ('head','head_other') then
      perform pg_temp.cl_reject($q$insert into public.creative_lead_reviews(week_start) values(date_trunc('week',now() at time zone 'Asia/Dubai')::date - 7)$q$,'draft creation denied ' || v_label);
    end if;
    execute 'reset role';
  end loop;
  select id into v_actor from creative_lead_test_ids where label='head';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.cl_reject($q$insert into public.creative_lead_reviews(week_start) values(date_trunc('week',now() at time zone 'Asia/Dubai')::date)$q$,'incomplete current week denied');
  insert into public.creative_lead_reviews(week_start) values(date_trunc('week',now() at time zone 'Asia/Dubai')::date - 7) returning * into v_review;
  insert into creative_lead_test_ids values('review',v_review.id);
  perform pg_temp.cl_assert(v_review.version=1 and exists(select 1 from jsonb_array_elements(v_review.client_snapshot) c where c->>'id'=v_client::text),'server captures client roster');
  perform pg_temp.cl_assert(exists(select 1 from public.creative_lead_review_completions where review_id=v_review.id and status='draft'),'completion signal generated');
  update public.creative_lead_review_completions set status='finalized' where review_id=v_review.id;
  get diagnostics v_count = row_count;
  perform pg_temp.cl_assert(v_count=0 and exists(select 1 from public.creative_lead_review_completions where review_id=v_review.id and status='draft'),'completion signal direct forgery rejected');
  perform pg_temp.cl_reject(format('update public.creative_lead_reviews set client_snapshot=''[]'' where id=%L',v_review.id),'snapshot tamper rejected');
  perform pg_temp.cl_reject(format('update public.creative_lead_reviews set status=''submitted'' where id=%L',v_review.id),'incomplete submission rejected');
  perform pg_temp.cl_reject(format('update public.creative_lead_reviews set status=''finalized'' where id=%L',v_review.id),'head self-finalization rejected');
  update public.creative_lead_reviews r set summary='Synthetic weekly summary',client_reviews=(
    select jsonb_agg(jsonb_build_object('client_id',c->>'id','quality_status','on_track',
      'research_check','pass','brief_check','pass','signoff_check','pass','learning_check','pass',
      'growth_guide_status','updated','diagnosis','','next_tests','Test next hypothesis','blocker','','evidence_url','https://example.invalid/evidence',
      'results',jsonb_build_object('status','no_tests','eligible_ads',0,'winners',0,'super_winners',0,
        'blocked_ads',0,'inconclusive_ads',0,'evidence_url','https://example.invalid/results','notes','')))
      from jsonb_array_elements(r.client_snapshot) c
  ) where id=v_review.id and version=v_review.version returning * into v_review;
  perform pg_temp.cl_assert(v_review.version=2,'optimistic revision increments');
  update public.creative_lead_reviews set summary='STALE WRITE' where id=v_review.id and version=1;
  get diagnostics v_count = row_count;
  perform pg_temp.cl_assert(v_count=0,'stale version cannot overwrite draft');
  insert into public.creative_lead_actions(client_id,kind,title,diagnosis,action_plan,owner_id,due_date)
    values(v_client,'retention','Synthetic issue','Specific diagnosis','Agreed action',v_actor,current_date+7) returning id into v_action;
  perform pg_temp.cl_reject(format('update public.creative_lead_actions set status=''resolved'' where id=%L',v_action),'resolution evidence required');
  update public.creative_lead_actions set escalated_at=now(),recovery_plan_at=now() where id=v_action;
  perform pg_temp.cl_reject(format('update public.creative_lead_actions set escalated_at=null where id=%L',v_action),'escalation cannot be erased');
  perform pg_temp.cl_reject(format('update public.creative_lead_actions set recovery_plan_at=now()+interval ''2 days'' where id=%L',v_action),'recovery timestamp cannot be rewritten');
  update public.creative_lead_reviews set status='submitted' where id=v_review.id returning * into v_review;
  perform pg_temp.cl_assert(v_review.submitted_by=v_actor and jsonb_array_length(v_review.history)=1 and exists(
    select 1 from jsonb_array_elements(v_review.spend_snapshot) s where s->>'client_id'=v_client::text and (s->>'ddu_spend')::numeric=10
  ),'submission freezes spend and audit history');
  perform pg_temp.cl_reject(format('update public.creative_lead_reviews set summary=''Hidden edit'' where id=%L',v_review.id),'submitted body cannot be edited');
  insert into public.creative_lead_coaching(strategist_id,client_id,observation,expected_standard,agreed_action,due_date)
    values(v_cs,v_client,'PRIVATE observation','PRIVATE standard','PRIVATE agreed action',current_date+7) returning id into v_coaching;
  insert into creative_lead_test_ids values('coaching',v_coaching);
  insert into public.creative_lead_feedback(coaching_id,message) values(v_coaching,'Deliberately released feedback');
  perform pg_temp.cl_assert(exists(select 1 from public.creative_lead_feedback where coaching_id=v_coaching and recipient_id=v_cs and published_by=v_actor),'publication derives recipient and actor');
  execute 'reset role';
  select id into v_actor from creative_lead_test_ids where label='ops_manager';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.cl_reject(format('update public.creative_lead_reviews set summary=''Reviewer rewrite'',status=''finalized'' where id=%L',v_review.id),'reviewer cannot edit lead body');
  perform pg_temp.cl_reject(format('update public.creative_lead_reviews set status=''changes_requested'' where id=%L',v_review.id),'changes requested require feedback');
  update public.creative_lead_reviews set status='changes_requested',reviewer_feedback='Please clarify next tests' where id=v_review.id;
  execute 'reset role';
  select id into v_actor from creative_lead_test_ids where label='head_other';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.cl_reject(format('update public.creative_lead_reviews set summary=''Another lead rewrite'' where id=%L',v_review.id),'other head cannot edit owner draft');
  execute 'reset role';
  select id into v_actor from creative_lead_test_ids where label='head';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  update public.creative_lead_reviews set status='submitted',summary='Clarified summary' where id=v_review.id;
  execute 'reset role';
  select id into v_actor from creative_lead_test_ids where label='ceo';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  update public.creative_lead_reviews set status='finalized',reviewer_feedback='Approved' where id=v_review.id returning * into v_review;
  perform pg_temp.cl_assert(v_review.finalized_by=v_actor and jsonb_array_length(v_review.history)=4,'CEO finalization recorded with full transition history');
  perform pg_temp.cl_reject(format('update public.creative_lead_reviews set reviewer_feedback=''Rewritten'' where id=%L',v_review.id),'finalized review locked even for CEO');
  perform pg_temp.cl_reject(format('delete from public.creative_lead_reviews where id=%L',v_review.id),'review deletion denied');
  execute 'reset role';
  foreach v_label in array array['ops_assistant','cs','management','inactive_head','forged_head'] loop
    select id into v_actor from creative_lead_test_ids where label=v_label;
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    execute 'set local role authenticated';
    perform pg_temp.cl_assert(not exists(select 1 from public.creative_lead_reviews),'private reviews hidden from ' || v_label);
    perform pg_temp.cl_assert(not exists(select 1 from public.creative_lead_coaching),'private coaching hidden from ' || v_label);
    perform pg_temp.cl_assert(not exists(select 1 from public.creative_lead_actions),'private actions hidden from ' || v_label);
    perform pg_temp.cl_assert((exists(select 1 from public.creative_lead_feedback where coaching_id=v_coaching)) = (v_label='cs'),'published feedback recipient boundary ' || v_label);
    perform pg_temp.cl_assert((exists(select 1 from public.creative_lead_review_completions where review_id=v_review.id)) = (v_label in ('ops_assistant','management')),'minimal accountability signal ' || v_label);
    perform pg_temp.cl_reject(format('insert into public.creative_lead_feedback(coaching_id,message) values(%L,''forged'')',v_coaching),'feedback publishing denied ' || v_label);
    perform pg_temp.cl_reject(format('insert into public.creative_lead_access(profile_id,capability) values(%L,''lead'')',v_actor),'self provisioning denied ' || v_label);
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin
    perform count(*) from public.creative_lead_reviews;
    raise exception 'Anonymous read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform pg_temp.cl_assert(true,'anonymous table access denied');
end;
$$;
select pg_temp.cl_assert(
  (select count(*) from public.clients) = (select clients+1 from creative_lead_test_baseline)
  and (select count(*) from public.spend_entries) = (select spend+1 from creative_lead_test_baseline)
  and (select count(*) from public.profiles) = (select profiles+9 from creative_lead_test_baseline),
  'existing table counts unchanged apart from rollback-only fixtures');
select count(*) as passed_checks from creative_lead_test_results;
rollback;
