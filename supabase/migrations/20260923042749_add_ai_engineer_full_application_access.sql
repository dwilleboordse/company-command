-- Distinct, explicitly provisioned AI Engineer access to Command Center.
-- Existing CEO/management permissions, ownership, and finalized-record guards remain intact.
-- This does not grant Supabase/Vercel infrastructure or access to other applications.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('ceo','management','athlete','ai_engineer'));

create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
create table private.application_access (
  profile_id uuid primary key references public.profiles(id),
  capability text not null check (capability = 'ai_engineer_full_access'),
  created_at timestamptz not null default now()
);
alter table private.application_access enable row level security;
revoke all on private.application_access from public, anon, authenticated;
grant select on private.application_access to authenticated;
grant all on private.application_access to service_role;
create policy application_access_self on private.application_access
  for select to authenticated using (profile_id = (select auth.uid()));

-- Invoker, not a privilege-escalating definer function: callers may read only their
-- own provisioned grant and cannot create/update/delete any grant.
create function public.has_ai_engineer_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join private.application_access a on a.profile_id = p.id
    where p.id = (select auth.uid())
      and p.is_active is true and p.role = 'ai_engineer'
      and a.capability = 'ai_engineer_full_access'
  );
$$;
revoke all on function public.has_ai_engineer_access() from public, anon, authenticated;
grant execute on function public.has_ai_engineer_access() to authenticated, service_role;

-- Extend only the existing authorization predicate in can_access_creative_lead.
CREATE OR REPLACE FUNCTION public.can_access_creative_lead()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.profiles p join public.creative_lead_access a on a.profile_id=p.id
    where p.id = (select auth.uid()) and p.is_active is true
      and ((a.capability='reviewer' and ((p.role='ceo' or (select public.has_ai_engineer_access())) or p.position='ops_manager'))
        or (a.capability='lead' and p.position='head_of_creative_strategy')));
$function$
;

-- Extend only the existing authorization predicate in can_manage_ops.
CREATE OR REPLACE FUNCTION public.can_manage_ops()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (
        (profile.role in ('ceo', 'management') or (select public.has_ai_engineer_access()))
        or lower(trim(coalesce(profile.department, ''))) = 'operations'
        or profile.position in ('ops_manager', 'ops_assistant')
      )
  );
$function$
;

-- Extend only the existing authorization predicate in can_review_creative_lead.
CREATE OR REPLACE FUNCTION public.can_review_creative_lead()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.profiles p join public.creative_lead_access a on a.profile_id=p.id
    where p.id = (select auth.uid()) and p.is_active is true
      and a.capability='reviewer' and ((p.role = 'ceo' or (select public.has_ai_engineer_access())) or p.position = 'ops_manager'));
$function$
;

-- Extend only the existing authorization predicate in close_design_cs_month.
CREATE OR REPLACE FUNCTION public.close_design_cs_month(p_current_month date, p_new_month date, p_new_label text, p_working_days smallint, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_latest_month date;
  v_snapshot_count integer := 0;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to close a Design and CS month.';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_user_id
      and profile.is_active is true
      and (
        (profile.role = 'ceo' or (select public.has_ai_engineer_access()))
        or lower(trim(coalesce(profile.department, ''))) = 'operations'
        or profile.position in ('ops_manager', 'ops_assistant')
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'CEO or Operations access is required to close a Design and CS month.';
  end if;

  if p_new_month <> (p_current_month + interval '1 month')::date then
    raise exception using
      errcode = '22023',
      message = 'The new Design and CS month must immediately follow the month being closed.';
  end if;

  if extract(day from p_current_month) <> 1 or extract(day from p_new_month) <> 1 then
    raise exception using
      errcode = '22023',
      message = 'Design and CS months must start on the first day of the month.';
  end if;

  if nullif(trim(p_new_label), '') is null then
    raise exception using
      errcode = '22023',
      message = 'The new Design and CS month requires a label.';
  end if;

  if p_working_days not between 1 and 31 then
    raise exception using
      errcode = '22023',
      message = 'Working days must be between 1 and 31.';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'The closing allocation snapshot must be a JSON array.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('design_cs_month_rollover', 0));

  select max(month.month_start)
  into v_latest_month
  from public.design_cs_months month;

  if v_latest_month = p_new_month then
    select count(*)
    into v_snapshot_count
    from public.design_cs_allocations allocation
    where allocation.month_start = p_current_month;

    return jsonb_build_object(
      'closed_month', p_current_month,
      'new_month', p_new_month,
      'snapshot_count', v_snapshot_count,
      'already_started', true
    );
  end if;

  if v_latest_month is distinct from p_current_month then
    raise exception using
      errcode = 'P0001',
      message = 'Only the latest Design and CS month can be closed.';
  end if;

  delete from public.design_cs_allocations allocation
  where allocation.month_start = p_current_month;

  insert into public.design_cs_allocations (
    month_start,
    source_key,
    client_id,
    client_name_snapshot,
    package_type,
    ugc_creators_per_month,
    seeding_creators_per_month,
    strategist_key,
    strategist_keys,
    statics,
    videos,
    designer_keys,
    editor_keys,
    ugc_manager_keys,
    ugc_enabled,
    notes,
    updated_at,
    updated_by
  )
  select
    p_current_month,
    item.source_key,
    item.client_id,
    item.client_name_snapshot,
    item.package_type,
    item.ugc_creators_per_month,
    item.seeding_creators_per_month,
    item.strategist_key,
    coalesce(item.strategist_keys, '{}'::text[]),
    coalesce(item.statics, 0),
    coalesce(item.videos, 0),
    coalesce(item.designer_keys, '{}'::text[]),
    coalesce(item.editor_keys, '{}'::text[]),
    coalesce(item.ugc_manager_keys, '{}'::text[]),
    coalesce(item.ugc_enabled, false),
    coalesce(item.notes, ''),
    now(),
    v_user_id
  from jsonb_to_recordset(p_allocations) as item (
    source_key text,
    client_id uuid,
    client_name_snapshot text,
    package_type text,
    ugc_creators_per_month integer,
    seeding_creators_per_month integer,
    strategist_key text,
    strategist_keys text[],
    statics integer,
    videos integer,
    designer_keys text[],
    editor_keys text[],
    ugc_manager_keys text[],
    ugc_enabled boolean,
    notes text
  );

  get diagnostics v_snapshot_count = row_count;

  update public.design_cs_months
  set
    is_locked = true,
    updated_at = now(),
    updated_by = v_user_id
  where month_start = p_current_month;

  insert into public.design_cs_months (
    month_start,
    label,
    working_days,
    source,
    is_locked,
    updated_by
  ) values (
    p_new_month,
    trim(p_new_label),
    p_working_days,
    'company_command',
    false,
    v_user_id
  );

  return jsonb_build_object(
    'closed_month', p_current_month,
    'new_month', p_new_month,
    'snapshot_count', v_snapshot_count,
    'already_started', false
  );
end;
$function$
;

-- Extend only the existing authorization predicate in validate_monthly_survey_feedback.
CREATE OR REPLACE FUNCTION public.validate_monthly_survey_feedback()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
        (profile.role in ('ceo', 'management') or (select public.has_ai_engineer_access()))
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
          (profile.role = 'ceo' or (select public.has_ai_engineer_access()))
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
$function$
;

-- Add the capability only at role checks, retaining all status/ownership conditions.
alter policy "Mgmt/Ops can write accountability_logs" on public."accountability_logs"
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((p.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (p."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "CEO only entries" on public."ceo_model_entries"
  using (((get_my_role() = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "CEO only" on public."ceo_models"
  using (((get_my_role() = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Users can delete own entries" on public."change_log"
  using (((entered_by = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "Management can manage client actions" on public."client_actions"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Management can delete client churn profiles" on public."client_churn_profiles"
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))))
;

alter policy "Management can insert client churn profiles" on public."client_churn_profiles"
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))))
;

alter policy "Management can read client churn profiles" on public."client_churn_profiles"
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))))
;

alter policy "Management can update client churn profiles" on public."client_churn_profiles"
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))))
;

alter policy "Management can access health entries" on public."client_health_entries"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Management can access clients" on public."clients"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Users see own day entries" on public."day_entries"
  using (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "CEO and Ops can manage Design CS allocations" on public."design_cs_allocations"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (lower(TRIM(BOTH FROM COALESCE(profile.department, ''::text))) = 'operations'::text) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (lower(TRIM(BOTH FROM COALESCE(profile.department, ''::text))) = 'operations'::text) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "CEO and Ops can manage Design CS settings" on public."design_cs_capacity_settings"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (lower(TRIM(BOTH FROM COALESCE(profile.department, ''::text))) = 'operations'::text) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (lower(TRIM(BOTH FROM COALESCE(profile.department, ''::text))) = 'operations'::text) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "CEO can insert Design CS import snapshots" on public."design_cs_import_snapshots"
  with check ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND ((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access())))))))
;

alter policy "CEO can read Design CS import snapshots" on public."design_cs_import_snapshots"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND ((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access())))))))
;

alter policy "CEO and Ops can manage Design CS months" on public."design_cs_months"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (lower(TRIM(BOTH FROM COALESCE(profile.department, ''::text))) = 'operations'::text) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (lower(TRIM(BOTH FROM COALESCE(profile.department, ''::text))) = 'operations'::text) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "CEO and Ops can manage Design CS people" on public."design_cs_people"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (lower(TRIM(BOTH FROM COALESCE(profile.department, ''::text))) = 'operations'::text) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (lower(TRIM(BOTH FROM COALESCE(profile.department, ''::text))) = 'operations'::text) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "CEO can manage hiring roadmap" on public."hiring_roadmap_items"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND ((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access())))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND ((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access())))))))
;

alter policy "Mgmt Ops read checkpoints" on public."hundred_day_plan_checkpoints"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Mgmt Ops read cycle pulses" on public."hundred_day_plan_cycle_pulses"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Mgmt Ops read cycles" on public."hundred_day_plan_cycles"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Mgmt Ops read dependencies" on public."hundred_day_plan_dependencies"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Mgmt Ops read goals" on public."hundred_day_plan_goals"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Mgmt Ops read milestones" on public."hundred_day_plan_milestones"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Mgmt Ops read weekly pulses" on public."hundred_day_plan_weekly_pulses"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Mgmt/Ops can read all plans" on public."hundred_day_plans"
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((p.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (p."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Management can manage key results" on public."key_results"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "CEO/Management can insert kpi entries" on public."kpi_entries"
  with check (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Athletes see team kpis" on public."kpis"
  using (((visibility = 'team'::text) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "CEO/Management can manage kpis" on public."kpis"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Users manage own kr values" on public."kr_values"
  with check (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "Users read own kr values" on public."kr_values"
  using (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "Users update own kr values" on public."kr_values"
  using (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "Users see own preps" on public."meeting_preps"
  using (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "CEO/Management can manage recaps" on public."meeting_recaps"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "CEO/Management can manage milestones" on public."milestones"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Authorized users read survey feedback" on public."monthly_survey_feedback"
  using ((((status = 'finalized'::text) AND (EXISTS ( SELECT 1
   FROM monthly_survey_submissions submission
  WHERE ((submission.id = monthly_survey_feedback.submission_id) AND (submission.user_id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text]))))))))
;

alter policy "Management and Operations create survey feedback drafts" on public."monthly_survey_feedback"
  with check (((status = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))) AND (EXISTS ( SELECT 1
   FROM monthly_survey_submissions submission
  WHERE ((submission.id = monthly_survey_feedback.submission_id) AND (submission.status = 'submitted'::text))))))
;

alter policy "Management and Operations update survey feedback" on public."monthly_survey_feedback"
  using (((status = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text]))))))))
  with check ((((status = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text]))))))) OR ((status = 'finalized'::text) AND (EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))))
;

alter policy "Management and Operations read all survey submissions" on public."monthly_survey_submissions"
  using ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.is_active IS TRUE) AND (((profile.role = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))) OR (profile."position" = ANY (ARRAY['ops_manager'::text, 'ops_assistant'::text])))))))
;

alter policy "Management can manage objectives" on public."objectives"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Management can manage team reviews" on public."team_reviews"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Users manage own kpi values" on public."user_kpi_values"
  with check (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "Users read own kpi values" on public."user_kpi_values"
  using (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "Users update own kpi values" on public."user_kpi_values"
  using (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "CEO can manage assignments" on public."user_kpis"
  using (((get_my_role() = 'ceo'::text OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Users see own assignments" on public."user_kpis"
  using (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

alter policy "Management can read all" on public."week_outcomes"
  using (((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access()))))
;

alter policy "Users see own week outcomes" on public."week_outcomes"
  using (((user_id = auth.uid()) OR ((get_my_role() = ANY (ARRAY['ceo'::text, 'management'::text]) OR (SELECT public.has_ai_engineer_access())))))
;

-- Only the exact existing Supabase login requested by the owner is provisioned.
do $$
declare v_user uuid;
begin
  select id into strict v_user from auth.users
    where lower(email) = 'john.carlo@d-doubleumedia.com';
  if exists (select 1 from public.profiles where id = v_user
    and lower(email) <> 'john.carlo@d-doubleumedia.com') then
    raise exception 'John Carlo profile email mismatch; review before provisioning.';
  end if;

  insert into public.profiles(id,email,full_name,role,position,is_active)
  values (v_user,'john.carlo@d-doubleumedia.com','John Carlo','ai_engineer','ai_engineer',true)
  on conflict(id) do update set role=excluded.role,position=excluded.position,is_active=true,updated_at=now();

  insert into private.application_access(profile_id,capability)
  values (v_user,'ai_engineer_full_access');
  insert into public.creative_lead_access(profile_id,capability)
  values (v_user,'reviewer')
  on conflict(profile_id) do update set capability=excluded.capability;
end;
$$;
