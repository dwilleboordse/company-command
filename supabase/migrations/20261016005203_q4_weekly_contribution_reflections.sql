-- Recorded hosted migration 20261016005203; additive, no history backfill.
ALTER TABLE public.hundred_day_plan_cycle_pulses ADD COLUMN IF NOT EXISTS contribution_updates jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS reflection_plan_revision integer;
ALTER TABLE public.hundred_day_plan_cycle_pulses ADD CONSTRAINT q4_reflection_array_size CHECK (jsonb_typeof(contribution_updates) = 'array' AND jsonb_array_length(contribution_updates) <= 2);
COMMENT ON COLUMN public.hundred_day_plan_cycle_pulses.contribution_updates IS 'One reflection per stable contribution ID. Empty on earlier overall check-ins; never inferred or backfilled.';
CREATE OR REPLACE FUNCTION public.q4_prepare_contribution_reflections()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE plan public.hundred_day_plan_cycles; contribution jsonb; response jsonb; normalized jsonb := '[]'::jsonb; used_ids text[] := ARRAY[]::text[]; cid text; field_name text; kr_title text; ordinal integer := 0; n integer;
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.locked_at IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO plan FROM public.hundred_day_plan_cycles WHERE id = NEW.cycle_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Plan not accessible'; END IF;
 IF plan.planning_period IS DISTINCT FROM 'Q4-2026' THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.contribution_updates) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Contribution reflections must be a list'; END IF;
 n := jsonb_array_length(NEW.contribution_updates);
 IF n = 0 AND NEW.reflection_plan_revision IS NULL THEN RETURN NEW; END IF;
 IF NEW.reflection_plan_revision IS DISTINCT FROM plan.revision THEN RAISE EXCEPTION 'Your contribution plan changed. Copy your notes, refresh, then submit against the current plan.'; END IF;
 IF n NOT BETWEEN 1 AND 2 OR n <> jsonb_array_length(plan.contributions) THEN RAISE EXCEPTION 'Add one reflection for every saved contribution'; END IF;
 FOR contribution IN SELECT value FROM jsonb_array_elements(plan.contributions) LOOP
  ordinal := ordinal + 1; cid := contribution->>'id';
  IF nullif(cid, '') IS NULL OR cid = ANY(used_ids) THEN RAISE EXCEPTION 'The plan needs unique contribution IDs before weekly reflections can be saved'; END IF;
  used_ids := array_append(used_ids, cid);
  IF (SELECT count(*) FROM jsonb_array_elements(NEW.contribution_updates) r WHERE r->>'contribution_id' = cid) <> 1 THEN RAISE EXCEPTION 'Each saved contribution needs its own reflection; unknown or duplicate contributions are not allowed'; END IF;
  SELECT value INTO response FROM jsonb_array_elements(NEW.contribution_updates) WHERE value->>'contribution_id' = cid;
  IF jsonb_typeof(response) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid reflection'; END IF;
  FOREACH field_name IN ARRAY ARRAY['reflection','metric_now','next_commitment'] LOOP
   IF jsonb_typeof(response->field_name) IS DISTINCT FROM 'string' OR nullif(btrim(response->>field_name),'') IS NULL THEN RAISE EXCEPTION 'Contribution % needs a reflection, current result/evidence or Not measured, and next commitment', ordinal; END IF;
  END LOOP;
  FOREACH field_name IN ARRAY ARRAY['reflection','metric_now','blocker','next_commitment'] LOOP
   IF response ? field_name AND (jsonb_typeof(response->field_name) IS DISTINCT FROM 'string' OR length(response->>field_name)>20000) THEN RAISE EXCEPTION 'Each reflection field must be text under 20,000 characters'; END IF;
  END LOOP;
  IF coalesce(response->>'track_status','') NOT IN ('on_track','at_risk','off_track') THEN RAISE EXCEPTION 'Choose an execution status for each contribution'; END IF;
  kr_title := NULL;
  SELECT k.title INTO kr_title FROM public.key_results k WHERE k.id::text = contribution->>'key_result_id' AND k.objective_id = plan.department_objective_id;
  normalized := normalized || jsonb_build_array(jsonb_build_object('contribution_id',cid,'contribution_title',contribution->>'title','key_result_id',contribution->>'key_result_id','key_result_title',kr_title,'reflection',btrim(response->>'reflection'),'metric_now',btrim(response->>'metric_now'),'track_status',response->>'track_status','blocker',btrim(coalesce(response->>'blocker','')),'next_commitment',btrim(response->>'next_commitment')));
 END LOOP;
 NEW.contribution_updates := normalized;
 SELECT string_agg(format('Contribution %s: %s',i,r->>'contribution_title'),E'\n' ORDER BY i), string_agg(format('Contribution %s - %s:%s%s',i,r->>'contribution_title',E'\n',r->>'reflection'),E'\n\n' ORDER BY i), string_agg(format('Contribution %s - %s:%s%s',i,r->>'contribution_title',E'\n',r->>'metric_now'),E'\n\n' ORDER BY i), string_agg(format('Contribution %s - %s:%s%s',i,r->>'contribution_title',E'\n',r->>'next_commitment'),E'\n\n' ORDER BY i), string_agg(format('Contribution %s - %s:%s%s',i,r->>'contribution_title',E'\n',r->>'blocker'),E'\n\n' ORDER BY i) FILTER (WHERE r->>'blocker'<>'') INTO NEW.milestone,NEW.progress_note,NEW.metric_now,NEW.next_commitment,NEW.blocker FROM jsonb_array_elements(normalized) WITH ORDINALITY AS t(r,i);
 NEW.blocker := coalesce(NEW.blocker,'');
 NEW.track_status := CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(normalized) r WHERE r->>'track_status'='off_track') THEN 'off_track' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(normalized) r WHERE r->>'track_status'='at_risk') THEN 'at_risk' ELSE 'on_track' END;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.q4_prepare_contribution_reflections() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER q4_00_contribution_reflections BEFORE INSERT OR UPDATE ON public.hundred_day_plan_cycle_pulses FOR EACH ROW EXECUTE FUNCTION public.q4_prepare_contribution_reflections();
