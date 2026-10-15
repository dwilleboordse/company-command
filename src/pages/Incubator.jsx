import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, ExternalLink, GraduationCap,
  HelpCircle, ListChecks, Plus, ShieldCheck, Sprout, Target, Trash2, Users,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/reportingData'
import { healthDueWeek } from '../lib/healthWeekly'
import { formatSpendMoney } from '../lib/spendAnalytics'
import {
  graduationChecks, incubatorMonthLabel, incubatorRoster, latestLogged, taskProgress, weeklyTimeline,
} from '../lib/incubator'

const STAGES = {
  overdue: { label: 'Review overdue', color: 'var(--red)', bg: 'var(--red-dim)' },
  review: { label: 'Graduation review', color: 'var(--amber)', bg: 'var(--amber-dim)' },
  support: { label: 'Moved in', color: 'var(--purple)', bg: 'var(--purple-dim)' },
  active: { label: 'In incubator', color: 'var(--green)', bg: 'var(--green-dim)' },
}
const RISK_COLORS = { Low: 'var(--green)', Medium: 'var(--amber)', High: 'var(--red)', Leaving: 'var(--red)' }
const muted = { color: 'var(--text-muted)' }
const mono = { fontFamily: 'var(--font-mono)' }

function fmtWeek(key) {
  return key ? new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
}

function groupBy(rows, key = 'client_id') {
  return rows.reduce((groups, row) => { (groups[row[key]] ||= []).push(row); return groups }, {})
}

// The incubator's own tables come from a separate migration. Until it is applied the page
// still loads, treating them as empty, and names what is missing.
const NEW_TABLES = { 4: 'client_incubator', 5: 'client_goals', 7: 'clickup_client_tasks' }
const isMissingTable = error => ['PGRST205', '42P01'].includes(error?.code)

async function loadIncubator() {
  const results = await Promise.all([
    fetchAllRows(() => supabase.from('clients').select('id,name,is_active,is_archived').order('name').order('id')),
    fetchAllRows(() => supabase.from('client_churn_profiles').select('client_id,engagement_start').order('client_id')),
    fetchAllRows(() => supabase.from('client_health_entries').select('client_id,week_start,churn_risk,communication,notes').order('week_start', { ascending: false }).order('id')),
    fetchAllRows(() => supabase.from('spend_entries').select('client_id,week_start,ddu_spend,total_spend').order('week_start', { ascending: false }).order('id')),
    fetchAllRows(() => supabase.from('client_incubator').select('*').order('client_id')),
    fetchAllRows(() => supabase.from('client_goals').select('*').order('created_at').order('id')),
    fetchAllRows(() => supabase.from('client_actions').select('*').order('created_at').order('id')),
    fetchAllRows(() => supabase.from('clickup_client_tasks').select('*').order('due_date').order('task_id')),
  ])
  const missingTables = []
  results.forEach((result, index) => {
    if (NEW_TABLES[index] && isMissingTable(result.error)) {
      missingTables.push(NEW_TABLES[index])
      results[index] = { data: [], error: null }
    }
  })
  const failed = results.find(result => result.error)
  if (failed) throw new Error(failed.error.message)
  const [clients, profiles, health, spend, memberships, goals, actions, tasks] = results.map(result => result.data)
  return { clients, profiles, health, spend, memberships, goals, actions, tasks, missingTables }
}

function Badge({ color, bg, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', color, background: bg }}>
      {children}
    </span>
  )
}

function MetricCard({ icon, label, value, detail, color = 'var(--text-primary)' }) {
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, ...muted }}>
        {icon}
        <span style={{ ...mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 27, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.04em', color }}>{value}</div>
      <div style={{ ...mono, fontSize: 10, ...muted, marginTop: 8 }}>{detail}</div>
    </div>
  )
}

// Direction arrow; `better` says which way is good. Names the compared week when it is not the week before.
function Change({ value, better = 'up', text, comparedTo, weekBefore }) {
  if (value == null) return null
  if (value === 0) return <span style={{ fontSize: 10, ...muted }}>no change</span>
  const good = better === 'up' ? value > 0 : value < 0
  return (
    <span style={{ fontSize: 10, fontWeight: 650, color: good ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
      {value > 0 ? '▲' : '▼'} {text}{comparedTo && comparedTo !== weekBefore ? ` vs ${fmtWeek(comparedTo)}` : ''}
    </span>
  )
}

const riskText = change => (change < 0 ? 'better' : 'worse')
const weekBefore = week => {
  const date = new Date(`${week}T00:00:00`)
  date.setDate(date.getDate() - 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function percentChange(row) {
  const before = row?.ddu != null && row?.dduChange != null ? row.ddu - row.dduChange : null
  return before ? `${Math.round(Math.abs(row.dduChange) / before * 100)}%` : formatSpendMoney(Math.abs(row?.dduChange ?? 0))
}

function SectionTitle({ icon, title, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
      <span style={muted}>{icon}</span>
      <h3 style={{ fontSize: 12, fontWeight: 750 }}>{title}</h3>
      {detail && <span style={{ fontSize: 10, ...muted }}>{detail}</span>}
    </div>
  )
}

function WeekTable({ timeline }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Week</th><th>Risk</th><th>Relationship</th><th>DDU spend</th><th>Total spend</th><th>DDU share</th></tr></thead>
        <tbody>
          {timeline.map(row => (
            <tr key={row.week}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtWeek(row.week)}{row.legacy && <span style={{ fontSize: 9, ...muted }}> (stored on a {new Date(`${row.week}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })})</span>}</td>
              <td>
                {row.risk ? <span style={{ fontWeight: 700, color: RISK_COLORS[row.risk] }}>{row.risk}</span> : <span style={muted}>{row.healthLogged ? '—' : 'not logged'}</span>}
                <div><Change value={row.riskChange} better="down" text={riskText(row.riskChange)} comparedTo={row.comparedTo.risk} weekBefore={weekBefore(row.week)}/></div>
              </td>
              <td>
                {row.relationship != null ? <span style={{ fontWeight: 700 }}>{row.relationship}/5</span> : <span style={muted}>{row.healthLogged ? 'not scored' : 'not logged'}</span>}
                <div><Change value={row.relationshipChange} text={Math.abs(row.relationshipChange ?? 0)} comparedTo={row.comparedTo.relationship} weekBefore={weekBefore(row.week)}/></div>
              </td>
              <td>
                {row.ddu != null ? <span style={{ ...mono, fontWeight: 700 }}>{formatSpendMoney(row.ddu)}</span> : <span style={muted}>{row.spendLogged ? '—' : 'not logged'}</span>}
                <div><Change value={row.dduChange} text={percentChange(row)} comparedTo={row.comparedTo.ddu} weekBefore={weekBefore(row.week)}/></div>
              </td>
              <td style={mono}>{row.total != null ? formatSpendMoney(row.total) : <span style={muted}>—</span>}</td>
              <td style={mono}>{row.share != null ? `${row.share.toFixed(1)}%` : <span style={muted}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskPanel({ progress }) {
  if (!progress) return <p style={{ fontSize: 11, ...muted }}>No ClickUp tasks are linked to this client yet.</p>
  const order = ['not started', 'request', 'ready for editing', 'in progress', 'review cs', 'needs edits', 'paused', 'approved', 'not launched', 'review es', 'sent to client']
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
        <span><strong>{progress.done}</strong> of {progress.total} delivered</span>
        <strong>{progress.percent == null ? '—' : `${Math.round(progress.percent)}%`}</strong>
      </div>
      <div style={{ height: 8, borderRadius: 100, background: 'var(--bg)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${progress.percent ?? 0}%`, height: '100%', background: 'var(--green)' }}/>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {order.filter(status => progress.byStatus[status]).map(status => (
          <span key={status} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'var(--bg)', ...muted }}>{status} · {progress.byStatus[status]}</span>
        ))}
      </div>
      {progress.delayed.length ? (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={12}/> {progress.delayed.length} delayed {progress.delayed.length === 1 ? 'task' : 'tasks'}
          </p>
          <div style={{ maxHeight: 210, overflowY: 'auto' }}>
            {progress.delayed.map(task => (
              <a key={task.task_id} href={task.url || `https://app.clickup.com/t/${task.task_id}`} target="_blank" rel="noreferrer"
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-primary)', textDecoration: 'none' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                <span style={{ whiteSpace: 'nowrap', color: 'var(--red)', ...mono, fontSize: 10 }}>due {fmtWeek(task.due_date)} · {task.status} <ExternalLink size={10}/></span>
              </a>
            ))}
          </div>
        </>
      ) : <p style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={12}/> No delayed tasks</p>}
      {progress.undated > 0 && <p style={{ fontSize: 10, ...muted, marginTop: 8 }}>{progress.undated} open tasks have no due date, so they can't be flagged as delayed.</p>}
    </>
  )
}

function GoalsPanel({ goals, saving, onAdd, onRemove }) {
  const [metric, setMetric] = useState('')
  const [target, setTarget] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (metric.trim() && await onAdd({ metric: metric.trim(), target: target.trim() })) { setMetric(''); setTarget('') }
  }
  return (
    <>
      {goals.length ? goals.map(goal => (
        <div key={goal.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span><strong>{goal.metric}</strong>{goal.target && <span style={muted}> → {goal.target}</span>}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => onRemove(goal)} disabled={saving} title="Remove goal"><Trash2 size={11}/></button>
        </div>
      )) : <p style={{ fontSize: 11, ...muted }}>No goals written down yet.</p>}
      <form onSubmit={submit} style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <input value={metric} onChange={event => setMetric(event.target.value)} placeholder="Metric, e.g. ROAS" style={{ flex: '2 1 140px', fontSize: 11 }}/>
        <input value={target} onChange={event => setTarget(event.target.value)} placeholder="Target, e.g. 2.5 by Dec" style={{ flex: '2 1 140px', fontSize: 11 }}/>
        <button className="btn btn-ghost btn-sm" disabled={saving || !metric.trim()}><Plus size={11}/> Add goal</button>
      </form>
    </>
  )
}

function ActionsPanel({ actions, saving, onAdd, onToggle, onRemove }) {
  const [text, setText] = useState('')
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (text.trim() && await onAdd({ action_text: text.trim(), owner: owner.trim() || null, due_date: due || null })) { setText(''); setOwner(''); setDue('') }
  }
  return (
    <>
      {actions.length ? actions.map(action => (
        <div key={action.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <button onClick={() => onToggle(action)} disabled={saving} title={action.is_done ? 'Mark as not done' : 'Mark as done'}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: action.is_done ? 'var(--green)' : 'var(--text-muted)', display: 'flex' }}>
            {action.is_done ? <CheckCircle2 size={15}/> : <Circle size={15}/>}
          </button>
          <span style={{ flex: 1, textDecoration: action.is_done ? 'line-through' : 'none', color: action.is_done ? 'var(--text-muted)' : 'var(--text-primary)' }}>
            {action.action_text}
            {(action.owner || action.due_date) && <span style={{ fontSize: 10, ...muted }}> · {[action.owner, action.due_date && `due ${fmtWeek(action.due_date)}`].filter(Boolean).join(' · ')}</span>}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => onRemove(action)} disabled={saving} title="Remove action"><Trash2 size={11}/></button>
        </div>
      )) : <p style={{ fontSize: 11, ...muted }}>No actions yet.</p>}
      <form onSubmit={submit} style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <input value={text} onChange={event => setText(event.target.value)} placeholder="What needs to happen" style={{ flex: '3 1 180px', fontSize: 11 }}/>
        <input value={owner} onChange={event => setOwner(event.target.value)} placeholder="Owner" style={{ flex: '1 1 90px', fontSize: 11 }}/>
        <input type="date" value={due} onChange={event => setDue(event.target.value)} aria-label="Due date" style={{ flex: '1 1 120px', fontSize: 11 }}/>
        <button className="btn btn-ghost btn-sm" disabled={saving || !text.trim()}><Plus size={11}/> Add action</button>
      </form>
    </>
  )
}

function GraduationPanel({ member, saving, onGraduate, onRelease }) {
  const [note, setNote] = useState('')
  const passed = member.checks.filter(check => check.pass === true).length
  return (
    <>
      {member.checks.map(check => (
        <div key={check.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '4px 0' }}>
          {check.pass === true ? <CheckCircle2 size={14} color="var(--green)"/> : check.pass === false ? <AlertTriangle size={14} color="var(--red)"/> : <HelpCircle size={14} color="var(--text-muted)"/>}
          <span style={{ color: check.pass === null ? 'var(--text-muted)' : 'var(--text-primary)' }}>{check.label}{check.pass === null && ' (no data)'}</span>
        </div>
      ))}
      <p style={{ fontSize: 10, ...muted, margin: '8px 0' }}>{passed} of {member.checks.length} checks met. These are proposed checks; the decision stays with you.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={note} onChange={event => setNote(event.target.value)} placeholder="Note for the decision (optional)" style={{ flex: '3 1 200px', fontSize: 11 }}/>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => onGraduate(note)}><GraduationCap size={12}/> Graduate to normal monitoring</button>
        {member.reason === 'manual' && <button className="btn btn-ghost btn-sm" disabled={saving} onClick={onRelease}>Take out of incubator</button>}
      </div>
    </>
  )
}

function AddClient({ options, saving, onAdd }) {
  const [clientId, setClientId] = useState('')
  const [note, setNote] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (clientId && await onAdd(clientId, note.trim())) { setClientId(''); setNote('') }
  }
  return (
    <form onSubmit={submit} className="card" style={{ padding: 14, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 700 }}>Move a client into the incubator</span>
      <select value={clientId} onChange={event => setClientId(event.target.value)} aria-label="Client to move in" style={{ width: 'auto', minWidth: 180, fontSize: 11 }}>
        <option value="">Choose a current client…</option>
        {options.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select>
      <input value={note} onChange={event => setNote(event.target.value)} placeholder="Why (e.g. severe performance drop)" style={{ flex: '1 1 220px', fontSize: 11 }}/>
      <button className="btn btn-ghost btn-sm" disabled={saving || !clientId}><Plus size={11}/> Move in</button>
    </form>
  )
}

export default function Incubator() {
  const { profile, isManagement } = useAuth()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const lastWeek = useMemo(() => healthDueWeek(), [])

  const load = useCallback(async () => {
    try {
      setData(await loadIncubator())
      setLoadError('')
    } catch (error) {
      setLoadError(error.message)
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    loadIncubator().then(result => { if (!cancelled) setData(result) }, error => { if (!cancelled) setLoadError(error.message) })
    return () => { cancelled = true }
  }, [])

  const view = useMemo(() => {
    if (!data) return null
    const profiles = Object.fromEntries(data.profiles.map(row => [row.client_id, row]))
    const roster = incubatorRoster({ clients: data.clients, profiles, memberships: data.memberships })
    const health = groupBy(data.health), spend = groupBy(data.spend), goals = groupBy(data.goals)
    const actions = groupBy(data.actions), tasks = groupBy(data.tasks)
    const members = roster.members.map(member => {
      const id = member.client.id
      const timeline = weeklyTimeline({ health: health[id] || [], spend: spend[id] || [], lastWeek, weeks: 8 })
      const progress = tasks[id] ? taskProgress(tasks[id]) : null
      const clientGoals = goals[id] || [], clientActions = actions[id] || []
      return {
        ...member, timeline, progress, goals: clientGoals, actions: clientActions,
        risk: latestLogged(timeline, 'risk'), relationship: latestLogged(timeline, 'relationship'), spend: latestLogged(timeline, 'ddu'),
        checkedThisWeek: timeline.some(row => row.week === lastWeek && row.healthLogged),
        checks: graduationChecks({ timeline, tasks: progress, goals: clientGoals, actions: clientActions }),
      }
    })
    const inIds = new Set(members.map(member => member.client.id))
    const addOptions = data.clients.filter(client => client.is_active !== false && !client.is_archived && !inIds.has(client.id))
    return { ...roster, members, addOptions }
  }, [data, lastWeek])

  async function save(request) {
    setSaving(true)
    setNotice('')
    const { error } = await request()
    setSaving(false)
    if (error) { setNotice(error.message); return false }
    await load()
    return true
  }
  const stamp = () => ({ updated_by: profile?.id ?? null, updated_at: new Date().toISOString() })
  const setMembership = (clientId, status, note) => save(() => supabase.from('client_incubator')
    .upsert({ client_id: clientId, status, note: note || null, ...(status === 'graduated' ? { graduated_at: new Date().toISOString() } : {}), ...stamp() }, { onConflict: 'client_id' }))
  const release = clientId => save(() => supabase.from('client_incubator').delete().eq('client_id', clientId))

  if (!isManagement) {
    return <div className="page-body"><div className="empty-state"><p>The Incubator is available to management and the CEO only.</p></div></div>
  }

  const members = view?.members ?? []
  const delayedTotal = members.reduce((sum, member) => sum + (member.progress?.delayed.length ?? 0), 0)
  const highRisk = members.filter(member => ['High', 'Leaving'].includes(member.risk?.risk))
  const inReview = members.filter(member => ['review', 'overdue'].includes(member.stage))
  const missingCheck = members.filter(member => !member.checkedThisWeek)

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, color: 'var(--accent)' }}>
          <ShieldCheck size={13}/>
          <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Management + CEO</span>
        </div>
        <h1 className="page-title">Client Incubator</h1>
        <p className="page-subtitle">Clients in their first 3 months with DDU, plus clients moved in for extra support</p>
      </div>

      <div className="page-body">
        {!data && !loadError ? (
          <div className="loading-screen" style={{ minHeight: 320, background: 'transparent' }}><div className="spinner"/></div>
        ) : loadError ? (
          <div className="card" style={{ padding: 20, color: 'var(--red)', fontSize: 12 }}>The incubator could not load: {loadError}</div>
        ) : (
          <>
            {data.missingTables.length > 0 && (
              <div className="card" style={{ padding: 12, marginBottom: 16, color: 'var(--amber)', fontSize: 12 }}>
                Not set up yet: {data.missingTables.join(', ')}. Clients, health and spend are live, but goals, move-ins, graduations and ClickUp tasks can't be shown or saved until these tables are added.
              </div>
            )}
            {notice && <div className="card" style={{ padding: 12, marginBottom: 16, color: 'var(--red)', fontSize: 12 }}>{notice}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
              <MetricCard icon={<Sprout size={13}/>} label="In the incubator" value={members.length}
                detail={`${members.filter(member => member.reason === 'new').length} new · ${members.filter(member => member.reason === 'manual').length} moved in`}/>
              <MetricCard icon={<GraduationCap size={13}/>} label="Graduation review" value={inReview.length} color={inReview.length ? 'var(--amber)' : undefined}
                detail="In month 3 or past it"/>
              <MetricCard icon={<AlertTriangle size={13}/>} label="High risk" value={highRisk.length} color={highRisk.length ? 'var(--red)' : undefined}
                detail={highRisk.map(member => member.client.name).join(', ') || 'Latest check: High or Leaving'}/>
              <MetricCard icon={<ListChecks size={13}/>} label="Delayed tasks" value={delayedTotal} color={delayedTotal ? 'var(--red)' : undefined}
                detail="ClickUp, past due and not delivered"/>
              <MetricCard icon={<Users size={13}/>} label={`Check-in for ${fmtWeek(lastWeek)}`} value={`${members.length - missingCheck.length}/${members.length}`}
                color={missingCheck.length ? 'var(--amber)' : 'var(--green)'} detail={missingCheck.length ? `Missing: ${missingCheck.map(member => member.client.name).join(', ')}` : 'All weekly checks logged'}/>
            </div>

            <AddClient options={view.addOptions} saving={saving} onAdd={(clientId, note) => setMembership(clientId, 'active', note)}/>

            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th></th><th>Client</th><th>Month</th><th>Stage</th><th>Risk</th><th>Relationship</th><th>DDU spend</th><th>Tasks</th><th>Actions</th><th>Last check-in</th></tr>
                  </thead>
                  <tbody>
                    {members.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 28, ...muted }}>No clients are in the incubator.</td></tr>}
                    {members.map(member => {
                      const id = member.client.id
                      const open = expanded === id
                      const stage = STAGES[member.stage]
                      const openActions = member.actions.filter(action => !action.is_done).length
                      const lastCheck = member.timeline.find(row => row.healthLogged)
                      return (
                        <Fragment key={id}>
                          <tr onClick={() => setExpanded(open ? null : id)} style={{ cursor: 'pointer' }}>
                            <td style={{ width: 24 }}>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: 12 }}>{member.client.name}</div>
                              <div style={{ fontSize: 10, ...muted }}>{member.start ? `Started ${fmtWeek(member.start)} ${member.start.slice(0, 4)} · ${member.tenure.toFixed(1)} mo` : 'No start date'}</div>
                              {member.membership?.note && <div style={{ fontSize: 10, color: 'var(--purple)' }}>{member.membership.note}</div>}
                            </td>
                            <td style={{ whiteSpace: 'nowrap', fontWeight: 650 }}>{incubatorMonthLabel(member.band)}</td>
                            <td><Badge color={stage.color} bg={stage.bg}>{stage.label}</Badge></td>
                            <td>
                              {member.risk ? <span style={{ fontWeight: 700, color: RISK_COLORS[member.risk.risk] }}>{member.risk.risk}</span> : <span style={muted}>—</span>}
                              <div><Change value={member.risk?.riskChange} better="down" text={riskText(member.risk?.riskChange)} comparedTo={member.risk?.comparedTo.risk} weekBefore={member.risk && weekBefore(member.risk.week)}/></div>
                            </td>
                            <td>
                              {member.relationship ? <span style={{ fontWeight: 700 }}>{member.relationship.relationship}/5</span> : <span style={muted}>—</span>}
                              <div><Change value={member.relationship?.relationshipChange} text={Math.abs(member.relationship?.relationshipChange ?? 0)} comparedTo={member.relationship?.comparedTo.relationship} weekBefore={member.relationship && weekBefore(member.relationship.week)}/></div>
                            </td>
                            <td>
                              {member.spend ? <span style={{ ...mono, fontWeight: 700 }}>{formatSpendMoney(member.spend.ddu)}</span> : <span style={muted}>—</span>}
                              {member.spend && <div style={{ fontSize: 9, ...muted }}>week of {fmtWeek(member.spend.week)}</div>}
                              <div><Change value={member.spend?.dduChange} text={percentChange(member.spend)} comparedTo={member.spend?.comparedTo.ddu} weekBefore={member.spend && weekBefore(member.spend.week)}/></div>
                            </td>
                            <td>
                              {member.progress ? (
                                <>
                                  <div style={{ fontSize: 11, fontWeight: 650 }}>{member.progress.done}/{member.progress.total} delivered</div>
                                  {member.progress.delayed.length > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>{member.progress.delayed.length} delayed</div>}
                                </>
                              ) : <span style={{ fontSize: 10, ...muted }}>Not linked</span>}
                            </td>
                            <td style={{ fontSize: 11 }}>{openActions ? `${openActions} open` : <span style={muted}>—</span>}</td>
                            <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                              {lastCheck ? fmtWeek(lastCheck.week) : <span style={muted}>never</span>}
                              {!member.checkedThisWeek && <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 650 }}>{fmtWeek(lastWeek)} missing</div>}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={10} style={{ background: 'var(--bg)', padding: 16 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
                                  <div className="card" style={{ padding: 14, gridColumn: '1 / -1' }}>
                                    <SectionTitle icon={<Users size={13}/>} title="Week by week" detail="Risk and relationship from the Monday Client Health check · spend from the Spend Tracker"/>
                                    <WeekTable timeline={member.timeline}/>
                                  </div>
                                  <div className="card" style={{ padding: 14 }}>
                                    <SectionTitle icon={<ListChecks size={13}/>} title="Tasks in ClickUp" detail="[Int] Ads Board"/>
                                    <TaskPanel progress={member.progress}/>
                                  </div>
                                  <div className="card" style={{ padding: 14 }}>
                                    <SectionTitle icon={<Target size={13}/>} title="Client goals" detail="What they want to achieve"/>
                                    <GoalsPanel goals={member.goals} saving={saving}
                                      onAdd={goal => save(() => supabase.from('client_goals').insert({ client_id: id, ...goal, created_by: profile?.id ?? null }))}
                                      onRemove={goal => save(() => supabase.from('client_goals').delete().eq('id', goal.id))}/>
                                  </div>
                                  <div className="card" style={{ padding: 14 }}>
                                    <SectionTitle icon={<CheckCircle2 size={13}/>} title="Actions to take"/>
                                    <ActionsPanel actions={member.actions} saving={saving}
                                      onAdd={action => save(() => supabase.from('client_actions').insert({ client_id: id, ...action, is_done: false, created_by: profile?.id ?? null }))}
                                      onToggle={action => save(() => supabase.from('client_actions').update({ is_done: !action.is_done, updated_at: new Date().toISOString() }).eq('id', action.id))}
                                      onRemove={action => save(() => supabase.from('client_actions').delete().eq('id', action.id))}/>
                                  </div>
                                  <div className="card" style={{ padding: 14 }}>
                                    <SectionTitle icon={<GraduationCap size={13}/>} title="Ready to graduate?"/>
                                    <GraduationPanel member={member} saving={saving}
                                      onGraduate={note => setMembership(id, 'graduated', note)} onRelease={() => release(id)}/>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ fontSize: 10, ...muted, marginBottom: 16 }}>
              Month uses the same rule as Churn Analysis: 1.0–1.9 mo is month 1. Clients in month 3 are due a graduation review and stay listed one more month as "review overdue" until someone decides.
              Week-over-week arrows compare with the previous logged week and name it when a week was skipped.
            </p>

            {(view.graduated.length > 0 || view.undated.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
                {view.graduated.length > 0 && (
                  <div className="card" style={{ padding: 14 }}>
                    <SectionTitle icon={<GraduationCap size={13}/>} title="Graduated" detail="Monitored like normal clients"/>
                    {view.graduated.map(entry => (
                      <div key={entry.client.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span><strong>{entry.client.name}</strong>{entry.membership?.graduated_at && <span style={{ fontSize: 10, ...muted }}> · {fmtWeek(entry.membership.graduated_at.slice(0, 10))}</span>}{entry.membership?.note && <span style={{ fontSize: 10, ...muted }}> · {entry.membership.note}</span>}</span>
                        <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => release(entry.client.id)}>Undo</button>
                      </div>
                    ))}
                  </div>
                )}
                {view.undated.length > 0 && (
                  <div className="card" style={{ padding: 14 }}>
                    <SectionTitle icon={<HelpCircle size={13}/>} title="Can't be placed" detail="No start date in Churn Analysis"/>
                    <p style={{ fontSize: 11, ...muted }}>{view.undated.map(entry => entry.client.name).join(', ')}</p>
                    <p style={{ fontSize: 10, ...muted, marginTop: 6 }}>Add their start date in Churn Analysis, or move them in by hand above.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
