import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react'

function getStatus(kpi) {
  if (kpi.goal_value === 0) return 'gray'
  const ratio = kpi.goal_direction === 'min'
    ? kpi.goal_value / Math.max(kpi.current_value, 0.01)
    : kpi.current_value / kpi.goal_value
  if (ratio >= 0.9) return 'green'
  if (ratio >= 0.7) return 'amber'
  return 'red'
}

function getProgress(kpi) {
  if (kpi.goal_value === 0) return 0
  if (kpi.goal_direction === 'min') {
    return Math.min(100, (kpi.goal_value / Math.max(kpi.current_value, 0.01)) * 100)
  }
  return Math.min(100, (kpi.current_value / kpi.goal_value) * 100)
}

export default function Dashboard() {
  const { profile, isCEO, isManagement } = useAuth()
  const [kpis, setKpis] = useState([])
  const [milestones, setMilestones] = useState([])
  const [weekOutcome, setWeekOutcome] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [profile])

  async function loadData() {
    if (!profile) return
    setLoading(true)

    // Load KPIs based on role
    let kpiQuery = supabase.from('kpis').select('*').eq('is_active', true)
    if (!isCEO && !isManagement) {
      kpiQuery = kpiQuery.eq('visibility', 'team')
    } else if (!isCEO) {
      kpiQuery = kpiQuery.in('visibility', ['team', 'management'])
    }

    // Filter by role_type for athletes
    if (profile.role === 'athlete' && profile.position) {
      kpiQuery = kpiQuery.eq('role_type', profile.position)
    }

    const { data: kpiData } = await kpiQuery.limit(8)
    setKpis(kpiData || [])

    // Load milestones
    let msQuery = supabase.from('milestones').select('*').eq('is_active', true).neq('status', 'completed')
    if (profile.role === 'athlete' && profile.position) {
      msQuery = msQuery.eq('role_type', profile.position)
    }
    const { data: msData } = await msQuery.limit(5)
    setMilestones(msData || [])

    // Load this week's outcome
    const weekStart = getMonday()
    const { data: wo } = await supabase.from('week_outcomes')
      .select('*').eq('user_id', profile.id).eq('week_start', weekStart).single()
    setWeekOutcome(wo)

    setLoading(false)
  }

  function getMonday() {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  const onTarget = kpis.filter(k => getStatus(k) === 'green').length
  const offTarget = kpis.filter(k => getStatus(k) === 'red').length
  const msCompleted = milestones.filter(m => m.status === 'completed').length

  const statusLabel = { not_started: 'Not Started', started: 'Started', half: '50%', three_quarters: '75%', completed: 'Done' }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">
              {getGreeting()}, {profile?.full_name?.split(' ')[0]}.
            </h1>
            <p className="page-subtitle">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {profile?.position && <> &middot; <span className="text-accent">{formatPosition(profile.position)}</span></>}
            </p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stat summary */}
        <div className="stat-row">
          <div className="stat-box">
            <div className="stat-box-label">KPIs On Target</div>
            <div className="stat-box-value text-green">{onTarget}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">KPIs Off Target</div>
            <div className="stat-box-value text-red">{offTarget}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Open Milestones</div>
            <div className="stat-box-value text-accent">{milestones.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Week Outcome</div>
            <div className="stat-box-value" style={{ fontSize: 20, paddingTop: 4 }}>
              {weekOutcome ? <span className="text-green">Set ✓</span> : <span className="text-muted">—</span>}
            </div>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 20 }}>
          {/* KPI snapshot */}
          <div>
            <div className="section-header">
              <span className="section-title">KPI Snapshot</span>
              <Link to="/kpis" className="btn btn-ghost btn-sm">View All <ArrowRight size={13} /></Link>
            </div>
            {kpis.length === 0 ? (
              <div className="card empty-state">
                <p>No KPIs assigned yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {kpis.slice(0, 6).map(kpi => {
                  const status = getStatus(kpi)
                  const progress = getProgress(kpi)
                  return (
                    <div key={kpi.id} className={`kpi-card ${status}`} style={{ padding: '12px 14px' }}>
                      <div className="flex items-center justify-between">
                        <span className="kpi-metric" style={{ marginBottom: 0 }}>{kpi.metric_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="kpi-value" style={{ fontSize: 20, marginBottom: 0 }}>
                            {kpi.current_value}{kpi.unit === '%' ? '%' : kpi.unit === '$' ? '' : ''}
                          </span>
                          <span className={`badge ${status}`} style={{ fontSize: 9 }}>
                            Goal: {kpi.goal_direction === 'min' ? '≤' : '≥'}{kpi.goal_value}{kpi.unit === '%' ? '%' : ''}
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
            )}
          </div>

          {/* Right column */}
          <div>
            {/* Week outcome */}
            <div className="section-header">
              <span className="section-title">This Week's Outcome</span>
              <Link to="/calendar" className="btn btn-ghost btn-sm">Update <ArrowRight size={13} /></Link>
            </div>
            <div className="card mb-4">
              {weekOutcome?.outcomes?.length > 0 ? (
                <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
                  {weekOutcome.outcomes.map((o, i) => (
                    <li key={i} className="flex items-center gap-2" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                      {o}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state" style={{ padding: '24px 0' }}>
                  <p>No week outcome set.</p>
                  <Link to="/calendar" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                    Set Week Outcome
                  </Link>
                </div>
              )}
            </div>

            {/* Open milestones */}
            <div className="section-header">
              <span className="section-title">Open Milestones</span>
              <Link to="/milestones" className="btn btn-ghost btn-sm">View All <ArrowRight size={13} /></Link>
            </div>
            <div className="card">
              {milestones.length === 0 ? (
                <p className="text-muted text-sm">No open milestones.</p>
              ) : (
                milestones.map(ms => (
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
                ))
              )}
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
  const map = {
    creative_strategist: 'Creative Strategist',
    media_buyer: 'Media Buyer',
    editor: 'Editor',
    designer: 'Designer',
    ugc_manager: 'UGC Manager',
    email_marketer: 'Email Marketer',
    ops_manager: 'Operations Manager',
    ops_assistant: 'Operations Assistant',
    hr_manager: 'HR Manager',
    marketing: 'Marketing',
    management: 'Management',
  }
  return map[pos] || pos
}
