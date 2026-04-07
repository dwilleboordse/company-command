import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react'

function getStatus(kpi) {
  if (!kpi.goal_value) return 'gray'
  const ratio = kpi.goal_direction === 'min'
    ? kpi.goal_value / Math.max(kpi.current_value, 0.01)
    : kpi.current_value / Math.max(kpi.goal_value, 0.01)
  if (ratio >= 0.9) return 'green'
  if (ratio >= 0.7) return 'amber'
  return 'red'
}
function getProgress(kpi) {
  if (!kpi.goal_value) return 0
  if (kpi.goal_direction === 'min') return Math.min(100, (kpi.goal_value / Math.max(kpi.current_value, 0.01)) * 100)
  return Math.min(100, (kpi.current_value / Math.max(kpi.goal_value, 0.01)) * 100)
}
function getMonday(d = new Date()) {
  const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const m = new Date(d); m.setDate(diff); m.setHours(0,0,0,0); return m
}
function fmt(d) { return d.toISOString().split('T')[0] }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']

export default function Dashboard() {
  const { profile, isCEO, isManagement } = useAuth()
  const [kpis, setKpis] = useState([])
  const [milestones, setMilestones] = useState([])
  const [weekOutcome, setWeekOutcome] = useState(null)
  const [dayEntries, setDayEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const weekStart = getMonday()
  const weekDays = DAYS.map((_, i) => addDays(weekStart, i))
  const todayStr = fmt(new Date())

  useEffect(() => { loadData() }, [profile])

  async function loadData() {
    if (!profile) return
    setLoading(true)
    let kpiQ = supabase.from('kpis').select('*').eq('is_active', true)
    if (!isCEO && !isManagement) kpiQ = kpiQ.eq('visibility', 'team')
    else if (!isCEO) kpiQ = kpiQ.in('visibility', ['team', 'management'])
    if (profile.role === 'athlete' && profile.position) kpiQ = kpiQ.eq('role_type', profile.position)
    const { data: kpiData } = await kpiQ.limit(6)
    setKpis(kpiData || [])

    let msQ = supabase.from('milestones').select('*').eq('is_active', true).neq('status', 'completed')
    if (profile.role === 'athlete' && profile.position) msQ = msQ.eq('role_type', profile.position)
    const { data: msData } = await msQ.limit(5)
    setMilestones(msData || [])

    const { data: wo } = await supabase.from('week_outcomes').select('*').eq('user_id', profile.id).eq('week_start', fmt(weekStart)).single()
    setWeekOutcome(wo)

    // Load day entries for this week
    const { data: days } = await supabase.from('day_entries').select('*').eq('user_id', profile.id)
      .gte('entry_date', fmt(weekStart)).lte('entry_date', fmt(weekDays[4]))
    const map = {}
    days?.forEach(d => { map[d.entry_date] = d })
    setDayEntries(map)
    setLoading(false)
  }

  async function toggleTaskDone(dateStr, entry) {
    const updated = { ...entry, day_outcome_done: !entry.day_outcome_done, updated_at: new Date().toISOString() }
    await supabase.from('day_entries').upsert({ user_id: profile.id, entry_date: dateStr, ...updated }, { onConflict: 'user_id,entry_date' })
    setDayEntries(prev => ({ ...prev, [dateStr]: updated }))
  }

  async function toggleOutcomeDone(i) {
    if (!weekOutcome) return
    const done = weekOutcome.outcomes_done || []
    const updated = done.includes(i) ? done.filter(x => x !== i) : [...done, i]
    await supabase.from('week_outcomes').update({ outcomes_done: updated }).eq('id', weekOutcome.id)
    setWeekOutcome(prev => ({ ...prev, outcomes_done: updated }))
  }

  const onTarget = kpis.filter(k => getStatus(k) === 'green').length
  const offTarget = kpis.filter(k => getStatus(k) === 'red').length
  const statusLabel = { not_started: 'Not Started', started: 'Started', half: '50%', three_quarters: '75%', completed: 'Done' }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">{getGreeting()}, {profile?.full_name?.split(' ')[0]}.</h1>
            <p className="page-subtitle">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {profile?.position && <> · <span className="text-accent">{formatPosition(profile.position)}</span></>}
            </p>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">KPIs On Target</div><div className="stat-box-value text-green">{onTarget}</div></div>
          <div className="stat-box"><div className="stat-box-label">KPIs Off Target</div><div className="stat-box-value text-red">{offTarget}</div></div>
          <div className="stat-box"><div className="stat-box-label">Open Milestones</div><div className="stat-box-value text-accent">{milestones.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Week Outcome</div><div className="stat-box-value" style={{ fontSize: 20, paddingTop: 4 }}>{weekOutcome?.outcomes?.length > 0 ? <span className="text-green">Set ✓</span> : <span className="text-muted">—</span>}</div></div>
        </div>

        {/* Weekly to-do grid */}
        <div className="section-header mb-4">
          <span className="section-title">This Week</span>
          <Link to="/calendar" className="btn btn-ghost btn-sm">Open Calendar <ArrowRight size={13} /></Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 28 }}>
          {weekDays.map((day, i) => {
            const dateStr = fmt(day)
            const entry = dayEntries[dateStr]
            const isToday = dateStr === todayStr
            const isPast = dateStr < todayStr
            return (
              <div key={i} className="card" style={{ padding: 14, borderColor: isToday ? 'var(--accent)' : 'var(--border)', background: isToday ? 'rgba(59,130,246,0.04)' : 'var(--bg-card)' }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text-secondary)', letterSpacing: '-0.01em' }}>{DAYS[i]}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                {entry?.day_outcome ? (
                  <div className="checkbox-item" onClick={() => toggleTaskDone(dateStr, entry)}>
                    {entry.day_outcome_done ? <CheckCircle2 size={15} color="var(--green)" /> : <Circle size={15} color="var(--text-muted)" />}
                    <span className={`text-sm ${entry.day_outcome_done ? 'strikethrough' : ''}`} style={{ lineHeight: 1.3 }}>{entry.day_outcome}</span>
                  </div>
                ) : (
                  <Link to="/calendar" style={{ textDecoration: 'none' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isToday ? 'Log today →' : isPast ? 'No entry' : 'Plan ahead →'}</span>
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
          {/* KPI snapshot — bigger */}
          <div>
            <div className="section-header">
              <span className="section-title">KPI Snapshot</span>
              <Link to="/kpis" className="btn btn-ghost btn-sm">View All <ArrowRight size={13} /></Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {kpis.length === 0 ? (
                <div className="card empty-state"><p>No KPIs assigned.</p></div>
              ) : kpis.map(kpi => {
                const status = getStatus(kpi)
                const progress = getProgress(kpi)
                return (
                  <div key={kpi.id} className={`kpi-card ${status}`}>
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, marginRight: 12, lineHeight: 1.3 }}>{kpi.metric_name}</span>
                      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }} className={status !== 'gray' ? `text-${status}` : 'text-secondary'}>
                          {kpi.unit === '$' ? '$' : ''}{kpi.current_value}{kpi.unit !== '$' ? kpi.unit : ''}
                        </span>
                        <span className={`badge ${status}`} style={{ fontSize: 9 }}>
                          {kpi.goal_direction === 'min' ? '≤' : '≥'}{kpi.unit === '$' ? '$' : ''}{kpi.goal_value}{kpi.unit !== '$' ? kpi.unit : ''}
                        </span>
                      </div>
                    </div>
                    <div className="progress-bar-wrap" style={{ marginTop: 8 }}>
                      <div className={`progress-bar-fill ${status}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right column */}
          <div>
            <div className="section-header">
              <span className="section-title">Week Outcomes</span>
              <Link to="/calendar" className="btn btn-ghost btn-sm">Update <ArrowRight size={13} /></Link>
            </div>
            <div className="card mb-4">
              {weekOutcome?.outcomes?.length > 0 ? (
                weekOutcome.outcomes.map((o, i) => {
                  const done = weekOutcome.outcomes_done?.includes(i)
                  return (
                    <div key={i} className="checkbox-item" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 4 }} onClick={() => toggleOutcomeDone(i)}>
                      {done ? <CheckCircle2 size={15} color="var(--green)" /> : <Circle size={15} color="var(--text-muted)" />}
                      <span className={`text-sm ${done ? 'strikethrough' : ''}`}>{o}</span>
                    </div>
                  )
                })
              ) : (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  <p>No week outcome set.</p>
                  <Link to="/calendar" className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>Set Week Outcome</Link>
                </div>
              )}
            </div>

            <div className="section-header">
              <span className="section-title">Open Milestones</span>
              <Link to="/milestones" className="btn btn-ghost btn-sm">View All <ArrowRight size={13} /></Link>
            </div>
            <div className="card">
              {milestones.length === 0 ? <p className="text-muted text-sm">No open milestones.</p> : milestones.map(ms => (
                <div key={ms.id} className="flex items-center gap-3" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className={`ms-dot ${ms.status}`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{ms.milestone_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ms.system_name}</div>
                  </div>
                  <span className={`badge ${ms.status === 'completed' ? 'green' : ms.status === 'not_started' ? 'gray' : 'amber'}`}>
                    {statusLabel[ms.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}
function formatPosition(pos) {
  const map = { creative_strategist:'Creative Strategist', media_buyer:'Media Buyer', editor:'Editor', designer:'Designer', ugc_manager:'UGC Manager', email_marketer:'Email Marketer', ops_manager:'Operations Manager', ops_assistant:'Operations Assistant', hr_manager:'HR Manager', marketing:'Marketing', management:'Management' }
  return map[pos] || pos
}
