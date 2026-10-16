CREATE TABLE public.okr_client_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 key_result_id uuid NOT NULL REFERENCES public.key_results(id),
 client_id uuid NOT NULL REFERENCES public.clients(id),
 client_name text NOT NULL DEFAULT '',
 month_start date NOT NULL CHECK (month_start IN (DATE '2026-10-01',DATE '2026-11-01',DATE '2026-12-01')),
 scope_status text NOT NULL DEFAULT 'pending' CHECK (scope_status IN ('pending','included','excluded')),
 exclusion_reason text NOT NULL DEFAULT '',
 entry_status text NOT NULL DEFAULT 'draft' CHECK (entry_status IN ('draft','recorded')),
 comparison_basis text NOT NULL DEFAULT 'full_month' CHECK (comparison_basis IN ('full_month','matched_mtd')),
 as_of date NOT NULL,
 currency text NOT NULL DEFAULT '',
 channel_scope text NOT NULL DEFAULT '',
 previous_spend numeric CHECK (previous_spend >= 0 AND previous_spend < 'Infinity'::numeric),
 current_spend numeric CHECK (current_spend >= 0 AND current_spend < 'Infinity'::numeric),
 observed_growth numeric GENERATED ALWAYS AS (CASE WHEN previous_spend > 0 AND current_spend IS NOT NULL THEN (current_spend / previous_spend - 1) * 100 END) STORED,
 target_pct_snapshot numeric,
 guardrails jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(guardrails)='array' AND jsonb_array_length(guardrails)<=5),
 evidence text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 history jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_by uuid REFERENCES public.profiles(id),
 updated_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (key_result_id,client_id,month_start)
);
ALTER TABLE public.okr_client_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.okr_client_observations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.okr_client_observations TO authenticated;

CREATE FUNCTION public.can_access_okr_client_observation(p_kr uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS (
 SELECT 1 FROM public.key_results k JOIN public.objectives o ON o.id=k.objective_id
 JOIN public.okr_cycle_members m ON m.period=o.quarter AND m.user_id=(SELECT auth.uid())
 WHERE k.id=p_kr AND k.is_active AND o.is_active AND o.quarter='Q4-2026'
 AND k.planning_context->>'code'='DMB.2' AND o.planning_context->>'department_key'='media_buying'
 AND m.is_active AND public.okr_access(o.quarter) IS NOT NULL
 AND CASE WHEN p_write THEN m.access_role='admin' OR (o.owner_id=m.user_id AND m.access_role IN ('lead','coordinator'))
 ELSE m.access_role IN ('admin','coordinator') OR m.department_key='media_buying' OR o.owner_id=m.user_id END
 );
$$;
REVOKE ALL ON FUNCTION public.can_access_okr_client_observation(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_okr_client_observation(uuid,boolean) TO authenticated;
CREATE POLICY client_observation_read ON public.okr_client_observations FOR SELECT TO authenticated USING (public.can_access_okr_client_observation(key_result_id,false));
CREATE POLICY client_observation_insert ON public.okr_client_observations FOR INSERT TO authenticated WITH CHECK (public.can_access_okr_client_observation(key_result_id,true));
CREATE POLICY client_observation_update ON public.okr_client_observations FOR UPDATE TO authenticated USING (public.can_access_okr_client_observation(key_result_id,true)) WITH CHECK (public.can_access_okr_client_observation(key_result_id,true));

CREATE FUNCTION public.validate_okr_client_observation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g jsonb; n numeric; v_target numeric; v_name text;
 last_day date; previous_last date; today date:=(now() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.can_access_okr_client_observation(NEW.key_result_id,true) THEN RAISE EXCEPTION 'Only the Media Buying lead or an administrator can change client measurements'; END IF;
 SELECT k.goal_value INTO v_target FROM public.key_results k JOIN public.objectives o ON o.id=k.objective_id
 WHERE k.id=NEW.key_result_id AND k.is_active AND o.is_active AND o.quarter='Q4-2026' AND o.planning_context->>'department_key'='media_buying' AND k.planning_context->>'code'='DMB.2' AND k.goal_direction='max';
 IF NOT FOUND THEN RAISE EXCEPTION 'Select the active Media Buying spend-growth key result'; END IF;
 SELECT name INTO v_name FROM public.clients WHERE id=NEW.client_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an accessible client'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.key_result_id,NEW.client_id,NEW.month_start) IS DISTINCT FROM (OLD.id,OLD.key_result_id,OLD.client_id,OLD.month_start) THEN RAISE EXCEPTION 'The client, month and key result of a saved observation cannot change'; END IF;
  NEW.history:=OLD.history || jsonb_build_array(to_jsonb(OLD)-'history');
  NEW.revision:=OLD.revision+1; NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at;
 ELSE NEW.history:='[]'::jsonb; NEW.revision:=1; NEW.created_by:=auth.uid(); NEW.created_at:=now(); END IF;
 NEW.client_name:=v_name; NEW.updated_by:=auth.uid(); NEW.updated_at:=now();
 NEW.currency:=upper(btrim(NEW.currency));
 NEW.target_pct_snapshot:=v_target;
 IF NEW.scope_status='excluded' AND nullif(btrim(NEW.exclusion_reason),'') IS NULL THEN RAISE EXCEPTION 'Record the reason for excluding this client'; END IF;
 IF jsonb_typeof(NEW.guardrails) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.guardrails)>5 THEN RAISE EXCEPTION 'Use up to five agreed KPI conditions'; END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(NEW.guardrails) LOOP
  IF jsonb_typeof(g) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid KPI condition'; END IF;
  IF coalesce(g->>'direction','') NOT IN ('','at_least','at_most') THEN RAISE EXCEPTION 'Invalid KPI direction'; END IF;
  IF jsonb_typeof(g->'target')='number' THEN n:=(g->>'target')::numeric; IF n NOT BETWEEN -1000000000000000 AND 1000000000000000 THEN RAISE EXCEPTION 'Invalid KPI target'; END IF;
  ELSIF g?'target' AND jsonb_typeof(g->'target')<>'null' THEN RAISE EXCEPTION 'KPI target must be numeric or unknown'; END IF;
  IF jsonb_typeof(g->'actual')='number' THEN n:=(g->>'actual')::numeric; IF n NOT BETWEEN -1000000000000000 AND 1000000000000000 THEN RAISE EXCEPTION 'Invalid KPI actual'; END IF;
  ELSIF g?'actual' AND jsonb_typeof(g->'actual')<>'null' THEN RAISE EXCEPTION 'KPI actual must be numeric or unknown'; END IF;
 END LOOP;
 IF NEW.entry_status='recorded' THEN
  IF NEW.scope_status<>'included' THEN RAISE EXCEPTION 'A recorded measurement needs an included client'; END IF;
  last_day:=(NEW.month_start+interval '1 month - 1 day')::date; previous_last:=NEW.month_start-1;
  IF NEW.as_of<NEW.month_start OR NEW.as_of>last_day OR NEW.as_of>today THEN RAISE EXCEPTION 'Use actual dates within the comparison month, not future dates'; END IF;
  IF NEW.comparison_basis='full_month' AND (NEW.as_of<>last_day OR last_day>=today) THEN RAISE EXCEPTION 'Full-month comparisons require a completed month; use matched month-to-date for an ongoing month'; END IF;
  IF NEW.comparison_basis='matched_mtd' AND extract(day FROM NEW.as_of)>extract(day FROM previous_last) THEN RAISE EXCEPTION 'Use the same available day in both months for a matched month-to-date comparison'; END IF;
  IF NEW.previous_spend IS NULL OR NEW.previous_spend<=0 OR NEW.current_spend IS NULL OR NEW.current_spend<0 THEN RAISE EXCEPTION 'Supply comparable spend values with positive prior-period spend, or save as draft'; END IF;
  IF NEW.currency!~'^[A-Z]{3}$' OR nullif(btrim(NEW.channel_scope),'') IS NULL OR nullif(btrim(NEW.evidence),'') IS NULL THEN RAISE EXCEPTION 'Supply currency, channel scope and evidence for both spend and KPI data'; END IF;
  IF v_target IS NULL OR jsonb_array_length(NEW.guardrails)=0 THEN RAISE EXCEPTION 'A measurement needs the shared target and at least one agreed client KPI'; END IF;
  FOR g IN SELECT value FROM jsonb_array_elements(NEW.guardrails) LOOP
   IF nullif(btrim(g->>'name'),'') IS NULL OR nullif(btrim(g->>'unit'),'') IS NULL OR coalesce(g->>'direction','') NOT IN ('at_least','at_most') OR jsonb_typeof(g->'target') IS DISTINCT FROM 'number' OR jsonb_typeof(g->'actual') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Complete every agreed KPI name, unit, direction, target and actual'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_okr_client_observation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_okr_client_observation BEFORE INSERT OR UPDATE ON public.okr_client_observations FOR EACH ROW EXECUTE FUNCTION public.validate_okr_client_observation();
COMMENT ON TABLE public.okr_client_observations IS 'Client/month evidence below the shared Media Buying KR. No automatic KR approval, department score or bonus calculation. Previous revisions are retained; deletion is not exposed.';
