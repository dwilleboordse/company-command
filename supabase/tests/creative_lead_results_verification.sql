-- Run as postgres after applying the additive manual-results migration.
-- Every fixture and write is rolled back. No real identity is hardcoded.
begin;
create temporary table creative_results_test_ids(label text primary key, id uuid not null);
create temporary table creative_results_test_results(test text primary key, passed boolean not null);
create temporary table creative_results_test_baseline as
  select (select count(*) from public.clients) clients,
    (select count(*) from public.profiles) profiles,
    (select count(*) from public.spend_entries) spend,
    (select coalesce(jsonb_object_agg(id,to_jsonb(r)),'{}'::jsonb) from public.creative_lead_reviews r) reviews;
grant all on creative_results_test_ids, creative_results_test_results to authenticated;
insert into creative_results_test_ids select label,gen_random_uuid()
  from unnest(array['head','head_other','ops_manager','ceo','ops_assistant','cs','forged_head','client']) label;
insert into auth.users(id,email)
  select id,'creative-results-test-' || id || '@example.invalid'
  from creative_results_test_ids where label <> 'client';
insert into public.profiles(id,email,full_name,role,position,department,is_active)
  select id,'creative-results-test-' || id || '@example.invalid','Synthetic Results ' || label,
    case when label='ceo' then 'ceo' when label='ops_manager' then 'management' else 'athlete' end,
    case when label in ('head','head_other','forged_head') then 'head_of_creative_strategy'
      when label='cs' then 'creative_strategist' else label end,
    case when label in ('ops_manager','ops_assistant') then 'operations' else 'delivery' end,true
  from creative_results_test_ids where label <> 'client'
  on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,
    position=excluded.position,department=excluded.department,is_active=excluded.is_active;
insert into public.creative_lead_access(profile_id,capability)
  select id,case when label in ('ops_manager','ceo') then 'reviewer' else 'lead' end
  from creative_results_test_ids where label in ('head','head_other','ops_manager','ceo');
insert into public.clients(id,name,is_active,is_archived,cs_ids,assigned_cs_id)
  select c.id,'Synthetic Manual Results Client',true,false,jsonb_build_array(s.id),s.id
  from creative_results_test_ids c cross join creative_results_test_ids s where c.label='client' and s.label='cs';

create function pg_temp.clr_assert(condition boolean,label text)
returns void language plpgsql security invoker as $$
begin
  if condition is distinct from true then raise exception 'Manual results assertion failed: %',label; end if;
  insert into creative_results_test_results values(label,true);
end;
$$;
create function pg_temp.clr_reject(statement text,label text)
returns void language plpgsql security invoker as $$
declare rejected boolean := false;
begin
  begin execute statement;
  exception when others then
    if sqlstate in ('42501','22023','23514','23502') then rejected := true; else raise; end if;
  end;
  perform pg_temp.clr_assert(rejected,label);
end;
$$;
create function pg_temp.clr_client_reviews(roster jsonb,results jsonb)
returns jsonb language sql security invoker as $$
  select coalesce(jsonb_agg(jsonb_build_object('client_id',c->>'id','quality_status','on_track',
    'research_check','pass','brief_check','pass','signoff_check','pass','learning_check','pass',
    'growth_guide_status','updated','diagnosis','','next_tests','Test the next distinct hypothesis',
    'blocker','','evidence_url','https://example.invalid/quality') ||
    case when results is null then '{}'::jsonb else jsonb_build_object('results',results) end),'[]'::jsonb)
  from jsonb_array_elements(roster) c;
$$;

do $$
declare
  v_actor uuid := (select id from creative_results_test_ids where label='head');
  v_review public.creative_lead_reviews%rowtype;
  v_logged jsonb := '{"status":"logged","eligible_ads":100,"winners":8,"super_winners":3,"blocked_ads":2,"inconclusive_ads":4,"evidence_url":"https://docs.google.com/spreadsheets/d/synthetic-test/edit#gid=0","notes":"Newly classified ads only; super-winners are included in winners."}';
  v_no_tests jsonb := '{"status":"no_tests","eligible_ads":0,"winners":0,"super_winners":0,"blocked_ads":2,"inconclusive_ads":1,"evidence_url":"https://example.invalid/source","notes":"No eligible tests completed."}';
  v_unavailable jsonb := '{"status":"unavailable","eligible_ads":null,"winners":null,"super_winners":null,"blocked_ads":null,"inconclusive_ads":null,"evidence_url":"","notes":"Client source sheet awaiting results."}';
  v_case record;
  v_payload jsonb;
  v_count integer;
  v_label text;
begin
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  insert into public.creative_lead_reviews(week_start,results_version)
    values(date_trunc('week',now() at time zone 'Asia/Dubai')::date-7,0) returning * into v_review;
  insert into creative_results_test_ids values('review',v_review.id);
  perform pg_temp.clr_assert(v_review.results_version=1,'insert cannot opt out of new results contract');
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set results_version=0 where id=%L',v_review.id),'cannot downgrade results version');
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set results_version=2 where id=%L',v_review.id),'cannot forge unknown results version');
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set results_version=null where id=%L',v_review.id),'cannot clear results version');

  update public.creative_lead_reviews set summary='Manual results test',
    client_reviews=pg_temp.clr_client_reviews(client_snapshot,null) where id=v_review.id;
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set status=''submitted'' where id=%L',v_review.id),'new review cannot submit missing results');
  update public.creative_lead_reviews set client_reviews=pg_temp.clr_client_reviews(client_snapshot,'{"status":"not_entered","eligible_ads":100}'::jsonb)
    where id=v_review.id returning * into v_review;
  perform pg_temp.clr_assert(v_review.client_reviews->0->'results'->>'eligible_ads'='100','partial drafts preserve entered numbers');
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set status=''submitted'' where id=%L',v_review.id),'not-entered draft cannot submit');
  update public.creative_lead_reviews set client_reviews=pg_temp.clr_client_reviews(client_snapshot,
    v_logged || '{"eligible_ads":1000000,"winners":1000000,"super_winners":1000000,"blocked_ads":1000000,"inconclusive_ads":1000000}'::jsonb)
    where id=v_review.id returning * into v_review;
  perform pg_temp.clr_assert(v_review.client_reviews->0->'results'->>'super_winners'='1000000','inclusive count upper boundary and subset equality accepted');

  -- Invalid counts, JSON types, lengths, subsets, URLs, and unknown keys must
  -- fail even when only saving a draft, not just on submission.
  for v_case in select * from (values
    ('negative',jsonb_set(v_logged,'{eligible_ads}','-1')),
    ('fraction',jsonb_set(v_logged,'{eligible_ads}','10.5')),
    ('numeric string',jsonb_set(v_logged,'{eligible_ads}','"100"')),
    ('boolean',jsonb_set(v_logged,'{eligible_ads}','true')),
    ('array count',jsonb_set(v_logged,'{eligible_ads}','[]')),
    ('overflow',jsonb_set(v_logged,'{eligible_ads}','1000001')),
    ('extreme number',jsonb_set(v_logged,'{eligible_ads}','1e100')),
    ('winners greater than eligible',jsonb_set(v_logged,'{winners}','101')),
    ('super winners greater than winners',jsonb_set(v_logged,'{super_winners}','9')),
    ('negative blocked',jsonb_set(v_logged,'{blocked_ads}','-1')),
    ('fractional inconclusive',jsonb_set(v_logged,'{inconclusive_ads}','0.5')),
    ('zero eligible logged',v_logged || '{"eligible_ads":0,"winners":0,"super_winners":0}'::jsonb),
    ('no-test with eligible',v_no_tests || '{"eligible_ads":1}'::jsonb),
    ('unavailable with zero count',v_unavailable || '{"eligible_ads":0}'::jsonb),
    ('invalid status',jsonb_set(v_logged,'{status}','"approved"')),
    ('null status',jsonb_set(v_logged,'{status}','null')),
    ('object notes',jsonb_set(v_logged,'{notes}','{}')),
    ('null notes',jsonb_set(v_logged,'{notes}','null')),
    ('oversized notes',jsonb_set(v_logged,'{notes}',to_jsonb(repeat('x',6001)))),
    ('oversized link',jsonb_set(v_logged,'{evidence_url}',to_jsonb('https://example.invalid/' || repeat('x',2000)))),
    ('credentials in authority',jsonb_set(v_logged,'{evidence_url}','"https://user:password@example.invalid/source"')),
    ('javascript URL',jsonb_set(v_logged,'{evidence_url}','"javascript:alert(1)"')),
    ('URL whitespace',jsonb_set(v_logged,'{evidence_url}','"https://example.invalid/bad path"')),
    ('URL backslash',jsonb_set(v_logged,'{evidence_url}',to_jsonb('https://example.invalid' || chr(92) || 'bad'))),
    ('null URL',jsonb_set(v_logged,'{evidence_url}','null')),
    ('unknown key',v_logged || '{"approved_rating":5}'::jsonb),
    ('results JSON null','null'::jsonb),
    ('results JSON array','[]'::jsonb),
    ('results string','"100"'::jsonb)
  ) invalid_cases(label,payload) loop
    perform pg_temp.clr_reject(format('update public.creative_lead_reviews set client_reviews=%L::jsonb where id=%L',
      pg_temp.clr_client_reviews(v_review.client_snapshot,v_case.payload),v_review.id),'draft rejects ' || v_case.label);
  end loop;

  -- These are valid partial drafts but incomplete or contradictory at submit.
  for v_case in select * from (values
    ('missing status',v_logged-'status'),
    ('missing count',v_logged-'blocked_ads'),
    ('null logged count',jsonb_set(v_logged,'{winners}','null')),
    ('missing logged evidence',v_logged-'evidence_url'),
    ('no-test with missing blocked',v_no_tests-'blocked_ads'),
    ('no-test without source',v_no_tests || '{"evidence_url":""}'::jsonb),
    ('unavailable without explanation',v_unavailable || '{"notes":"  "}'::jsonb),
    ('unavailable with omitted count',v_unavailable-'inconclusive_ads')
  ) incomplete_cases(label,payload) loop
    update public.creative_lead_reviews set client_reviews=pg_temp.clr_client_reviews(client_snapshot,v_case.payload) where id=v_review.id;
    perform pg_temp.clr_reject(format('update public.creative_lead_reviews set status=''submitted'' where id=%L',v_review.id),'submit rejects ' || v_case.label);
  end loop;

  -- At least one captured client must have result data, not just the first.
  v_payload := pg_temp.clr_client_reviews(v_review.client_snapshot,v_logged);
  v_payload := jsonb_set(v_payload,'{0}',(v_payload->0)-'results');
  update public.creative_lead_reviews set client_reviews=v_payload where id=v_review.id;
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set status=''submitted'' where id=%L',v_review.id),'every captured client needs result status');

  update public.creative_lead_reviews set client_reviews=pg_temp.clr_client_reviews(client_snapshot,v_logged) where id=v_review.id returning * into v_review;
  v_count := v_review.version;
  update public.creative_lead_reviews set summary='STALE' where id=v_review.id and version=v_count-1;
  get diagnostics v_count = row_count;
  perform pg_temp.clr_assert(v_count=0,'new results preserve optimistic concurrency');
  update public.creative_lead_reviews set status='submitted' where id=v_review.id returning * into v_review;
  perform pg_temp.clr_assert(v_review.results_version=1 and v_review.history->0->'snapshot'->>'results_version'='1'
    and v_review.history->0->'snapshot'->'client_reviews'->0->'results'=v_logged,'submission audit captures results and contract version');
  perform pg_temp.clr_assert(exists(select 1 from public.creative_lead_review_completions where review_id=v_review.id and status='submitted'),'results submission updates accountability');
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set client_reviews=%L::jsonb where id=%L',
    pg_temp.clr_client_reviews(v_review.client_snapshot,v_no_tests),v_review.id),'lead cannot edit submitted results');
  execute 'reset role';

  select id into v_actor from creative_results_test_ids where label='ops_manager';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set client_reviews=%L::jsonb,status=''finalized'' where id=%L',
    pg_temp.clr_client_reviews(v_review.client_snapshot,v_no_tests),v_review.id),'reviewer cannot rewrite results while finalizing');
  update public.creative_lead_reviews set status='changes_requested',reviewer_feedback='Correct the reporting status.' where id=v_review.id;
  perform pg_temp.clr_assert(exists(select 1 from public.creative_lead_review_completions where review_id=v_review.id and status='changes_requested'),'returned results remove accountability completion');
  execute 'reset role';

  select id into v_actor from creative_results_test_ids where label='head_other';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set client_reviews=%L::jsonb where id=%L',
    pg_temp.clr_client_reviews(v_review.client_snapshot,v_no_tests),v_review.id),'another lead cannot overwrite returned results');
  execute 'reset role';
  select id into v_actor from creative_results_test_ids where label='head';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  update public.creative_lead_reviews set client_reviews=pg_temp.clr_client_reviews(client_snapshot,v_no_tests),status='submitted'
    where id=v_review.id returning * into v_review;
  perform pg_temp.clr_assert(v_review.client_reviews->0->'results'=v_no_tests,'no-tests results can be submitted');
  execute 'reset role';
  select id into v_actor from creative_results_test_ids where label='ops_manager';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  update public.creative_lead_reviews set status='changes_requested',reviewer_feedback='Source still pending.' where id=v_review.id;
  execute 'reset role';
  select id into v_actor from creative_results_test_ids where label='head';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  update public.creative_lead_reviews set client_reviews=pg_temp.clr_client_reviews(client_snapshot,v_unavailable),status='submitted'
    where id=v_review.id returning * into v_review;
  perform pg_temp.clr_assert(v_review.client_reviews->0->'results'=v_unavailable,'explained unavailable results submit without fake zeros');
  execute 'reset role';
  select id into v_actor from creative_results_test_ids where label='ceo';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  execute 'set local role authenticated';
  update public.creative_lead_reviews set status='finalized',reviewer_feedback='Accepted reporting gap.' where id=v_review.id returning * into v_review;
  perform pg_temp.clr_assert(v_review.status='finalized' and jsonb_array_length(v_review.history)=6
    and v_review.history->0->'snapshot'->'client_reviews'->0->'results'=v_logged
    and v_review.history->5->'snapshot'->'client_reviews'->0->'results'=v_unavailable,'finalization preserves all prior submitted results snapshots');
  perform pg_temp.clr_reject(format('update public.creative_lead_reviews set client_reviews=%L::jsonb where id=%L',
    pg_temp.clr_client_reviews(v_review.client_snapshot,v_logged),v_review.id),'CEO cannot alter finalized results');
  execute 'reset role';

  foreach v_label in array array['ops_assistant','cs','forged_head'] loop
    select id into v_actor from creative_results_test_ids where label=v_label;
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    execute 'set local role authenticated';
    perform pg_temp.clr_assert(not exists(select 1 from public.creative_lead_reviews where id=v_review.id),'results remain private from ' || v_label);
    perform pg_temp.clr_reject($q$insert into public.creative_lead_reviews(week_start) values(date_trunc('week',now() at time zone 'Asia/Dubai')::date-7)$q$,'result review creation denied ' || v_label);
    update public.creative_lead_reviews set client_reviews='[]' where id=v_review.id;
    get diagnostics v_count = row_count;
    perform pg_temp.clr_assert(v_count=0,'unauthorized results update affects no rows ' || v_label);
    execute 'reset role';
  end loop;

  -- Historical version-zero behavior is tested in the local migration runner
  -- against a genuine pre-migration fixture. Production verification never
  -- disables triggers or replication to manufacture historical data.
end;
$$;

select pg_temp.clr_assert(
  (select count(*) from public.clients)=(select clients+1 from creative_results_test_baseline)
  and (select count(*) from public.profiles)=(select profiles+7 from creative_results_test_baseline)
  and (select count(*) from public.spend_entries)=(select spend from creative_results_test_baseline),
  'existing roster, team and spend unchanged apart from rollback-only fixtures');
select pg_temp.clr_assert(not exists(
  select 1 from creative_results_test_baseline b cross join lateral jsonb_each(b.reviews) historical
  left join public.creative_lead_reviews r on r.id=historical.key::uuid
  where to_jsonb(r) is distinct from historical.value
),'every pre-existing review remains byte-equivalent including version zero history');
select count(*) as passed_checks from creative_results_test_results;
rollback;
