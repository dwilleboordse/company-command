import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { HEALTH_CONFIG, healthCurrentWeek, healthDueWeek, healthScore, healthShiftWeek, healthTrend, isHealthComplete, isHealthEntityActive, isHealthMonday } from '../lib/healthWeekly'
import './HealthAnalytics.css'

const displayDate = value => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const shortDate = value => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const scoreText = value => value === null ? '—' : value.toFixed(1)
const label = entity => entity.full_name || entity.name
const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return <div className="health-chart-tooltip"><strong>{displayDate(row.week)}{row.legacy ? ' · legacy date' : ''}</strong><div>Average: {scoreText(row.average)} / 5</div><div>{row.logged} complete logs · {row.highRisk} high risk</div>{row.partial > 0 && <div>{row.partial} incomplete logs excluded</div>}</div>
}

export default function HealthAnalytics({ kind, entities, entries }) {
  const config = HEALTH_CONFIG[kind]
  const [period, setPeriod] = useState('12')
  const [scope, setScope] = useState('all')
  const [entityId, setEntityId] = useState('all')
  const [department, setDepartment] = useState('all')
  const recordedIds = new Set(entries.map(row => row[config.idKey]))
  const population = entities.filter(entity => isHealthEntityActive(kind, entity) || recordedIds.has(entity.id))
  const nameCounts = new Map()
  population.forEach(entity => nameCounts.set(label(entity).toLowerCase(), (nameCounts.get(label(entity).toLowerCase()) || 0) + 1))
  const scopedEntities = population.filter(entity => (scope === 'all' || isHealthEntityActive(kind, entity) === (scope === 'active'))
    && (department === 'all' || entity.department === department))
  const selectedEntities = scopedEntities.filter(entity => entityId === 'all' || entity.id === entityId)
  const ids = new Set(selectedEntities.map(entity => entity.id))
  const end = healthCurrentWeek()
  const allStart = entries.map(row => row.week_start).filter(Boolean).sort()[0] || healthDueWeek()
  const start = period === 'all' ? allStart : healthShiftWeek(end, -(Number(period) - 1))
  const scopedRows = entries.filter(row => ids.has(row[config.idKey]) && row.week_start >= start && row.week_start <= end)
  const complete = scopedRows.filter(row => isHealthComplete(kind, row))
  const average = complete.length ? complete.reduce((sum, row) => sum + healthScore(kind, row), 0) / complete.length : null
  const highRisk = complete.filter(row => config.risks.slice(2).includes(row[config.riskKey])).length
  const trend = healthTrend(kind, scopedRows, start, end)
  const dimensions = config.fields.map(field => ({ name: field.short, value: complete.length ? complete.reduce((sum, row) => sum + Number(row[field.key]), 0) / complete.length : null }))
  const legacy = scopedRows.filter(row => !isHealthMonday(row.week_start)).length
  const comparison = selectedEntities.map(entity => {
    const rows = complete.filter(row => row[config.idKey] === entity.id).sort((a, b) => b.week_start.localeCompare(a.week_start))
    const latest = rows[0], previous = rows[1]
    return { entity, latest, previous, change: previous ? healthScore(kind, latest) - healthScore(kind, previous) : null }
  }).filter(row => row.latest).sort((a, b) => (a.change ?? Infinity) - (b.change ?? Infinity) || label(a.entity).localeCompare(label(b.entity)))
  const departments = [...new Set(population.map(entity => entity.department).filter(Boolean))].sort()

  return <section className="health-analytics" aria-label={`${config.label} analytics`}>
    <div className="health-analytics-controls">
      <label>Period<select value={period} onChange={event => setPeriod(event.target.value)}><option value="4">Last 4 weeks</option><option value="12">Last 12 weeks</option><option value="26">Last 26 weeks</option><option value="52">Last 52 weeks</option><option value="all">All history</option></select></label>
      <label>Roster<select value={scope} onChange={event => { setScope(event.target.value); setEntityId('all') }}><option value="all">Current and past</option><option value="active">Current only</option><option value="past">Past only</option></select></label>
      {kind === 'team' && <label>Department<select value={department} onChange={event => { setDepartment(event.target.value); setEntityId('all') }}><option value="all">All departments</option>{departments.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>}
      <label>{config.entityLabel}<select value={entityId} onChange={event => setEntityId(event.target.value)}><option value="all">All {kind === 'team' ? 'team members' : 'clients'}</option>{scopedEntities.map(entity => <option key={entity.id} value={entity.id}>{label(entity)}{nameCounts.get(label(entity).toLowerCase()) > 1 ? ` · ${isHealthEntityActive(kind, entity) ? 'Current' : 'Past'} · ${entity.id.slice(-6)}` : ''}</option>)}</select></label>
    </div>
    <p className="health-analytics-note">{displayDate(start)} – {displayDate(end)} · Current week may be incomplete. Scores are on a 1–5 scale; only fully scored logs with a risk level contribute to averages.</p>
    <div className="health-analytics-kpis">
      <div className="card"><span>Complete logs</span><strong>{complete.length}</strong><small>{scopedRows.length - complete.length} incomplete excluded</small></div>
      <div className="card"><span>{kind === 'team' ? 'People' : 'Clients'} reviewed</span><strong>{new Set(complete.map(row => row[config.idKey])).size}</strong><small>Distinct entities with a complete log</small></div>
      <div className="card"><span>Average recorded score</span><strong>{scoreText(average)}</strong><small>Equal weight per complete log</small></div>
      <div className="card"><span>High-risk logs</span><strong>{highRisk}</strong><small>{config.risks.slice(2).join(' or ')} · {complete.length ? `${(highRisk / complete.length * 100).toFixed(0)}% of complete logs` : 'No complete logs'}</small></div>
    </div>
    {legacy > 0 && <p className="health-analytics-note">{legacy} legacy log{legacy === 1 ? '' : 's'} use a non-Monday date. They are shown on their exact saved date and are not merged with another week. The original records remain available in History.</p>}
    {!complete.length ? <div className="card health-analytics-empty">No complete health logs for these filters. Log each category and a risk level to build weekly analytics.</div> : <>
      <div className="card"><h2>Health score over time</h2><p className="health-analytics-note">Average of completed reports on each saved week date. Gaps mean no completed report—not a score of zero. Coverage changes can affect the average.</p>
        <div className="health-analytics-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} accessibilityLayer margin={{ top: 12, right: 22, bottom: 4, left: 0 }}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis type="number" dataKey="timestamp" domain={['dataMin', 'dataMax']} tickFormatter={shortDate} scale="time" tick={{ fill: 'var(--text-muted)', fontSize: 11 }}/><YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} width={30} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}/><Tooltip content={<TrendTooltip/>}/><Line name="Average score" dataKey="average" type="linear" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} connectNulls={false}/></LineChart></ResponsiveContainer></div>
      </div>
      <div className="health-analytics-grid">
        <div className="card"><h2>Reporting volume and risk</h2><p className="health-analytics-note">Complete logs per saved week date; high risk is a subset.</p><div className="health-analytics-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} accessibilityLayer><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="week" tickFormatter={value => shortDate(`${value}T00:00:00Z`)} tick={{ fill: 'var(--text-muted)', fontSize: 10 }}/><YAxis allowDecimals={false} width={30} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle} labelFormatter={value => displayDate(value)}/><Bar name="Complete logs" dataKey="logged" fill="var(--accent)"/><Bar name="High-risk logs" dataKey="highRisk" fill="var(--red)"/></BarChart></ResponsiveContainer></div></div>
        <div className="card"><h2>Category averages</h2><p className="health-analytics-note">Same selected period and completed reports.</p><div className="health-analytics-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={dimensions} layout="vertical" accessibilityLayer margin={{ left: 8, right: 24 }}><CartesianGrid stroke="var(--border)" horizontal={false}/><XAxis type="number" domain={[0, 5]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}/><YAxis type="category" dataKey="name" width={100} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle} formatter={value => [Number(value).toFixed(2), 'Average score']}/><Bar dataKey="value" fill="var(--accent)"/></BarChart></ResponsiveContainer></div></div>
      </div>
      <div className="card"><h2>{kind === 'team' ? 'Team' : 'Client'} changes</h2><p className="health-analytics-note">Latest two completed logs within this period, shown with their dates. A change is not necessarily week over week.</p><div className="health-analytics-table-wrap"><table className="health-analytics-table"><thead><tr><th>{config.entityLabel}</th><th>Latest report</th><th>Score</th><th>Previous report</th><th>Previous score</th><th>Change</th><th>Risk</th></tr></thead><tbody>{comparison.map(({ entity, latest, previous, change }) => <tr key={entity.id}><td>{label(entity)}{!isHealthEntityActive(kind, entity) && <small>Past / inactive</small>}</td><td>{displayDate(latest.week_start)}{!isHealthMonday(latest.week_start) && <small>Legacy date</small>}</td><td>{scoreText(healthScore(kind, latest))}</td><td>{previous ? displayDate(previous.week_start) : '—'}</td><td>{previous ? scoreText(healthScore(kind, previous)) : '—'}</td><td style={{ color: change === null || change === 0 ? undefined : change > 0 ? 'var(--green)' : 'var(--red)' }}>{change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}</td><td>{latest[config.riskKey]}</td></tr>)}</tbody></table></div></div>
    </>}
  </section>
}
