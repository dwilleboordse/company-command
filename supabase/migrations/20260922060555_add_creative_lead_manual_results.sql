-- Additive manual results inside the existing private review/snapshot boundary.
-- No historical review payload, roster, spend, or permission is rewritten.
alter table public.creative_lead_reviews
  add column results_version integer not null default 0
  check (results_version in (0, 1));
comment on column public.creative_lead_reviews.results_version is
  'Server-controlled results contract: historical reviews remain 0; every new review uses 1. Not the optimistic row version.';

-- Replaces only the review guard: all existing access checks, ownership,
-- transitions, snapshots, optimistic revisions, and audit history are retained.
create or replace function public.guard_creative_lead_review()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_last_week date := date_trunc('week', now() at time zone 'Asia/Dubai')::date - 7;
  v_item jsonb;
  v_field text;
  v_client_id uuid;
  v_seen uuid[] := '{}';
  v_flagged boolean;
  v_results jsonb;
  v_status text;
  v_value numeric;
  v_submitting boolean;
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
    new.results_version := 1;
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
      or new.version is distinct from old.version or new.results_version is distinct from old.results_version
      or new.created_at is distinct from old.created_at or new.updated_at is distinct from old.updated_at
      or new.submitted_at is distinct from old.submitted_at or new.submitted_by is distinct from old.submitted_by
      or new.finalized_at is distinct from old.finalized_at or new.finalized_by is distinct from old.finalized_by then
      raise exception using errcode = '22023', message = 'Review identity, snapshots, audit history, versions, and timestamps are server-controlled.';
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
  v_submitting := tg_op = 'UPDATE' and new.status = 'submitted' and old.status <> 'submitted';

  -- Drafts may be incomplete, never malformed. Nested result counts are JSON
  -- numbers, not strings or booleans, and missing data is never coerced to zero.
  if jsonb_typeof(new.client_reviews) <> 'array' or jsonb_array_length(new.client_reviews) > 500
    or octet_length(new.client_reviews::text) > 1500000 then
    raise exception using errcode = '22023', message = 'Client reviews must be a bounded array.';
  end if;
  for v_item in select value from jsonb_array_elements(new.client_reviews) loop
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'client_id') then
      raise exception using errcode = '22023', message = 'Each client review must identify one captured client.';
    end if;
    for v_field in select jsonb_object_keys(v_item) loop
      if v_field = 'results' then
        if jsonb_typeof(v_item -> v_field) is distinct from 'object' then
          raise exception using errcode = '22023', message = 'Manual results must be an object.';
        end if;
      elsif not (v_field = any(array['client_id','quality_status','research_check','brief_check','signoff_check','learning_check','growth_guide_status','diagnosis','next_tests','blocker','evidence_url']))
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

    v_results := v_item -> 'results';
    if v_results is not null then
      for v_field in select jsonb_object_keys(v_results) loop
        if v_field = any(array['eligible_ads','winners','super_winners','blocked_ads','inconclusive_ads']) then
          if jsonb_typeof(v_results -> v_field) <> 'null' then
            if jsonb_typeof(v_results -> v_field) <> 'number' then
              raise exception using errcode = '22023', message = 'Result counts must be whole JSON numbers or null.';
            end if;
            v_value := (v_results ->> v_field)::numeric;
            if v_value < 0 or v_value > 1000000 or trunc(v_value) <> v_value then
              raise exception using errcode = '22023', message = 'Result counts must be whole numbers between 0 and 1,000,000.';
            end if;
          end if;
        elsif v_field = any(array['status','notes','evidence_url']) then
          if jsonb_typeof(v_results -> v_field) <> 'string'
            or length(v_results ->> v_field) > (case when v_field='evidence_url' then 2000 else 6000 end) then
            raise exception using errcode = '22023', message = 'Result status, notes and evidence must be bounded strings.';
          end if;
        else
          raise exception using errcode = '22023', message = 'Manual results contain an unsupported field.';
        end if;
      end loop;
      v_status := v_results ->> 'status';
      if v_status is not null and v_status not in ('not_entered','logged','no_tests','unavailable') then
        raise exception using errcode = '22023', message = 'Unsupported manual results status.';
      end if;
      if coalesce(v_results ->> 'evidence_url','') <> '' and (
        (v_results ->> 'evidence_url') !~* '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'
        or position(chr(92) in v_results ->> 'evidence_url') > 0
        or (v_results ->> 'evidence_url') ~ '[[:cntrl:]]'
      ) then
        raise exception using errcode = '22023', message = 'Result evidence must be a credential-free HTTP or HTTPS URL.';
      end if;
      if (v_results ->> 'super_winners')::numeric > (v_results ->> 'winners')::numeric
        or (v_results ->> 'winners')::numeric > (v_results ->> 'eligible_ads')::numeric then
        raise exception using errcode = '22023', message = 'Super-winners are included in winners, and winners cannot exceed eligible tested ads.';
      end if;
      -- An incomplete draft may omit counts, but an explicitly contradictory
      -- status/count combination is not a valid partial result.
      if v_status = 'logged' and (v_results ->> 'eligible_ads')::numeric = 0 then
        raise exception using errcode = '22023', message = 'Logged results require at least one eligible tested ad.';
      end if;
      if v_status = 'no_tests' and ((v_results ->> 'eligible_ads')::numeric <> 0
        or (v_results ->> 'winners')::numeric <> 0 or (v_results ->> 'super_winners')::numeric <> 0) then
        raise exception using errcode = '22023', message = 'No eligible tests requires eligible ads, winners and super-winners to be zero.';
      end if;
      if v_status = 'unavailable' then
        foreach v_field in array array['eligible_ads','winners','super_winners','blocked_ads','inconclusive_ads'] loop
          if v_results ? v_field and jsonb_typeof(v_results -> v_field) <> 'null' then
            raise exception using errcode = '22023', message = 'Unavailable results must leave every count null, not zero.';
          end if;
        end loop;
      end if;
    end if;

    if v_submitting then
      -- Historical reviews are not retroactively blocked. If results are added
      -- voluntarily, they still have to be complete and truthful at submission.
      if new.results_version = 1 or v_results is not null then
        if v_results is null or coalesce(v_results ->> 'status','') not in ('logged','no_tests','unavailable') then
          raise exception using errcode = '22023', message = 'Record results, no eligible tests, or an explained results gap for every client.';
        end if;
        v_status := v_results ->> 'status';
        foreach v_field in array array['eligible_ads','winners','super_winners','blocked_ads','inconclusive_ads'] loop
          if not (v_results ? v_field) or jsonb_typeof(v_results -> v_field) is distinct from
            (case when v_status='unavailable' then 'null' else 'number' end) then
            raise exception using errcode = '22023', message = 'Provide all five result counts, or explicitly leave all five null when results are unavailable.';
          end if;
        end loop;
        if v_status in ('logged','no_tests') and nullif(trim(v_results ->> 'evidence_url'),'') is null then
          raise exception using errcode = '22023', message = 'Link the source sheet for logged results and no-test weeks.';
        end if;
        if v_status = 'unavailable' and nullif(trim(v_results ->> 'notes'),'') is null then
          raise exception using errcode = '22023', message = 'Explain why result data is unavailable; missing data is not a zero.';
        end if;
      end if;
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

  if v_submitting then
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
revoke all on function public.guard_creative_lead_review() from public, anon, authenticated;
comment on table public.creative_lead_reviews is
  'Private completed-week Head CS reviews with manual evidence-backed ad results; immutable roster, spend and transition snapshots. Historical result gaps are not zeros.';
