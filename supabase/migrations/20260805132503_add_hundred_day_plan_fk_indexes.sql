-- Cover nullable foreign keys used by the normalized next-cycle model.

create index if not exists hundred_day_plan_checkpoints_flag_to_profile_idx
  on public.hundred_day_plan_checkpoints (flag_to_profile_id)
  where flag_to_profile_id is not null;

create index if not exists hundred_day_plan_cycles_manager_idx
  on public.hundred_day_plan_cycles (manager_id)
  where manager_id is not null;

create index if not exists hundred_day_plan_cycles_legacy_source_idx
  on public.hundred_day_plan_cycles (source_legacy_plan_id)
  where source_legacy_plan_id is not null;

create index if not exists hundred_day_plan_dependencies_counterparty_profile_idx
  on public.hundred_day_plan_dependencies (counterparty_profile_id)
  where counterparty_profile_id is not null;

create index if not exists hundred_day_plan_dependencies_goal_idx
  on public.hundred_day_plan_dependencies (goal_id)
  where goal_id is not null;

create index if not exists hundred_day_plan_dependencies_milestone_idx
  on public.hundred_day_plan_dependencies (milestone_id)
  where milestone_id is not null;

create index if not exists hundred_day_plan_goals_anchored_objective_idx
  on public.hundred_day_plan_goals (anchored_objective_id)
  where anchored_objective_id is not null;

create index if not exists hundred_day_plan_milestones_dependency_owner_idx
  on public.hundred_day_plan_milestones (dependency_owner_id)
  where dependency_owner_id is not null;
