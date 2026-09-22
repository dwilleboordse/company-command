-- Additive, private Creative Leadership workspace. Existing roster, spend,
-- profiles, accountability, and churn rows are never rewritten by this release.
-- A review covers a completed Dubai-time week, beginning with the release's
-- first reviewable week. Metrics and assignments are immutable snapshots.

-- Existing profile writes are not an authorization boundary. Capabilities are
-- provisioned only by a trusted database administrator, and still require the
-- matching active profile role. No client role can grant itself membership.
create table public.creative_lead_access (
  profile_id uuid primary key references public.profiles(id),
  capability text not null check (capability in ('lead','reviewer')),
  created_at timestamptz not null default now()
);
alter table public.creative_lead_access enable row level security;
revoke all on public.creative_lead_access from public, anon, authenticated;
grant select on public.creative_lead_access to authenticated;
grant all on public.creative_lead_access to service_role;
create policy creative_lead_access_self on public.creative_lead_access for select to authenticated
  using (profile_id = (select auth.uid()));
insert into public.creative_lead_access(profile_id,capability)
  select id,case when role='ceo' or position='ops_manager' then 'reviewer' else 'lead' end
  from public.profiles where is_active is true and (role='ceo' or position in ('ops_manager','head_of_creative_strategy'));

create function public.can_access_creative_lead()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.profiles p join public.creative_lead_access a on a.profile_id=p.id
    where p.id = (select auth.uid()) and p.is_active is true
      and ((a.capability='reviewer' and (p.role='ceo' or p.position='ops_manager'))
        or (a.capability='lead' and p.position='head_of_creative_strategy')));
$$;
create function public.can_review_creative_lead()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.profiles p join public.creative_lead_access a on a.profile_id=p.id
    where p.id = (select auth.uid()) and p.is_active is true
      and a.capability='reviewer' and (p.role = 'ceo' or p.position = 'ops_manager'));
$$;
create function public.is_creative_lead()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.profiles p join public.creative_lead_access a on a.profile_id=p.id
    where p.id = (select auth.uid()) and p.is_active is true
      and a.capability='lead' and p.position = 'head_of_creative_strategy');
$$;
revoke all on function public.can_access_creative_lead(), public.can_review_creative_lead(), public.is_creative_lead() from public, anon, authenticated;
grant execute on function public.can_access_creative_lead(), public.can_review_creative_lead(), public.is_creative_lead() to authenticated, service_role;

create table public.creative_lead_reviews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null default auth.uid() references public.profiles(id),
  week_start date not null check (extract(isodow from week_start) = 1 and week_start >= date '2026-09-14'),
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','finalized')),
  summary text not null default '' check (length(summary) <= 12000),
  reviewer_feedback text not null default '' check (length(reviewer_feedback) <= 12000),
  client_reviews jsonb not null default '[]' check (jsonb_typeof(client_reviews) = 'array' and octet_length(client_reviews::text) <= 1500000),
  client_snapshot jsonb not null default '[]' check (jsonb_typeof(client_snapshot) = 'array'),
  spend_snapshot jsonb not null default '[]' check (jsonb_typeof(spend_snapshot) = 'array'),
  actions_snapshot jsonb not null default '[]' check (jsonb_typeof(actions_snapshot) = 'array'),
  history jsonb not null default '[]' check (jsonb_typeof(history) = 'array'),
  version integer not null default 1 check (version > 0),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id),
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, week_start)
);
create index creative_lead_reviews_week_idx on public.creative_lead_reviews(week_start desc, status);
create index creative_lead_reviews_submitter_idx on public.creative_lead_reviews(submitted_by);
create index creative_lead_reviews_finalizer_idx on public.creative_lead_reviews(finalized_by);

create table public.creative_lead_actions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  strategist_id uuid references public.profiles(id),
  kind text not null default 'quality' check (kind in ('quality','retention','coaching','dependency')),
  title text not null check (length(trim(title)) between 1 and 240),
  diagnosis text not null check (length(trim(diagnosis)) between 1 and 6000),
  action_plan text not null check (length(trim(action_plan)) between 1 and 6000),
  owner_id uuid not null references public.profiles(id),
  due_date date not null,
  status text not null default 'open' check (status in ('open','in_progress','blocked','resolved')),
  evidence_url text not null default '' check (length(evidence_url) <= 2000 and (evidence_url = '' or evidence_url ~ '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$')),
  resolution_evidence text not null default '' check (length(resolution_evidence) <= 6000),
  identified_at timestamptz not null default now(),
  escalated_at timestamptz,
  recovery_plan_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'resolved' or length(trim(resolution_evidence)) > 0),
  check (kind <> 'retention' or client_id is not null),
  check (escalated_at is null or escalated_at >= identified_at),
  check (recovery_plan_at is null or recovery_plan_at >= identified_at),
  check (kind = 'retention' or (escalated_at is null and recovery_plan_at is null))
);
create index creative_lead_actions_client_idx on public.creative_lead_actions(client_id, status);
create index creative_lead_actions_owner_idx on public.creative_lead_actions(owner_id, due_date);
create index creative_lead_actions_strategist_idx on public.creative_lead_actions(strategist_id);
create index creative_lead_actions_creator_idx on public.creative_lead_actions(created_by);

create table public.creative_lead_coaching (
  id uuid primary key default gen_random_uuid(),
  strategist_id uuid not null references public.profiles(id),
  client_id uuid references public.clients(id),
  observation text not null check (length(trim(observation)) between 1 and 6000),
  expected_standard text not null check (length(trim(expected_standard)) between 1 and 6000),
  agreed_action text not null check (length(trim(agreed_action)) between 1 and 6000),
  due_date date not null,
  follow_up text not null default '' check (length(follow_up) <= 6000),
  outcome text not null default 'open' check (outcome in ('open','improving','resolved')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (outcome <> 'resolved' or length(trim(follow_up)) > 0)
);
create index creative_lead_coaching_strategist_idx on public.creative_lead_coaching(strategist_id, created_at desc);
create index creative_lead_coaching_client_idx on public.creative_lead_coaching(client_id);
create index creative_lead_coaching_creator_idx on public.creative_lead_coaching(created_by);

-- No private coaching fields are copied here. This is the deliberate, explicit
-- publication boundary; recipients never get SELECT access to coaching rows.
create table public.creative_lead_feedback (
  id uuid primary key default gen_random_uuid(),
  coaching_id uuid not null unique references public.creative_lead_coaching(id),
  recipient_id uuid not null references public.profiles(id),
  message text not null check (length(trim(message)) between 1 and 12000),
  published_by uuid not null default auth.uid() references public.profiles(id),
  published_at timestamptz not null default now()
);
create index creative_lead_feedback_recipient_idx on public.creative_lead_feedback(recipient_id, published_at desc);
create index creative_lead_feedback_publisher_idx on public.creative_lead_feedback(published_by);

-- Operations' accountability view needs only this completion signal, not the
-- confidential review body. Invoker triggers synchronize it atomically.
create table public.creative_lead_review_completions (
  review_id uuid primary key references public.creative_lead_reviews(id),
  lead_id uuid not null references public.profiles(id),
  week_start date not null,
  status text not null check (status in ('draft','submitted','changes_requested','finalized')),
  submitted_at timestamptz,
  finalized_at timestamptz,
  unique (lead_id, week_start)
);

alter table public.creative_lead_reviews enable row level security;
alter table public.creative_lead_actions enable row level security;
alter table public.creative_lead_coaching enable row level security;
alter table public.creative_lead_feedback enable row level security;
alter table public.creative_lead_review_completions enable row level security;

revoke all on public.creative_lead_reviews, public.creative_lead_actions, public.creative_lead_coaching, public.creative_lead_feedback, public.creative_lead_review_completions from public, anon, authenticated;
grant select, insert, update on public.creative_lead_reviews, public.creative_lead_actions, public.creative_lead_coaching, public.creative_lead_feedback, public.creative_lead_review_completions to authenticated;
grant all on public.creative_lead_reviews, public.creative_lead_actions, public.creative_lead_coaching, public.creative_lead_feedback, public.creative_lead_review_completions to service_role;

create policy creative_lead_reviews_read on public.creative_lead_reviews for select to authenticated using ((select public.can_access_creative_lead()));
create policy creative_lead_reviews_insert on public.creative_lead_reviews for insert to authenticated with check ((select public.is_creative_lead()) and lead_id = (select auth.uid()));
create policy creative_lead_reviews_update on public.creative_lead_reviews for update to authenticated using ((select public.can_access_creative_lead())) with check ((select public.can_access_creative_lead()));
create policy creative_lead_actions_read on public.creative_lead_actions for select to authenticated using ((select public.can_access_creative_lead()));
create policy creative_lead_actions_insert on public.creative_lead_actions for insert to authenticated with check ((select public.can_access_creative_lead()) and created_by = (select auth.uid()));
create policy creative_lead_actions_update on public.creative_lead_actions for update to authenticated using ((select public.can_access_creative_lead())) with check ((select public.can_access_creative_lead()));
create policy creative_lead_coaching_read on public.creative_lead_coaching for select to authenticated using ((select public.can_access_creative_lead()));
create policy creative_lead_coaching_insert on public.creative_lead_coaching for insert to authenticated with check ((select public.can_access_creative_lead()) and created_by = (select auth.uid()));
create policy creative_lead_coaching_update on public.creative_lead_coaching for update to authenticated using ((select public.can_access_creative_lead())) with check ((select public.can_access_creative_lead()));
create policy creative_lead_feedback_read on public.creative_lead_feedback for select to authenticated using (
  (select public.can_access_creative_lead()) or (recipient_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true))
);
create policy creative_lead_feedback_insert on public.creative_lead_feedback for insert to authenticated with check ((select public.can_access_creative_lead()));
create policy creative_lead_feedback_update on public.creative_lead_feedback for update to authenticated using ((select public.can_access_creative_lead())) with check ((select public.can_access_creative_lead()));
create policy creative_lead_completion_read on public.creative_lead_review_completions for select to authenticated using (
  (select public.can_access_creative_lead()) or (select public.can_manage_ops())
);
create policy creative_lead_completion_insert on public.creative_lead_review_completions for insert to authenticated with check (
  pg_trigger_depth() > 0 and (select public.can_access_creative_lead())
);
create policy creative_lead_completion_update on public.creative_lead_review_completions for update to authenticated using (
  pg_trigger_depth() > 0 and (select public.can_access_creative_lead())
) with check (pg_trigger_depth() > 0 and (select public.can_access_creative_lead()));

create function public.guard_creative_lead_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.can_access_creative_lead() then
    raise exception using errcode = '42501', message = 'Creative Leadership access is required.';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Creative Leadership records are retained and cannot be deleted.';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := v_actor;
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
  else
    if new.id is distinct from old.id or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at or new.updated_at is distinct from old.updated_at
      or new.version is distinct from old.version then
      raise exception using errcode = '22023', message = 'Record identity, authorship, timestamps, and version are server-controlled.';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  if tg_table_name = 'creative_lead_actions' then
    if tg_op = 'UPDATE' and new.identified_at is distinct from old.identified_at then
      raise exception using errcode = '22023', message = 'The original issue identification timestamp is immutable.';
    end if;
    if tg_op = 'UPDATE' and (
      (old.escalated_at is not null and new.escalated_at is distinct from old.escalated_at)
      or (old.recovery_plan_at is not null and new.recovery_plan_at is distinct from old.recovery_plan_at)
    ) then
      raise exception using errcode = '22023', message = 'Recorded retention response milestones cannot be cleared or rewritten.';
    end if;
    if new.identified_at > now() + interval '5 minutes'
      or (tg_op = 'INSERT' and new.identified_at < now() - interval '365 days')
      or new.escalated_at > now() + interval '5 minutes'
      or new.recovery_plan_at > now() + interval '5 minutes' then
      raise exception using errcode = '22023', message = 'Issue and response timestamps must reflect actual events, not future dates.';
    end if;
    if (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) and not exists (
      select 1 from public.profiles p where p.id = new.owner_id and p.is_active is true
    ) then
      raise exception using errcode = '22023', message = 'Choose an active team member as action owner.';
    end if;
  end if;
  if (tg_op = 'INSERT' or new.strategist_id is distinct from old.strategist_id) and new.strategist_id is not null and not exists (
    select 1 from public.profiles p where p.id = new.strategist_id and p.is_active is true
      and p.position in ('creative_strategist','head_of_creative_strategy')
  ) then
    raise exception using errcode = '22023', message = 'Choose an active creative strategist.';
  end if;
  if tg_table_name = 'creative_lead_coaching' and tg_op = 'UPDATE' and new.strategist_id is distinct from old.strategist_id then
    raise exception using errcode = '22023', message = 'Coaching cannot be reassigned to another person. Create a separate coaching record.';
  end if;
  return new;
end;
$$;
create trigger guard_creative_lead_actions before insert or update or delete on public.creative_lead_actions for each row execute function public.guard_creative_lead_record();
create trigger guard_creative_lead_coaching before insert or update or delete on public.creative_lead_coaching for each row execute function public.guard_creative_lead_record();

create function public.guard_creative_lead_feedback()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_recipient uuid;
begin
  if (select auth.uid()) is null or not public.can_access_creative_lead() then
    raise exception using errcode = '42501', message = 'Only Creative Leadership reviewers can publish coaching feedback.';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Published feedback is retained and cannot be deleted.';
  end if;
  select c.strategist_id into v_recipient from public.creative_lead_coaching c where c.id = new.coaching_id;
  if not found or not exists (select 1 from public.profiles p where p.id = v_recipient and p.is_active is true) then
    raise exception using errcode = '22023', message = 'Feedback requires a coaching record for an active recipient.';
  end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.coaching_id is distinct from old.coaching_id
    or new.recipient_id is distinct from old.recipient_id) then
    raise exception using errcode = '22023', message = 'Published feedback cannot be reassigned.';
  end if;
  new.recipient_id := v_recipient;
  new.published_by := (select auth.uid());
  new.published_at := now();
  return new;
end;
$$;
create trigger guard_creative_lead_feedback before insert or update or delete on public.creative_lead_feedback for each row execute function public.guard_creative_lead_feedback();

create function public.guard_creative_lead_review()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_last_week date := date_trunc('week', now() at time zone 'Asia/Dubai')::date - 7;
  v_item jsonb;
  v_field text;
  v_client_id uuid;
  v_seen uuid[] := '{}';
  v_flagged boolean;
begin
  if v_actor is null or not public.can_access_creative_lead() then
    raise exception using errcode = '42501', message = 'Creative Leadership access is required.';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Weekly reviews are retained and cannot be deleted.';
  end if;
  if tg_op = 'INSERT' then
    if not public.is_creative_lead() or new.lead_id is distinct from v_actor or new.status <> 'draft' then
      raise exception using errcode = '42501', message = 'Only the Head of Creative Strategy can create their own draft review.';
    end if;
    if new.week_start > v_last_week then
      raise exception using errcode = '22023', message = 'Review a completed week; the current incomplete week is not reviewable yet.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'cs_ids', coalesce(c.cs_ids, '[]'::jsonb), 'assigned_cs_id', c.assigned_cs_id,
      'strategist_names', (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name),'[]'::jsonb)
        from public.profiles p where p.id = c.assigned_cs_id or coalesce(c.cs_ids,'[]'::jsonb) ? p.id::text)
    ) order by c.name, c.id), '[]'::jsonb) into new.client_snapshot
      from public.clients c where c.is_active is true and c.is_archived is not true;
    new.reviewer_feedback := '';
    new.spend_snapshot := '[]';
    new.actions_snapshot := '[]';
    new.history := '[]';
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    new.submitted_at := null;
    new.submitted_by := null;
    new.finalized_at := null;
    new.finalized_by := null;
  else
    if old.status = 'finalized' then
      raise exception using errcode = '42501', message = 'Finalized weekly reviews are locked.';
    end if;
    if new.id is distinct from old.id or new.lead_id is distinct from old.lead_id or new.week_start is distinct from old.week_start
      or new.client_snapshot is distinct from old.client_snapshot or new.spend_snapshot is distinct from old.spend_snapshot
      or new.actions_snapshot is distinct from old.actions_snapshot or new.history is distinct from old.history
      or new.version is distinct from old.version or new.created_at is distinct from old.created_at or new.updated_at is distinct from old.updated_at
      or new.submitted_at is distinct from old.submitted_at or new.submitted_by is distinct from old.submitted_by
      or new.finalized_at is distinct from old.finalized_at or new.finalized_by is distinct from old.finalized_by then
      raise exception using errcode = '22023', message = 'Review identity, snapshots, audit history, version, and timestamps are server-controlled.';
    end if;
    if old.status in ('draft','changes_requested') then
      if not public.is_creative_lead() or old.lead_id <> v_actor
        or new.status not in (old.status, 'submitted') or new.reviewer_feedback is distinct from old.reviewer_feedback then
        raise exception using errcode = '42501', message = 'Only the review owner can edit the draft and submit it for review.';
      end if;
    elsif old.status = 'submitted' then
      if not public.can_review_creative_lead() or new.status not in ('changes_requested','finalized')
        or new.summary is distinct from old.summary or new.client_reviews is distinct from old.client_reviews then
        raise exception using errcode = '42501', message = 'Only the CEO or Operations Manager can finalize or request changes, without editing the lead review.';
      end if;
      if new.status = 'changes_requested' and nullif(trim(new.reviewer_feedback), '') is null then
        raise exception using errcode = '22023', message = 'Explain the changes requested before returning the review.';
      end if;
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;

  -- Check JSON types and supported keys even for drafts. Incomplete draft
  -- values are allowed, but arbitrary embedded data is not.
  if jsonb_typeof(new.client_reviews) <> 'array' or jsonb_array_length(new.client_reviews) > 500
    or octet_length(new.client_reviews::text) > 1500000 then
    raise exception using errcode = '22023', message = 'Client reviews must be a bounded array.';
  end if;
  for v_item in select value from jsonb_array_elements(new.client_reviews) loop
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'client_id') then
      raise exception using errcode = '22023', message = 'Each client review must identify one captured client.';
    end if;
    for v_field in select jsonb_object_keys(v_item) loop
      if not (v_field = any(array['client_id','quality_status','research_check','brief_check','signoff_check','learning_check','growth_guide_status','diagnosis','next_tests','blocker','evidence_url']))
        or jsonb_typeof(v_item -> v_field) <> 'string' or length(v_item ->> v_field) > 6000 then
        raise exception using errcode = '22023', message = 'Client reviews contain an unsupported field, type, or oversized value.';
      end if;
    end loop;
    begin v_client_id := (v_item ->> 'client_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Invalid client identifier.';
    end;
    if v_client_id = any(v_seen) or not exists (select 1 from jsonb_array_elements(new.client_snapshot) c where c ->> 'id' = v_client_id::text) then
      raise exception using errcode = '22023', message = 'Each captured client can be reviewed only once; extra clients are not allowed.';
    end if;
    v_seen := array_append(v_seen, v_client_id);
    if coalesce(v_item ->> 'quality_status','') <> '' and v_item ->> 'quality_status' not in ('on_track','needs_attention','blocked','insufficient_evidence')
      or coalesce(v_item ->> 'growth_guide_status','') <> '' and v_item ->> 'growth_guide_status' not in ('updated','needs_update','blocked') then
      raise exception using errcode = '22023', message = 'Unsupported creative or Growth Guide status.';
    end if;
    foreach v_field in array array['research_check','brief_check','signoff_check','learning_check'] loop
      if coalesce(v_item ->> v_field,'') <> '' and v_item ->> v_field not in ('pass','needs_work','blocked','not_applicable') then
        raise exception using errcode = '22023', message = 'Unsupported creative review check.';
      end if;
    end loop;
    if coalesce(v_item ->> 'evidence_url','') <> '' and (length(v_item ->> 'evidence_url') > 2000
      or (v_item ->> 'evidence_url') !~ '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$') then
      raise exception using errcode = '22023', message = 'Evidence links must be valid HTTP or HTTPS URLs.';
    end if;
    if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
      if coalesce(v_item ->> 'quality_status','') not in ('on_track','needs_attention','blocked','insufficient_evidence')
        or coalesce(v_item ->> 'growth_guide_status','') not in ('updated','needs_update','blocked') then
        raise exception using errcode = '22023', message = 'Each client needs a creative status and Growth Guide status.';
      end if;
      foreach v_field in array array['research_check','brief_check','signoff_check','learning_check'] loop
        if coalesce(v_item ->> v_field,'') not in ('pass','needs_work','blocked','not_applicable') then
          raise exception using errcode = '22023', message = 'Complete research, brief, sign-off, and learning checks for every client.';
        end if;
      end loop;
      if nullif(trim(v_item ->> 'evidence_url'),'') is null or nullif(trim(v_item ->> 'next_tests'),'') is null then
        raise exception using errcode = '22023', message = 'Every client requires an evidence link and next tests.';
      end if;
      if v_item ->> 'quality_status' in ('blocked','insufficient_evidence') and nullif(trim(v_item ->> 'blocker'),'') is null then
        raise exception using errcode = '22023', message = 'Explain the blocker or missing evidence.';
      end if;
      v_flagged := v_item ->> 'quality_status' <> 'on_track' or v_item ->> 'growth_guide_status' <> 'updated'
        or exists (select 1 from jsonb_each_text(v_item) e where e.key in ('research_check','brief_check','signoff_check','learning_check') and e.value in ('needs_work','blocked'));
      if v_flagged and (nullif(trim(v_item ->> 'diagnosis'),'') is null or not exists (
        select 1 from public.creative_lead_actions a where a.client_id = v_client_id and a.status in ('open','in_progress','blocked')
      )) then
        raise exception using errcode = '22023', message = 'Flagged clients require a diagnosis and an open linked corrective action.';
      end if;
    end if;
  end loop;

  if tg_op = 'UPDATE' and new.status = 'submitted' and old.status <> 'submitted' then
    if nullif(trim(new.summary),'') is null or cardinality(v_seen) <> jsonb_array_length(new.client_snapshot) then
      raise exception using errcode = '22023', message = 'Add a leadership summary and complete every captured client before submitting.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('client_id',s.client_id,'week_start',s.week_start,'ddu_spend',s.ddu_spend,'total_spend',s.total_spend) order by s.client_id),'[]'::jsonb)
      into new.spend_snapshot from (
        select distinct on (e.client_id) e.client_id,e.week_start,e.ddu_spend,e.total_spend
        from public.spend_entries e
        where e.week_start = new.week_start and e.client_id = any(v_seen)
        order by e.client_id,e.updated_at desc nulls last,e.created_at desc nulls last,e.id desc
      ) s;
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]'::jsonb) into new.actions_snapshot
      from public.creative_lead_actions a where a.client_id = any(v_seen) or a.client_id is null;
    new.submitted_at := now();
    new.submitted_by := v_actor;
  end if;
  if tg_op = 'UPDATE' and new.status = 'finalized' then
    new.finalized_at := now();
    new.finalized_by := v_actor;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.history := old.history || jsonb_build_array(jsonb_build_object(
      'from_status',old.status,'to_status',new.status,'at',now(),'actor_id',v_actor,
      'snapshot',to_jsonb(new) - 'history'
    ));
  end if;
  return new;
end;
$$;
create trigger guard_creative_lead_review before insert or update or delete on public.creative_lead_reviews for each row execute function public.guard_creative_lead_review();

create function public.guard_creative_lead_completion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if pg_trigger_depth() < 2 or not public.can_access_creative_lead() or not exists (
    select 1 from public.creative_lead_reviews r where r.id = new.review_id
      and r.lead_id = new.lead_id and r.week_start = new.week_start and r.status = new.status
      and r.submitted_at is not distinct from new.submitted_at and r.finalized_at is not distinct from new.finalized_at
  ) then
    raise exception using errcode = '42501', message = 'The accountability signal is maintained only by the weekly-review workflow.';
  end if;
  return new;
end;
$$;
create trigger guard_creative_lead_completion before insert or update on public.creative_lead_review_completions for each row execute function public.guard_creative_lead_completion();
create function public.sync_creative_lead_completion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.creative_lead_review_completions(review_id,lead_id,week_start,status,submitted_at,finalized_at)
    values(new.id,new.lead_id,new.week_start,new.status,new.submitted_at,new.finalized_at)
    on conflict (review_id) do update set status=excluded.status,submitted_at=excluded.submitted_at,finalized_at=excluded.finalized_at;
  return new;
end;
$$;
create trigger sync_creative_lead_completion after insert or update on public.creative_lead_reviews for each row execute function public.sync_creative_lead_completion();

revoke all on function public.guard_creative_lead_record(), public.guard_creative_lead_feedback(), public.guard_creative_lead_review(), public.guard_creative_lead_completion(), public.sync_creative_lead_completion() from public, anon, authenticated;

comment on table public.creative_lead_reviews is 'Private completed-week Head CS reviews; immutable captured roster, spend snapshots, and transition audit history. No performance score until targets are approved.';
comment on table public.creative_lead_coaching is 'Private leadership coaching records. Never shown to recipients; explicit published feedback is stored separately.';
comment on table public.creative_lead_review_completions is 'Minimal accountability completion metadata. Contains no client assessments, coaching, or leadership notes.';
