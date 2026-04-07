-- ============================================================
-- DOUBLE U MEDIA — COMPANY COMMAND CENTER
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- PROFILES (extends auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text not null,
  role text not null default 'athlete' check (role in ('ceo', 'management', 'athlete')),
  department text,
  position text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- KPI DEFINITIONS
create table if not exists kpis (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  role_type text not null,
  metric_name text not null,
  goal_value numeric,
  goal_direction text default 'max' check (goal_direction in ('min', 'max', 'exact')),
  unit text default '%',
  current_value numeric default 0,
  visibility text default 'team' check (visibility in ('ceo', 'management', 'team')),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- KPI HISTORY (weekly entries for trend charts)
create table if not exists kpi_entries (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid references kpis(id) on delete cascade,
  value numeric not null,
  week_start date not null,
  entered_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- USER <> KPI ASSIGNMENTS
create table if not exists user_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  kpi_id uuid references kpis(id) on delete cascade,
  unique(user_id, kpi_id)
);

-- MILESTONES
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  role_type text not null,
  system_name text not null,
  milestone_name text not null,
  steps jsonb default '[]',
  status text default 'not_started' check (status in ('not_started', 'started', 'half', 'three_quarters', 'completed')),
  owner_id uuid references profiles(id),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- WEEK OUTCOMES
create table if not exists week_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  week_start date not null,
  outcomes text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, week_start)
);

-- DAY ENTRIES
create table if not exists day_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  entry_date date not null,
  goals text,
  plan text,
  workload text,
  day_outcome text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, entry_date)
);

-- MEETING PREPS
create table if not exists meeting_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  meeting_type text not null check (meeting_type in ('week_start', 'day_start', 'general_assembly')),
  meeting_date date not null,
  dashboard_notes text,
  milestone_notes text,
  week_outcome_notes text,
  general_notes text,
  is_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, meeting_type, meeting_date)
);

-- MEETING RECAPS
create table if not exists meeting_recaps (
  id uuid primary key default gen_random_uuid(),
  meeting_type text not null,
  meeting_date date not null,
  team text,
  notes text,
  decisions text,
  blockers text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique(meeting_type, meeting_date, team)
);

-- CEO MODELS (growth / business / financial) — CEO only
create table if not exists ceo_models (
  id uuid primary key default gen_random_uuid(),
  model_type text not null check (model_type in ('growth', 'business', 'financial')),
  metric_name text not null,
  goal_value numeric,
  current_value numeric default 0,
  unit text default '%',
  goal_direction text default 'max' check (goal_direction in ('min', 'max', 'exact')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CEO MODEL HISTORY
create table if not exists ceo_model_entries (
  id uuid primary key default gen_random_uuid(),
  model_id uuid references ceo_models(id) on delete cascade,
  value numeric not null,
  week_start date not null,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table kpis enable row level security;
alter table kpi_entries enable row level security;
alter table user_kpis enable row level security;
alter table milestones enable row level security;
alter table week_outcomes enable row level security;
alter table day_entries enable row level security;
alter table meeting_preps enable row level security;
alter table meeting_recaps enable row level security;
alter table ceo_models enable row level security;
alter table ceo_model_entries enable row level security;

-- Helper function: get current user role
create or replace function get_my_role()
returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer;

-- PROFILES policies
create policy "Users can read own profile" on profiles for select using (auth.uid() = id);
create policy "CEO/Management can read all profiles" on profiles for select using (get_my_role() in ('ceo', 'management'));
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "CEO can insert profiles" on profiles for insert with check (get_my_role() = 'ceo');
create policy "CEO can delete profiles" on profiles for delete using (get_my_role() = 'ceo');

-- KPIS policies
create policy "Athletes see team kpis" on kpis for select using (visibility in ('team') or get_my_role() in ('ceo', 'management'));
create policy "CEO/Management can manage kpis" on kpis for all using (get_my_role() in ('ceo', 'management'));

-- KPI ENTRIES policies
create policy "Anyone can read kpi entries" on kpi_entries for select using (true);
create policy "CEO/Management can insert kpi entries" on kpi_entries for insert with check (get_my_role() in ('ceo', 'management'));

-- USER KPIS policies
create policy "Users see own assignments" on user_kpis for select using (user_id = auth.uid() or get_my_role() in ('ceo', 'management'));
create policy "CEO can manage assignments" on user_kpis for all using (get_my_role() = 'ceo');

-- MILESTONES policies
create policy "All can read milestones" on milestones for select using (true);
create policy "CEO/Management can manage milestones" on milestones for all using (get_my_role() in ('ceo', 'management'));
create policy "Owners can update status" on milestones for update using (owner_id = auth.uid());

-- WEEK OUTCOMES policies
create policy "Users see own week outcomes" on week_outcomes for select using (user_id = auth.uid() or get_my_role() in ('ceo', 'management'));
create policy "Users can manage own week outcomes" on week_outcomes for all using (user_id = auth.uid());
create policy "Management can read all" on week_outcomes for select using (get_my_role() in ('ceo', 'management'));

-- DAY ENTRIES policies
create policy "Users see own day entries" on day_entries for select using (user_id = auth.uid() or get_my_role() in ('ceo', 'management'));
create policy "Users can manage own day entries" on day_entries for all using (user_id = auth.uid());

-- MEETING PREPS policies
create policy "Users see own preps" on meeting_preps for select using (user_id = auth.uid() or get_my_role() in ('ceo', 'management'));
create policy "Users manage own preps" on meeting_preps for all using (user_id = auth.uid());

-- MEETING RECAPS policies
create policy "All can read recaps" on meeting_recaps for select using (true);
create policy "CEO/Management can manage recaps" on meeting_recaps for all using (get_my_role() in ('ceo', 'management'));

-- CEO MODELS — CEO only
create policy "CEO only" on ceo_models for all using (get_my_role() = 'ceo');
create policy "CEO only entries" on ceo_model_entries for all using (get_my_role() = 'ceo');

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'athlete')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- SEED: KPI DATA (pre-loaded from Miro board)
-- ============================================================

insert into kpis (department, role_type, metric_name, goal_value, goal_direction, unit, current_value, visibility) values

-- COMPANY WIDE
('company', 'company_wide', 'Monthly Client Churn Rate', 10, 'min', '%', 10, 'management'),
('company', 'company_wide', 'Creative Hit Rate', 25, 'max', '%', 10, 'management'),
('company', 'company_wide', '% Initiatives Requiring Founder Involvement', 30, 'min', '%', 20, 'management'),
('company', 'company_wide', 'New ICP Clients per Month', 3, 'max', '#', 2, 'management'),

-- MARKETING
('marketing', 'marketing', 'Qualified Inbound Leads / Week', 4, 'max', '#', 2, 'team'),
('marketing', 'marketing', 'Clients Closed', 2, 'max', '#', 2, 'team'),
('marketing', 'marketing', 'Pipeline Coverage (4x target)', 40000, 'max', '$', 20000, 'team'),

-- DELIVERY - MEDIA BUYER
('delivery', 'media_buyer', 'WoW Spend Growth (on-target accounts)', 4, 'max', '#', 2, 'team'),
('delivery', 'media_buyer', 'Scalable Winners / Account / Week', 4, 'max', '#', 2, 'team'),

-- DELIVERY - CREATIVE STRATEGIST
('delivery', 'creative_strategist', 'Creative Tests / Account / Week', 5, 'max', '#', 3, 'team'),
('delivery', 'creative_strategist', 'Creative Spend Share DDU Ads', 25, 'max', '%', 20, 'team'),
('delivery', 'creative_strategist', 'First/Second-Pass Approval Rate', 90, 'max', '%', 60, 'team'),
('delivery', 'creative_strategist', 'Briefs Executed per Week', 20, 'max', '#', 15, 'team'),

-- DELIVERY - EDITORS
('delivery', 'editor', 'First Pass Approval Rate', 90, 'max', '%', 80, 'team'),
('delivery', 'editor', 'Rework Rate', 5, 'min', '%', 8, 'team'),
('delivery', 'editor', 'On-Time Delivery Rate', 95, 'max', '%', 90, 'team'),
('delivery', 'editor', 'Contribution to Winning Ads / Week', 1, 'max', '#', 1, 'team'),
('delivery', 'editor', 'Average Completed Tasks / Day', 4, 'max', '#', 3, 'team'),

-- DELIVERY - DESIGNERS
('delivery', 'designer', 'First Pass Approval Rate', 90, 'max', '%', 80, 'team'),
('delivery', 'designer', 'Rework Rate', 5, 'min', '%', 8, 'team'),
('delivery', 'designer', 'On-Time Delivery Rate', 95, 'max', '%', 90, 'team'),
('delivery', 'designer', 'Contribution to Winning Ads / Month', 3, 'max', '#', 3, 'team'),
('delivery', 'designer', 'Average Completed Tasks / Day', 6, 'max', '#', 3, 'team'),

-- DELIVERY - UGC MANAGER
('delivery', 'ugc_manager', 'UGC Packages Delivered Within 30 Days', 100, 'max', '%', 90, 'team'),
('delivery', 'ugc_manager', 'Creator Replacement Incidents', 5, 'min', '%', 10, 'team'),
('delivery', 'ugc_manager', 'UGC Revision Rate', 5, 'min', '%', 10, 'team'),
('delivery', 'ugc_manager', 'UGC-Related Client Complaints', 0, 'min', '#', 2, 'team'),

-- DELIVERY - EMAIL MARKETER
('delivery', 'email_marketer', '% Campaigns Delivered on Time', 95, 'max', '%', 90, 'team'),
('delivery', 'email_marketer', 'Email Contribution to Total Revenue', 20, 'max', '%', 10, 'team'),
('delivery', 'email_marketer', '1-2 Round Approval Rate', 95, 'max', '%', 90, 'team'),

-- OPERATIONS - OPERATIONS MANAGER
('operations', 'ops_manager', 'Client Churn Rate', 5, 'min', '%', 15, 'team'),
('operations', 'ops_manager', 'On-Time Delivery Rate', 90, 'max', '%', 80, 'team'),
('operations', 'ops_manager', 'Founder Escalations / Week', 5, 'min', '#', 7, 'team'),
('operations', 'ops_manager', 'Initiatives Moved per Week', 2, 'max', '#', 1, 'team'),

-- OPERATIONS - OPERATIONS ASSISTANT
('operations', 'ops_assistant', 'Missed Follow-Ups', 0, 'min', '#', 2, 'team'),
('operations', 'ops_assistant', '% Initiatives with Updated Status', 25, 'max', '%', 10, 'team'),
('operations', 'ops_assistant', '% Meetings with Prep Completed', 100, 'max', '%', 95, 'team'),

-- OPERATIONS - HR MANAGER
('operations', 'hr_manager', 'HR Compliance & Documentation Integrity', 100, 'max', '%', 95, 'team'),
('operations', 'hr_manager', 'Ritual & Performance System Execution Rate', 95, 'max', '%', 90, 'team'),
('operations', 'hr_manager', 'Accountability Enforcement Score', 100, 'max', '%', 95, 'team'),
('operations', 'hr_manager', 'Average Team Tenure (Months)', 12, 'max', 'mo', 10, 'team'),
('operations', 'hr_manager', 'Formal Team Member Complaints', 1, 'min', '#', 0, 'team'),

-- MANAGEMENT (management visibility only)
('management', 'management', 'Net Profit Margin', 20, 'max', '%', 10, 'ceo'),
('management', 'management', 'Client Retention Rate', 90, 'max', '%', 50, 'management'),
('management', 'management', 'Creative Quality Index', 90, 'max', '%', 50, 'management'),
('management', 'management', 'Founder Operational Involvement', 5, 'min', '%', 10, 'management'),
('management', 'management', 'OKR Initiative Movement Rate', 80, 'max', '%', 75, 'management');

-- ============================================================
-- SEED: MILESTONES
-- ============================================================

insert into milestones (department, role_type, system_name, milestone_name, steps, status) values

-- MARKETING
('marketing', 'marketing', 'Qualified Pipeline Engine', 'Define qualification checklist', '["Define ICP fit, budget, decision maker, timeline, next step"]', 'not_started'),
('marketing', 'marketing', 'Qualified Pipeline Engine', 'Add automatic pipeline coverage calculation', '[]', 'not_started'),
('marketing', 'marketing', 'Qualified Pipeline Engine', 'Clean current pipeline (remove unqualified deals)', '[]', 'not_started'),
('marketing', 'marketing', 'Qualified Pipeline Engine', 'Define minimum required pipeline target', '[]', 'not_started'),

('marketing', 'marketing', 'Inbound Volume Upgrade', 'Optimize landing page for clarity', '[]', 'not_started'),
('marketing', 'marketing', 'Inbound Volume Upgrade', 'Optimize ads (script, record, launch)', '["Script ads", "Record ads", "Launch new ads"]', 'not_started'),
('marketing', 'marketing', 'Inbound Volume Upgrade', 'Organic content calendar review and build', '["Topics for raw videos", "Record raw videos", "YouTube ideas", "Record YouTube"]', 'not_started'),
('marketing', 'marketing', 'Inbound Volume Upgrade', 'Strategy inbound organic', '["ManyChat setup IG", "Record raw videos"]', 'not_started'),

('marketing', 'marketing', 'Sales Conversion Optimization', 'Document sales process stages', '["1 Call Close vs 2 Call Close", "Pre-call info optimize"]', 'not_started'),
('marketing', 'marketing', 'Sales Conversion Optimization', 'Create discovery call checklist', '[]', 'not_started'),
('marketing', 'marketing', 'Sales Conversion Optimization', 'Improve proposal template', '["Deck on call optimize", "Deck after call optimize"]', 'not_started'),
('marketing', 'marketing', 'Sales Conversion Optimization', 'Review 5 recent sales calls and log insights', '[]', 'not_started'),

-- MEDIA BUYER
('delivery', 'media_buyer', 'On-Target Scaling System', 'Define clear on-target account criteria', '["CPA/ROAS band", "Creative stability", "Budget headroom"]', 'not_started'),
('delivery', 'media_buyer', 'On-Target Scaling System', 'Create weekly scaling plan per on-target account', '[]', 'not_started'),
('delivery', 'media_buyer', 'On-Target Scaling System', 'Creative insights to CS sent every week', '[]', 'not_started'),
('delivery', 'media_buyer', 'On-Target Scaling System', 'Weekly blocker report', '[]', 'not_started'),

('delivery', 'media_buyer', 'Scalable Winner Production Engine', 'Define scalable winner criteria', '["Minimum spend + performance window"]', 'not_started'),
('delivery', 'media_buyer', 'Scalable Winner Production Engine', 'Log weekly creative signals per account', '[]', 'not_started'),
('delivery', 'media_buyer', 'Scalable Winner Production Engine', 'Maintain weekly changelog', '[]', 'not_started'),
('delivery', 'media_buyer', 'Scalable Winner Production Engine', 'Run weekly winner review session', '[]', 'not_started'),

-- CREATIVE STRATEGIST
('delivery', 'creative_strategist', 'Creative Volume Control System', 'Define weekly test plan per account', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Creative Volume Control System', 'Create weekly scaling plan per on-target account', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Creative Volume Control System', 'Tests logged in creative roadmap', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Creative Volume Control System', 'Weekly blocker report', '[]', 'not_started'),

('delivery', 'creative_strategist', 'Approval Rate Optimization System', 'Build standardized brief template', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Approval Rate Optimization System', 'Create creative QA checklist before submission', '["Tag rejection cause"]', 'not_started'),
('delivery', 'creative_strategist', 'Approval Rate Optimization System', 'Implement rework log', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Approval Rate Optimization System', 'Run weekly 30-min rejection review', '[]', 'not_started'),

('delivery', 'creative_strategist', 'Creative Spend Dominance System', 'Every week learnings logged into sheets', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Creative Spend Dominance System', 'Identify top 3 winning angles per account', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Creative Spend Dominance System', 'Create winner iteration/expansion system', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Creative Spend Dominance System', 'Run weekly scale-ready creative review with media buyers', '[]', 'not_started'),

('delivery', 'creative_strategist', 'Creative Mastery Upgrade System', 'Weekly pattern review session', '["Internal", "Competitor", "Industry"]', 'not_started'),
('delivery', 'creative_strategist', 'Creative Mastery Upgrade System', 'Failure analysis session (review 3 failed creatives)', '[]', 'not_started'),
('delivery', 'creative_strategist', 'Creative Mastery Upgrade System', 'Track hit rate trend month over month', '[]', 'not_started'),

-- EDITORS
('delivery', 'editor', 'Input Clarity Enforcement System', 'Implement No Brief No Build rule', '[]', 'not_started'),
('delivery', 'editor', 'Input Clarity Enforcement System', 'Install brief quality check before acceptance', '[]', 'not_started'),
('delivery', 'editor', 'Input Clarity Enforcement System', 'Build brief issue tracker', '[]', 'not_started'),

('delivery', 'editor', 'First Pass Perfection System', 'Create internal QA checklist before submission', '[]', 'not_started'),
('delivery', 'editor', 'First Pass Perfection System', 'Implement self-review rule before submission', '[]', 'not_started'),
('delivery', 'editor', 'First Pass Perfection System', 'Create rejection tag system', '[]', 'not_started'),
('delivery', 'editor', 'First Pass Perfection System', 'Run weekly 20-min rework review', '[]', 'not_started'),

('delivery', 'editor', 'Rework Minimization System', 'Identify top 3 rework causes', '[]', 'not_started'),
('delivery', 'editor', 'Rework Minimization System', 'Install fix for top rework cause', '[]', 'not_started'),
('delivery', 'editor', 'Rework Minimization System', 'Set max 2 revision limit before escalation', '[]', 'not_started'),
('delivery', 'editor', 'Rework Minimization System', 'Log avoidable rework weekly', '[]', 'not_started'),

('delivery', 'editor', 'Delivery Reliability Engine', 'Daily minimums of tasks quota', '[]', 'not_started'),
('delivery', 'editor', 'Delivery Reliability Engine', 'Run end-of-day status check', '[]', 'not_started'),

('delivery', 'editor', 'Winner Contribution Multiplier', 'Monthly winner review session', '[]', 'not_started'),
('delivery', 'editor', 'Winner Contribution Multiplier', 'Break down 2 winners per week', '[]', 'not_started'),
('delivery', 'editor', 'Winner Contribution Multiplier', 'Build internal winner style library', '[]', 'not_started'),
('delivery', 'editor', 'Winner Contribution Multiplier', 'Weekly syncs with CS on winners/losers', '[]', 'not_started'),

-- DESIGNERS (same systems as editors)
('delivery', 'designer', 'Input Clarity Enforcement System', 'Implement No Brief No Build rule', '[]', 'not_started'),
('delivery', 'designer', 'Input Clarity Enforcement System', 'Install brief quality check before acceptance', '[]', 'not_started'),
('delivery', 'designer', 'Input Clarity Enforcement System', 'Build brief issue tracker', '[]', 'not_started'),

('delivery', 'designer', 'First Pass Perfection System', 'Create internal QA checklist before submission', '[]', 'not_started'),
('delivery', 'designer', 'First Pass Perfection System', 'Implement self-review rule before submission', '[]', 'not_started'),
('delivery', 'designer', 'First Pass Perfection System', 'Create rejection tag system', '[]', 'not_started'),
('delivery', 'designer', 'First Pass Perfection System', 'Run weekly 20-min rework review', '[]', 'not_started'),

('delivery', 'designer', 'Rework Minimization System', 'Identify top 3 rework causes', '[]', 'not_started'),
('delivery', 'designer', 'Rework Minimization System', 'Install fix for top rework cause', '[]', 'not_started'),
('delivery', 'designer', 'Rework Minimization System', 'Set max 2 revision limit before escalation', '[]', 'not_started'),
('delivery', 'designer', 'Rework Minimization System', 'Log avoidable rework weekly', '[]', 'not_started'),

('delivery', 'designer', 'Delivery Reliability Engine', 'Daily minimums of tasks quota', '[]', 'not_started'),
('delivery', 'designer', 'Delivery Reliability Engine', 'Run end-of-day status check', '[]', 'not_started'),

('delivery', 'designer', 'Winner Contribution Multiplier', 'Monthly winner review session', '[]', 'not_started'),
('delivery', 'designer', 'Winner Contribution Multiplier', 'Break down 2 winners per week', '[]', 'not_started'),
('delivery', 'designer', 'Winner Contribution Multiplier', 'Build internal winner style library', '[]', 'not_started'),
('delivery', 'designer', 'Winner Contribution Multiplier', 'Weekly syncs with CS on winners/losers', '[]', 'not_started'),

-- UGC MANAGER
('delivery', 'ugc_manager', '30-Day Delivery Control System', 'Define standard 30-day timeline blueprint', '[]', 'not_started'),
('delivery', 'ugc_manager', '30-Day Delivery Control System', 'Build UGC package tracker board', '[]', 'not_started'),
('delivery', 'ugc_manager', '30-Day Delivery Control System', 'Install 3 checkpoint rule', '[]', 'not_started'),
('delivery', 'ugc_manager', '30-Day Delivery Control System', 'Install escalation rule if package slips 48h', '[]', 'not_started'),

('delivery', 'ugc_manager', 'Creator Stability System', 'Build approved creator bench (min 3 backups per niche)', '["List all creators", "Rank by performance"]', 'not_started'),
('delivery', 'ugc_manager', 'Creator Stability System', 'Install backup rule (every creator has a backup)', '[]', 'not_started'),
('delivery', 'ugc_manager', 'Creator Stability System', 'Create creator performance tracker', '[]', 'not_started'),
('delivery', 'ugc_manager', 'Creator Stability System', 'Run weekly 20-min rework review', '[]', 'not_started'),

('delivery', 'ugc_manager', 'Revision Rate Minimization System', 'Standardize/optimize creator script template', '[]', 'not_started'),
('delivery', 'ugc_manager', 'Revision Rate Minimization System', 'Install pre-record check', '[]', 'not_started'),
('delivery', 'ugc_manager', 'Revision Rate Minimization System', 'Track revision cause', '[]', 'not_started'),
('delivery', 'ugc_manager', 'Revision Rate Minimization System', 'Run weekly revision review', '[]', 'not_started'),

('delivery', 'ugc_manager', 'Client Expectation Alignment System', 'Create UGC expectation one-pager for clients', '[]', 'not_started'),
('delivery', 'ugc_manager', 'Client Expectation Alignment System', 'Build UGC feedback template for clients', '[]', 'not_started'),
('delivery', 'ugc_manager', 'Client Expectation Alignment System', 'Log every complaint and root cause', '[]', 'not_started'),

-- EMAIL MARKETER
('delivery', 'email_marketer', 'Campaign Delivery Discipline System', 'Build weekly email production board', '[]', 'not_started'),
('delivery', 'email_marketer', 'Campaign Delivery Discipline System', 'Define priority tiers (revenue critical vs supportive)', '[]', 'not_started'),
('delivery', 'email_marketer', 'Campaign Delivery Discipline System', 'Implement daily campaign status check', '[]', 'not_started'),

('delivery', 'email_marketer', 'Revenue Contribution Expansion System', 'Audit current flow coverage', '[]', 'not_started'),
('delivery', 'email_marketer', 'Revenue Contribution Expansion System', 'Identify missing high-leverage flows', '[]', 'not_started'),
('delivery', 'email_marketer', 'Revenue Contribution Expansion System', 'Implement 1 new revenue flow per month', '[]', 'not_started'),
('delivery', 'email_marketer', 'Revenue Contribution Expansion System', 'Install email performance dashboard', '[]', 'not_started'),
('delivery', 'email_marketer', 'Revenue Contribution Expansion System', 'Run weekly revenue review', '[]', 'not_started'),

('delivery', 'email_marketer', 'Approval Rate Optimization System', 'Implement pre-submission QA check', '[]', 'not_started'),
('delivery', 'email_marketer', 'Approval Rate Optimization System', 'Track rejection cause', '[]', 'not_started'),
('delivery', 'email_marketer', 'Approval Rate Optimization System', 'Run weekly rejection review', '[]', 'not_started'),
('delivery', 'email_marketer', 'Approval Rate Optimization System', 'Run weekly revision review', '[]', 'not_started'),

('delivery', 'email_marketer', 'Performance Iteration Loop', 'Track top 3 performing emails each week', '[]', 'not_started'),
('delivery', 'email_marketer', 'Performance Iteration Loop', 'Require 1 iteration of top email format per week', '[]', 'not_started'),
('delivery', 'email_marketer', 'Performance Iteration Loop', 'Build email winner library', '[]', 'not_started'),

-- OPERATIONS MANAGER
('operations', 'ops_manager', 'Client Retention Control System', 'Implement weekly client health score (Green/Yellow/Red)', '[]', 'not_started'),
('operations', 'ops_manager', 'Client Retention Control System', 'Define clear red account criteria', '[]', 'not_started'),
('operations', 'ops_manager', 'Client Retention Control System', 'Require action plan for every yellow/red account', '[]', 'not_started'),
('operations', 'ops_manager', 'Client Retention Control System', 'Install 5-day max resolution rule', '[]', 'not_started'),
('operations', 'ops_manager', 'Client Retention Control System', 'Track churn root causes (category tagging)', '[]', 'not_started'),
('operations', 'ops_manager', 'Client Retention Control System', 'Run weekly retention review', '[]', 'not_started'),

('operations', 'ops_manager', 'Delivery Reliability Engine', 'Define what on-time means (SLA per task type)', '[]', 'not_started'),
('operations', 'ops_manager', 'Delivery Reliability Engine', 'Install daily overdue check', '[]', 'not_started'),
('operations', 'ops_manager', 'Delivery Reliability Engine', 'Define blocker escalation rule (24h)', '[]', 'not_started'),
('operations', 'ops_manager', 'Delivery Reliability Engine', 'Run weekly delivery review (30 min max)', '[]', 'not_started'),
('operations', 'ops_manager', 'Delivery Reliability Engine', 'Identify top 3 causes of missed deadlines', '[]', 'not_started'),
('operations', 'ops_manager', 'Delivery Reliability Engine', 'Install fix for top cause', '[]', 'not_started'),

('operations', 'ops_manager', 'Founder Dependency Reduction System', 'Log every founder escalation', '[]', 'not_started'),
('operations', 'ops_manager', 'Founder Dependency Reduction System', 'Tag escalation type', '[]', 'not_started'),
('operations', 'ops_manager', 'Founder Dependency Reduction System', 'Install decision rights document', '[]', 'not_started'),
('operations', 'ops_manager', 'Founder Dependency Reduction System', 'Create If This Then This playbook', '[]', 'not_started'),
('operations', 'ops_manager', 'Founder Dependency Reduction System', 'Remove top 2 recurring escalation causes', '[]', 'not_started'),
('operations', 'ops_manager', 'Founder Dependency Reduction System', 'Review escalation count weekly', '[]', 'not_started'),

('operations', 'ops_manager', 'Initiative Execution Accelerator', 'Define initiative moved clearly', '[]', 'not_started'),
('operations', 'ops_manager', 'Initiative Execution Accelerator', 'Build initiative pipeline board', '[]', 'not_started'),
('operations', 'ops_manager', 'Initiative Execution Accelerator', 'Limit active initiatives per team', '[]', 'not_started'),
('operations', 'ops_manager', 'Initiative Execution Accelerator', 'Install weekly initiative review', '[]', 'not_started'),
('operations', 'ops_manager', 'Initiative Execution Accelerator', 'Tag stalled initiatives (>2 weeks)', '[]', 'not_started'),
('operations', 'ops_manager', 'Initiative Execution Accelerator', 'Force owner accountability', '[]', 'not_started'),

-- OPERATIONS ASSISTANT
('operations', 'ops_assistant', 'Zero Follow-Up Failure System', 'Build master follow-up tracker', '[]', 'not_started'),
('operations', 'ops_assistant', 'Zero Follow-Up Failure System', 'Install daily follow-up check (15 min)', '[]', 'not_started'),
('operations', 'ops_assistant', 'Zero Follow-Up Failure System', 'Define follow-up SLA', '[]', 'not_started'),
('operations', 'ops_assistant', 'Zero Follow-Up Failure System', 'Implement no unassigned follow-up rule', '[]', 'not_started'),
('operations', 'ops_assistant', 'Zero Follow-Up Failure System', 'Run weekly follow-up audit', '[]', 'not_started'),

('operations', 'ops_assistant', 'Initiative Visibility Engine', 'Build initiative status view (filtered by active)', '[]', 'not_started'),
('operations', 'ops_assistant', 'Initiative Visibility Engine', 'Install Friday status enforcement check', '[]', 'not_started'),
('operations', 'ops_assistant', 'Initiative Visibility Engine', 'Tag stalled initiatives (>2 weeks no movement)', '[]', 'not_started'),
('operations', 'ops_assistant', 'Initiative Visibility Engine', 'Send weekly initiative hygiene report to Ops Manager', '[]', 'not_started'),

('operations', 'ops_assistant', 'Meeting Prep Perfection System', 'Create standard meeting prep template', '[]', 'not_started'),
('operations', 'ops_assistant', 'Meeting Prep Perfection System', 'Implement 24h prep rule (prep complete day before)', '[]', 'not_started'),
('operations', 'ops_assistant', 'Meeting Prep Perfection System', 'Install meeting checklist before start', '[]', 'not_started'),
('operations', 'ops_assistant', 'Meeting Prep Perfection System', 'Track prep failures', '[]', 'not_started'),
('operations', 'ops_assistant', 'Meeting Prep Perfection System', 'Run weekly prep quality review', '[]', 'not_started'),

('operations', 'ops_assistant', 'Execution Acceleration Support System', 'Identify top 5 active initiatives', '[]', 'not_started'),
('operations', 'ops_assistant', 'Execution Acceleration Support System', 'Break each into next micro-step', '[]', 'not_started'),
('operations', 'ops_assistant', 'Execution Acceleration Support System', 'Chase owners if no movement in 72h', '[]', 'not_started'),
('operations', 'ops_assistant', 'Execution Acceleration Support System', 'Build blocker escalation list', '[]', 'not_started'),
('operations', 'ops_assistant', 'Execution Acceleration Support System', 'Provide weekly initiative movement report', '[]', 'not_started'),

-- HR MANAGER
('operations', 'hr_manager', 'Full HR Compliance Lock-In', 'Audit 100% of active team files', '[]', 'not_started'),
('operations', 'hr_manager', 'Full HR Compliance Lock-In', 'Create HR master compliance checklist', '[]', 'not_started'),
('operations', 'hr_manager', 'Full HR Compliance Lock-In', 'Install no access before paperwork rule', '[]', 'not_started'),
('operations', 'hr_manager', 'Full HR Compliance Lock-In', 'Implement digital folder structure standard', '[]', 'not_started'),
('operations', 'hr_manager', 'Full HR Compliance Lock-In', 'Build leave tracking system', '[]', 'not_started'),
('operations', 'hr_manager', 'Full HR Compliance Lock-In', 'Document warning and PIP protocol', '[]', 'not_started'),

('operations', 'hr_manager', 'Accountability Enforcement Framework', 'Build missed deadline tracker', '[]', 'not_started'),
('operations', 'hr_manager', 'Accountability Enforcement Framework', 'Install daily follow-up block (fixed time slot)', '[]', 'not_started'),
('operations', 'hr_manager', 'Accountability Enforcement Framework', 'Create escalation ladder document', '[]', 'not_started'),
('operations', 'hr_manager', 'Accountability Enforcement Framework', 'Define repeat offense protocol', '[]', 'not_started'),
('operations', 'hr_manager', 'Accountability Enforcement Framework', 'Create accountability log', '[]', 'not_started'),

('operations', 'hr_manager', 'Hiring Pipeline Control System', 'Create master hiring pipeline tracker', '[]', 'not_started'),
('operations', 'hr_manager', 'Hiring Pipeline Control System', 'Install scorecard requirement before decision', '[]', 'not_started'),
('operations', 'hr_manager', 'Hiring Pipeline Control System', 'Define max response times per stage', '[]', 'not_started'),
('operations', 'hr_manager', 'Hiring Pipeline Control System', 'Standardize interview scheduling process', '[]', 'not_started'),
('operations', 'hr_manager', 'Hiring Pipeline Control System', 'Create new hire day 1 checklist', '[]', 'not_started'),

('operations', 'hr_manager', 'Tenure & Retention Monitoring System', 'Build tenure dashboard', '[]', 'not_started'),
('operations', 'hr_manager', 'Tenure & Retention Monitoring System', 'Track voluntary vs involuntary exits', '[]', 'not_started'),
('operations', 'hr_manager', 'Tenure & Retention Monitoring System', 'Create exit interview template', '[]', 'not_started'),
('operations', 'hr_manager', 'Tenure & Retention Monitoring System', 'Identify risk signals (low engagement, repeat warnings)', '[]', 'not_started'),
('operations', 'hr_manager', 'Tenure & Retention Monitoring System', 'Create early intervention protocol', '[]', 'not_started'),

-- MANAGEMENT
('management', 'management', 'Profit Protection Engine', 'Run full cost structure audit', '[]', 'not_started'),
('management', 'management', 'Profit Protection Engine', 'Identify top 3 margin leaks', '[]', 'not_started'),
('management', 'management', 'Profit Protection Engine', 'Remove or restructure unprofitable clients', '[]', 'not_started'),
('management', 'management', 'Profit Protection Engine', 'Implement performance-based pricing enforcement', '[]', 'not_started'),

('management', 'management', 'Retention War Room System', 'Install weekly client health review', '[]', 'not_started'),
('management', 'management', 'Retention War Room System', 'Define early warning churn signals', '[]', 'not_started'),
('management', 'management', 'Retention War Room System', 'Create client recovery playbook', '[]', 'not_started'),
('management', 'management', 'Retention War Room System', 'Track top 5 churn reasons', '[]', 'not_started'),
('management', 'management', 'Retention War Room System', 'Remove root cause of most common churn driver', '[]', 'not_started'),

('management', 'management', 'Creative Quality Control System', 'Install weekly creative hit rate review', '[]', 'not_started'),
('management', 'management', 'Creative Quality Control System', 'Build winner multiplier framework', '[]', 'not_started'),
('management', 'management', 'Creative Quality Control System', 'Install failure analysis session', '[]', 'not_started'),
('management', 'management', 'Creative Quality Control System', 'Remove low-quality briefing habits', '[]', 'not_started'),

('management', 'management', 'Founder Liberation System', 'Log all founder interruptions', '[]', 'not_started'),
('management', 'management', 'Founder Liberation System', 'Identify top 3 dependency causes', '[]', 'not_started'),
('management', 'management', 'Founder Liberation System', 'Clarify decision rights', '[]', 'not_started'),
('management', 'management', 'Founder Liberation System', 'Remove 2 recurring escalation types', '[]', 'not_started'),
('management', 'management', 'Founder Liberation System', 'Eliminate founder in daily delivery fires', '[]', 'not_started'),

('management', 'management', 'OKR Execution Accelerator', 'Limit active initiatives to high leverage only', '[]', 'not_started'),
('management', 'management', 'OKR Execution Accelerator', 'Install weekly OKR review meeting', '[]', 'not_started'),
('management', 'management', 'OKR Execution Accelerator', 'Tag stalled initiatives >2 weeks', '[]', 'not_started'),
('management', 'management', 'OKR Execution Accelerator', 'Kill low-impact projects', '[]', 'not_started'),
('management', 'management', 'OKR Execution Accelerator', 'Publish execution scoreboard company-wide', '[]', 'not_started');

-- ============================================================
-- SEED: CEO MODELS (placeholder metrics — Dennis fills these in)
-- ============================================================

insert into ceo_models (model_type, metric_name, goal_value, current_value, unit, goal_direction) values
-- GROWTH MODEL
('growth', 'Cost Per Qualified Lead', 0, 0, '$', 'min'),
('growth', 'Lead-to-Close Rate', 0, 0, '%', 'max'),
('growth', 'Sales Cycle Length (Days)', 0, 0, 'days', 'min'),
('growth', 'Cost Per Acquisition', 0, 0, '$', 'min'),
('growth', 'Inbound Lead Volume / Week', 0, 0, '#', 'max'),
('growth', 'Outbound Activity / Week', 0, 0, '#', 'max'),
-- BUSINESS MODEL
('business', 'Cost to Serve Per Client / Month', 0, 0, '$', 'min'),
('business', 'Delivery Margin', 0, 0, '%', 'max'),
('business', 'Team Cost as % of Revenue', 0, 0, '%', 'min'),
('business', 'Average Revenue Per Client', 0, 0, '$', 'max'),
('business', 'Client LTV', 0, 0, '$', 'max'),
('business', 'Utilization Rate', 0, 0, '%', 'max'),
-- FINANCIAL MODEL
('financial', 'MRR', 0, 0, '$', 'max'),
('financial', 'Net Profit Margin', 0, 0, '%', 'max'),
('financial', 'Projected Revenue (Next Quarter)', 0, 0, '$', 'max'),
('financial', 'Churn Impact on MRR', 0, 0, '$', 'min'),
('financial', 'Operating Expenses', 0, 0, '$', 'min'),
('financial', 'Cash Runway (Months)', 0, 0, 'mo', 'max');
