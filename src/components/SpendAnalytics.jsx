import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getPeriodOptions, resolvePeriod } from '../lib/reportingPeriods'
import { getClientStrategistIds, getClientStrategistNames } from '../lib/clientAssignments'
import { compareSpendClients, formatSpendMoney, isActiveSpendClient, spendClientOptionLabels, spendInPeriod, spendStatus, spendTrend, summarizeSpend } from '../lib/spendAnalytics'
import './spend.css'

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }
const tickStyle = { fill: 'var(--text-muted)', fontSize: 11 }
const shareLabel = value => value === null || value === undefined ? '—' : `${value.toFixed(1)}%`

export default function SpendAnalytics({ clients, entries, members = [], canFilterTeam = false, initialPeriod = '12w' }) {
  const [periodKey, setPeriodKey] = useState(initialPeriod)
  const [grain, setGrain] = useState('week')
  const [clientId, setClientId] = useState('all')
  const [clientStatus, setClientStatus] = useState('all')
  const [strategist, setStrategist] = useState('all')
  const [metric, setMetric] = useState('spend')
  const dates = useMemo(() => entries.map(row => row.week_start).sort(), [entries])
  const clientLabels = useMemo(() => spendClientOptionLabels(clients), [clients])
  const period = resolvePeriod(periodKey, { earliestDate: dates[0] })
  const eligibleClients = clients.filter(client => (clientStatus === 'all' || (clientStatus === 'active') === isActiveSpendClient(client))
    && (strategist === 'all' || getClientStrategistIds(client).includes(strategist)))
  const selectedClients = eligibleClients.filter(client => clientId === 'all' || client.id === clientId)
  const allowed = new Set(selectedClients.map(client => client.id))
  const selectedEntries = entries.filter(row => allowed.has(row.client_id))
  const periodEntries = spendInPeriod(selectedEntries, period)
  const summary = summarizeSpend(periodEntries)
  const trends = spendTrend(selectedEntries, period, grain)
  const clientRows = compareSpendClients(selectedClients, selectedEntries, period)
  const ranked = clientRows.filter(row => row.total !== null).slice(0, 10).map(row => ({ name: row.client.name, total: row.total, ddu: row.ddu }))
  const lowShare = clientRows.filter(row => row.share !== null && row.share < 20).length
  const unlogged = clientRows.filter(row => row.entries === 0).length
  const visibleStrategists = members.filter(member => member.position === 'creative_strategist')

  return <section className="spend-section" aria-label="Spend analytics">
    <div className="spend-controls">
      <label className="spend-field">Analytics period<select value={periodKey} onChange={e => setPeriodKey(e.target.value)}>{getPeriodOptions(dates).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="spend-field">Client status<select value={clientStatus} onChange={e => { setClientStatus(e.target.value); setClientId('all') }}><option value="all">Current + past clients</option><option value="active">Active clients</option><option value="past">Paused / past clients</option></select></label>
      {canFilterTeam && <label className="spend-field">Creative strategist<select value={strategist} onChange={e => { setStrategist(e.target.value); setClientId('all') }}><option value="all">All strategists</option>{visibleStrategists.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></label>}
      <label className="spend-field">Client<select value={clientId} onChange={e => setClientId(e.target.value)}><option value="all">All clients in view</option>{eligibleClients.map(client => <option key={client.id} value={client.id}>{clientLabels.get(client.id)}</option>)}</select></label>
      {(clientId !== 'all' || clientStatus !== 'all' || strategist !== 'all') && <button className="btn btn-ghost btn-sm" onClick={() => { setClientId('all'); setClientStatus('all'); setStrategist('all') }}>Reset clients</button>}
    </div>
    <p className="spend-note">{period.dateLabel} · {selectedClients.length} roster clients in view. Weekly entries are assigned to the month of their week-start date; current periods may be incomplete.</p>
    <div className="spend-kpis">
      <SpendKpi label="Spend on DDU creatives" value={formatSpendMoney(summary.ddu)} detail="Recorded media spend, not agency revenue" />
      <SpendKpi label="Total client spend" value={formatSpendMoney(summary.total)} detail={`${summary.entries} weekly entries`} />
      <SpendKpi label="Weighted DDU share" value={shareLabel(summary.share)} detail="Total DDU spend ÷ total client spend" />
      <SpendKpi label="Clients with entries" value={`${summary.clients} / ${selectedClients.length}`} detail={`${lowShare} below 20% share · ${unlogged} with no entries`} />
    </div>
    {summary.incomplete > 0 && <p className="spend-error">{summary.incomplete} incomplete entries are excluded from the share calculation. Totals include each known amount.</p>}
    {!periodEntries.length ? <div className="card spend-empty">No spend entries in this selection. Choose a different period or client.</div> : <>
      <div className="spend-chart-grid">
        <div className="card spend-chart-panel">
          <div className="spend-heading"><h3>{metric === 'spend' ? 'Spend over time' : 'DDU share over time'}</h3><div className="spend-actions">
            <select aria-label="Trend metric" value={metric} onChange={e => setMetric(e.target.value)}><option value="spend">Spend ($)</option><option value="share">DDU share (%)</option></select>
            <select aria-label="Trend interval" value={grain} onChange={e => setGrain(e.target.value)}><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></select>
          </div></div>
          <div className="spend-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={trends} margin={{ top: 8, right: 12, left: 0, bottom: 8 }} accessibilityLayer>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} minTickGap={25} />
            <YAxis tick={tickStyle} width={62} axisLine={false} tickLine={false} domain={metric === 'share' ? [0, dataMax => Math.max(100, dataMax)] : [0, 'auto']} tickFormatter={metric === 'share' ? value => `${value}%` : formatSpendMoney} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel || ''} formatter={(value, name) => [metric === 'share' ? shareLabel(value) : formatSpendMoney(value), name]} />
            {metric === 'spend' ? <><Line name="Total client spend" dataKey="total" stroke="#64748b" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} /><Line name="Spend on DDU creatives" dataKey="ddu" stroke="#e07850" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} /></> : <Line name="Weighted DDU share" dataKey="share" stroke="#e07850" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />}
          </LineChart></ResponsiveContainer></div>
          <div className="spend-legend">{metric === 'spend' ? <><span style={{ '--series': '#64748b' }}>Total client spend</span><span style={{ '--series': '#e07850' }}>Spend on DDU creatives</span></> : <span style={{ '--series': '#e07850' }}>Weighted DDU share</span>}</div>
          <p className="spend-note">Gaps mean no recorded data, not zero spend. DDU spend is included in total spend.</p>
        </div>
        <div className="card spend-chart-panel">
          <div className="spend-heading"><h3>Spend by client</h3></div>
          <div className="spend-chart" style={{ height: Math.max(250, ranked.length * 38) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={ranked} layout="vertical" margin={{ top: 0, right: 14, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid stroke="var(--border)" horizontal={false} /><XAxis type="number" tick={tickStyle} tickFormatter={formatSpendMoney} /><YAxis type="category" dataKey="name" width={110} tick={tickStyle} /><Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatSpendMoney(value), name]} />
            <Bar name="Total client spend" dataKey="total" fill="#64748b" radius={[0, 3, 3, 0]} /><Bar name="Spend on DDU creatives" dataKey="ddu" fill="#e07850" radius={[0, 3, 3, 0]} />
          </BarChart></ResponsiveContainer></div>
          <p className="spend-note">{clientRows.length > 10 ? 'Top 10 by recorded total spend. All clients are listed below.' : 'Comparison for the selected period.'}</p>
        </div>
      </div>
    </>}
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="spend-heading" style={{ padding: '18px 18px 0' }}><h3>Client performance & follow-up</h3>{clientId !== 'all' && <button className="btn btn-ghost btn-sm" onClick={() => setClientId('all')}>Back to all clients</button>}</div>
      <div className="table-wrap"><table className="spend-table"><thead><tr><th>Client / strategist</th><th>DDU spend</th><th>Total spend</th><th>DDU share</th><th>Weeks recorded</th><th>Review signal</th></tr></thead><tbody>
        {clientRows.map(row => <tr key={row.client.id}>
          <td><button className="spend-client-link" title={`View analytics for ${row.client.name}`} onClick={() => setClientId(row.client.id)}>{row.client.name}</button><div className="spend-kpi-detail">{getClientStrategistNames(row.client, members).join(', ') || 'Unassigned'}{!isActiveSpendClient(row.client) ? ' · Paused / past' : ''}</div></td>
          <td className="spend-money">{formatSpendMoney(row.ddu)}</td><td className="spend-money">{formatSpendMoney(row.total)}</td><td className="spend-money">{shareLabel(row.share)}</td><td>{row.entries}</td>
          <td>{!row.entries ? <span className="spend-chip">No entries in period</span> : row.total === 0 ? <span className="spend-chip">Zero spend recorded</span> : <span className="spend-chip" style={{ color: spendStatus(row.share).color, background: spendStatus(row.share).bg }}>{row.share !== null && row.share < 20 ? 'Review creative adoption' : spendStatus(row.share).label}</span>}</td>
        </tr>)}
        {!clientRows.length && <tr><td colSpan={6} className="spend-empty">No clients in this selection.</td></tr>}
      </tbody></table></div>
    </div>
    <details style={{ marginTop: 16 }}><summary className="spend-note" style={{ cursor: 'pointer' }}>How to read these numbers</summary><p className="spend-note">Source: saved Spend Tracker weekly entries, linked to Client Roster. Amounts use the tracker’s existing USD convention; no currency conversion is applied. DDU share is the sum of DDU spend divided by the sum of total spend, not the average of client percentages. Existing thresholds are below 20% (low), 20–49.9% (healthy), and 50%+ (excellent). Share measures creative adoption, not ROAS, profitability, or revenue. Paused clients’ historical spend is included when “Current + past clients” is selected. Strategist and active/past filters use current roster assignments/status, not historical ownership.</p></details>
  </section>
}

export function SpendKpi({ label, value, detail }) {
  return <div className="spend-kpi"><div className="spend-kpi-label">{label}</div><div className="spend-kpi-value">{value}</div>{detail && <div className="spend-kpi-detail">{detail}</div>}</div>
}
