import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ClipboardList, Compass, DollarSign, FileText, Target, Trophy } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { today, parseLocal } from '../lib/dates'
import { formatSurveyMonth, previousSurveyMonth } from '../lib/monthlySurvey'
import { formatOkrLabel } from '../lib/dashboardOkrs'
import { isCreativeStrategist } from '../lib/creativeStrategyRoles'
import DashboardOKRs from '../components/DashboardOKRs'
import PlanDashboard from '../components/PlanDashboard'
import SpendDashboard from '../components/SpendDashboard'
import SpendLeaderboard from '../components/SpendLeaderboard'
import WeeklyHealthPrompt from '../components/WeeklyHealthPrompt'
import './Dashboard.css'

function getGreeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
}

function MonthlySurveyBanner({ submission, surveyMonth }) {
  if (submission?.status === 'submitted') return null
  const hasDraft = submission?.status === 'draft'
  return (
    <Link to="/monthly-survey" className="card home-survey-banner">
      <span className="home-survey-icon"><CalendarDays size={20}/></span>
      <span className="home-survey-copy">
        <strong>{formatSurveyMonth(surveyMonth)} team survey {hasDraft ? 'draft' : 'due'}</strong>
        <span>{hasDraft ? 'Finish and submit your saved reflection.' : 'Review last month and share your feedback with Operations.'}</span>
      </span>
      <span className="home-survey-action">{hasDraft ? 'Continue' : 'Start survey'} <ArrowRight size={14}/></span>
    </Link>
  )
}

function QuickLinks() {
  const links = [
    { to: '/100-day-plan', label: '100-Day Plan', icon: Compass },
    { to: '/okrs', label: 'OKRs & Key Results', icon: Target },
    { to: '/spend', label: 'Spend Tracker', icon: DollarSign },
    { to: '/monthly-survey', label: 'Monthly Survey', icon: ClipboardList },
    { to: '/changelog', label: 'Change Log', icon: FileText },
    { to: '/rewards', label: 'Rewards & Badges', icon: Trophy },
  ]
  return (
    <nav className="home-quick-links" aria-label="Quick links">
      <h2>Quick links</h2>
      <div>{links.map(link => {
        const Icon = link.icon
        return <Link key={link.to} to={link.to}><Icon size={15}/><span>{link.label}</span><ArrowRight size={12}/></Link>
      })}</div>
    </nav>
  )
}

export default function Dashboard() {
  const { profile, isManagement, isOps } = useAuth()
  const [surveyState, setSurveyState] = useState({ loading: true, submission: null, error: false })
  const surveyMonth = previousSurveyMonth()

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    // Previous calendar month becomes due on the first. A failed request is not
    // treated as a missing submission, so it cannot create a false overdue alert.
    async function loadSurvey() {
      try {
        const { data, error } = await supabase.from('monthly_survey_submissions')
          .select('id,status,submitted_at').eq('user_id', profile.id)
          .eq('survey_month', surveyMonth).maybeSingle()
        if (!cancelled) setSurveyState({ loading: false, submission: data || null, error: Boolean(error) })
      } catch {
        if (!cancelled) setSurveyState({ loading: false, submission: null, error: true })
      }
    }
    loadSurvey()
    return () => { cancelled = true }
  }, [profile?.id, surveyMonth])

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">{getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'}.</h1>
        <p className="page-subtitle">
          {parseLocal(today()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {profile?.position && <> · <span className="text-accent">{formatOkrLabel(profile.position)}</span></>}
        </p>
      </header>
      <div className="page-body home-dashboard">
        {!surveyState.loading && !surveyState.error && <MonthlySurveyBanner submission={surveyState.submission} surveyMonth={surveyMonth}/>}
        {surveyState.error && <div className="home-survey-unavailable">Survey status unavailable. <Link to="/monthly-survey">Open Monthly Survey</Link></div>}
        <QuickLinks/>
        <WeeklyHealthPrompt/>
        <PlanDashboard/>
        {(isManagement || isOps || isCreativeStrategist(profile)) && <SpendLeaderboard compact />}
        <SpendDashboard/>
        <DashboardOKRs/>
      </div>
    </>
  )
}
