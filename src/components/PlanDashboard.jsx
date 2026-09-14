import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass, Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { hasBusinessDashboardAccess } from '../lib/dashboardAccess'
import { buildPlanOverview, PLAN_REVIEW_EVENT, planBlockerText, planReviewLink, planWeekStart } from '../lib/planReview'
import './PlanDashboard.css'

const PLAN_FIELDS = 'id,user_id,name,status,start_date,end_date,confidence,updated_at'
const PULSE_FIELDS = 'plan_id,user_id,week_start,locked_at,track_status,milestone,progress_note,blocker,next_commitment'
const nameRole = value => (value || 'Role not set').replaceAll('_', ' ')

export default function PlanDashboard() {
  const { profile } = useAuth()
  const teamOverview = hasBusinessDashboardAccess(profile)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('attention')
  const [revision, setRevision] = useState(0)
  const [week, setWeek] = useState(() => planWeekStart())

  useEffect(() => {
    const refresh = () => { setWeek(planWeekStart()); setRevision(value => value + 1) }
    const interval = window.setInterval(refresh, 5 * 60 * 1000)
    window.addEventListener('focus', refresh)
    window.addEventListener(PLAN_REVIEW_EVENT, refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(PLAN_REVIEW_EVENT, refresh)
    }
  }, [])

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const results = teamOverview
        ? await Promise.all([
          supabase.from('profiles').select('id,full_name,position,department,is_active').eq('is_active', true),
          supabase.from('hundred_day_plans').select(PLAN_FIELDS),
          supabase.from('hundred_day_plan_weekly_pulses').select(PULSE_FIELDS).eq('week_start', week),
        ])
        : await Promise.all([
          Promise.resolve({ data: [profile] }),
          supabase.from('hundred_day_plans').select(PLAN_FIELDS).eq('user_id', profile.id),
          supabase.from('hundred_day_plan_weekly_pulses').select(PULSE_FIELDS).eq('user_id', profile.id).eq('week_start', week),
        ])
      if (cancelled) return
      const failed = results.find(result => result.error)
      if (failed) { setError(failed.error.message); return }
      setError('')
      setData({ userId: profile.id, teamOverview, profiles: results[0].data, plans: results[1].data, pulses: results[2].data })
    })().catch(error => { if (!cancelled) setError(error.message || 'Could not load the 100-day plans.') })
    return () => { cancelled = true }
  // The profile's presentation fields do not alter which rows this dashboard may request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, teamOverview, week, revision])

  const overview = data && data.userId === profile?.id && data.teamOverview === teamOverview
    ? buildPlanOverview(data.profiles, data.plans, data.pulses) : null
  const teamLink = '/100-day-plan?view=team'

  return (
    <section className="card plan-dashboard" aria-labelledby="plan-dashboard-title">
      <div className="plan-dashboard-heading">
        <div>
          <h2 id="plan-dashboard-title"><Compass size={19} aria-hidden="true" /> {teamOverview ? '100-day execution overview' : 'Your 100-day plan'}</h2>
          <p>{teamOverview ? 'Active team members · weekly health comes from locked updates only.' : 'Review the plan you already have; log and lock one execution update each week.'} Week of {week} · Dubai time.</p>
        </div>
        <Link to={teamOverview ? teamLink : '/100-day-plan'}>{teamOverview ? 'Open team plans' : 'Open my plan'} →</Link>
      </div>
      {error ? <div className="plan-dashboard-error" role="alert">Could not load plan status: {error} <button className="btn btn-ghost" onClick={() => setRevision(value => value + 1)}>Retry</button></div>
        : !overview ? <p className="plan-dashboard-empty">Loading plans…</p>
          : teamOverview ? <>
            <div className="plan-dashboard-stats">
              <div className="plan-dashboard-stat"><strong>{overview.committed}<small style={{ fontSize: 13, color: 'var(--text-muted)' }}> / {overview.total}</small></strong><span>Current committed plans{overview.upcoming ? ` · ${overview.upcoming} upcoming` : ''}</span></div>
              <div className="plan-dashboard-stat"><strong>{overview.missing + overview.draft + overview.ended + overview.needsDates}</strong><span>{overview.missing} missing · {overview.draft} drafts · {overview.ended} ended{overview.needsDates ? ` · ${overview.needsDates} need dates` : ''}</span></div>
              <div className="plan-dashboard-stat"><strong>{overview.locked}</strong><span>Weekly updates locked</span></div>
              <div className="plan-dashboard-stat"><strong>{overview.due}</strong><span>Committed plans with update due</span></div>
            </div>
            <div className="plan-dashboard-status-line" aria-label="This week's locked execution status">
              <span className="plan-dashboard-badge on_track">{overview.onTrack} on track</span>
              <span className="plan-dashboard-badge at_risk">{overview.atRisk} at risk</span>
              <span className="plan-dashboard-badge blocked">{overview.blocked} blocked / off track</span>
            </div>
            <label className="plan-dashboard-filter">Show team members
              <select value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="attention">Needs attention</option>
                <option value="all">All active team members</option>
                <option value="due">Weekly update due</option>
                <option value="locked">Weekly update locked</option>
                <option value="setup">Plan setup or renewal needed</option>
              </select>
            </label>
            <PlanRows rows={overview.rows.filter(row => filter === 'all'
              || (filter === 'attention' && (row.review.due || ['at_risk', 'blocked'].includes(row.review.status)))
              || (filter === 'locked' && row.review.locked)
              || (filter === 'due' && ['due', 'update_draft'].includes(row.review.status))
              || (filter === 'setup' && ['missing', 'draft', 'ended', 'needs_dates'].includes(row.review.status)))} />
            <p className="plan-review-muted">Blocked / off track means a locked update flags a blocker or an off-track status. Missing and draft updates are not counted as healthy.</p>
          </> : <OwnPlan row={overview.rows[0]} />}
    </section>
  )
}

function PlanRows({ rows }) {
  if (!rows.length) return <p className="plan-dashboard-empty">No team members match this view.</p>
  return <div className="plan-dashboard-table-wrap"><table className="plan-dashboard-table">
    <thead><tr><th>Owner / department</th><th>Plan</th><th>This week</th><th>Focus / next action</th></tr></thead>
    <tbody>{rows.map(({ profile, plan, pulse, review, day }) => <tr key={profile.id}>
      <td><Link className="plan-dashboard-owner" to={`/100-day-plan?view=team&owner=${encodeURIComponent(profile.id)}`}>{profile.full_name || 'Unnamed team member'} →</Link><small>{profile.department || nameRole(profile.position)}</small></td>
      <td>{plan ? plan.status === 'committed' ? 'Committed' : 'Draft' : 'No plan'}<small>{review.status === 'ended' ? 'Ended · agree next cycle' : review.status === 'upcoming' ? `Starts ${plan.start_date}` : day ? `Day ${day} of 100` : 'Start date not set'}</small></td>
      <td><span className={`plan-dashboard-badge ${review.status}`}>{review.locked && <Lock size={11} aria-hidden="true" />}{review.label}</span>{review.locked && <small>Locked {new Date(pulse.locked_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'Asia/Dubai' })}</small>}</td>
      <td className="plan-dashboard-note">{review.locked ? planBlockerText(pulse.blocker) || pulse.next_commitment || pulse.milestone || 'No detail added'
        : review.status === 'missing' ? 'Create and commit a plan.'
          : review.status === 'draft' ? 'Finish the draft and commit the plan.'
            : review.status === 'needs_dates' ? 'Set a start date before completing weekly reviews.'
            : review.status === 'ended' ? 'Review results and agree the next cycle.'
              : review.status === 'upcoming' ? 'Weekly updates begin when the plan starts.'
                : pulse ? 'Draft saved — owner needs to review and lock.' : 'Owner needs to log progress and next commitment.'}
        {review.locked && pulse.milestone && <small>Focus: {pulse.milestone}</small>}</td>
    </tr>)}</tbody>
  </table></div>
}

function OwnPlan({ row }) {
  if (!row) return null
  const { plan, pulse, review, day } = row
  const setup = ['missing', 'draft', 'ended', 'needs_dates'].includes(review.status)
  const description = review.status === 'missing' ? 'Start your 100-day plan and commit it when ready.'
    : review.status === 'draft' ? 'Your draft is saved. Finish reviewing it, commit the plan, and then lock this week’s update.'
      : review.status === 'needs_dates' ? 'Edit your plan to agree its start date before completing weekly reviews.'
      : review.status === 'ended' ? 'Your plan has ended. Review results with your lead and agree your next cycle; your saved plan remains available.'
        : review.status === 'upcoming' ? `Your plan starts ${plan.start_date}. Weekly reviews begin then.`
          : review.locked ? 'Your weekly update and the plan you reviewed are locked for this week. Your next review is due next Monday.'
            : 'Log progress since last week and your next commitment, then lock your update. Saving a draft does not complete the weekly review.'
  return <div className="plan-dashboard-own-body">
    <div className="plan-dashboard-own-copy">
      <span className={`plan-dashboard-badge ${review.status}`}>{review.locked && <Lock size={12} aria-hidden="true" />}{review.label}</span>
      {day > 0 && <span className="plan-review-muted" style={{ marginLeft: 10 }}>Day {day} of 100</span>}
      <p>{description}</p>
      {review.locked && pulse.next_commitment && <p><strong>Next commitment:</strong> {pulse.next_commitment}</p>}
    </div>
    <Link className="btn btn-primary" to={planReviewLink(plan)}>{setup ? 'Review my plan' : review.locked ? 'View locked update' : review.status === 'upcoming' ? 'View my plan' : 'Log weekly update'} →</Link>
  </div>
}
