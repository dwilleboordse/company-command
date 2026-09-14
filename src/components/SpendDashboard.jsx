import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { weekLabel } from '../lib/dates'
import { fetchSpendData } from '../lib/spendData'
import { hasBusinessDashboardAccess } from '../lib/dashboardAccess'
import { formatSpendMoney, isActiveSpendClient, isCompleteSpendEntry, lastCompletedSpendWeek, shiftSpendWeek, spendInPeriod, spendShare, spendStatus, spendTrend, summarizeSpend } from '../lib/spendAnalytics'
import { SpendKpi } from './SpendAnalytics'
import SpendLogModal from './SpendLogModal'
import './spend.css'

export default function SpendDashboard() {
  const { profile } = useAuth()
  const businessView = hasBusinessDashboardAccess(profile)
  const visible = businessView || profile?.position === 'creative_strategist'
  if (!visible) return null
  return <SpendDashboardContent key={`${profile.id}:${businessView}`} profile={profile} businessView={businessView} />
}

function SpendDashboardContent({ profile, businessView }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [logClient, setLogClient] = useState(null)
  const [showAllClients, setShowAllClients] = useState(false)
  const week = lastCompletedSpendWeek()
  const load = useCallback(async () => {
    try {
      const next = await fetchSpendData(profile, businessView)
      setData(next)
      setError('')
    } catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }, [profile, businessView])
  useEffect(() => {
    let cancelled = false
    fetchSpendData(profile, businessView).then(next => { if (!cancelled) { setData(next); setError('') } })
      .catch(loadError => { if (!cancelled) setError(loadError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [profile, businessView])
  const clients = (data?.clients || []).filter(isActiveSpendClient)
  const ids = new Set(clients.map(client => client.id))
  const entries = (data?.entries || []).filter(row => ids.has(row.client_id))
  const weekEntries = entries.filter(row => row.week_start === week)
  const summary = summarizeSpend(weekEntries)
  const previous = summarizeSpend(entries.filter(row => row.week_start === shiftSpendWeek(week, -1)))
  const rows = clients.map(client => ({ client, entry: weekEntries.find(row => row.client_id === client.id) }))
    .sort((a, b) => Number(isCompleteSpendEntry(a.entry)) - Number(isCompleteSpendEntry(b.entry)) || (spendShare(a.entry) ?? -1) - (spendShare(b.entry) ?? -1) || a.client.name.localeCompare(b.client.name))
  const low = rows.filter(row => spendShare(row.entry) !== null && spendShare(row.entry) < 20).length
  const latestDate = entries[0]?.week_start
  const displayedRows = businessView && !showAllClients ? rows.slice(0, 8) : rows
  const recentPeriod = { start: shiftSpendWeek(week, -11), end: shiftSpendWeek(week, 1) }
  const recentSummary = summarizeSpend(spendInPeriod(data?.entries || [], { ...recentPeriod, end: week }))
  const recentTrend = spendTrend(data?.entries || [], { ...recentPeriod, end: week }, 'week')

  return <section className="card spend-section" aria-label={businessView ? 'Business spend overview' : 'My client spend'}>
    <div className="spend-heading"><div><h2>{businessView ? 'Business spend overview' : 'My client spend'}</h2><p className="spend-note" style={{ marginBottom: 0 }}>Week of {weekLabel(week)} · log the prior week every Monday</p></div><div className="spend-actions"><Link className="btn btn-ghost btn-sm" to="/spend?tab=analytics">Analytics <ArrowUpRight size={13} /></Link><Link className="btn btn-primary btn-sm" to="/spend">Open Spend Tracker <ArrowUpRight size={13} /></Link></div></div>
    {loading ? <div className="spend-empty">Loading spend…</div> : error ? <div role="alert" className="spend-error">{error} <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div> : <>
      <div className="spend-kpis">
        <SpendKpi label="Spend on DDU creatives" value={formatSpendMoney(summary.ddu)} detail="Prior completed week" />
        <SpendKpi label="Total client spend" value={formatSpendMoney(summary.total)} detail={latestDate ? `Latest saved week: ${weekLabel(latestDate)}` : 'No saved spend yet'} />
        <SpendKpi label="Weighted DDU share" value={summary.share === null ? '—' : `${summary.share.toFixed(1)}%`} detail={previous.share !== null ? `Previous week: ${previous.share.toFixed(1)}% (${previous.loggedClients} clients logged)` : 'DDU spend ÷ total spend'} />
        <SpendKpi label="Clients logged" value={`${summary.loggedClients} / ${clients.length}`} detail={`${clients.length - summary.loggedClients} missing / incomplete · ${low} below 20% share`} />
      </div>
      {businessView && <div style={{ marginBottom: 22 }}>
        <div className="spend-heading"><h3>Last 12 completed weeks</h3><span className="spend-note" style={{ margin: 0 }}>DDU {formatSpendMoney(recentSummary.ddu)} · total {formatSpendMoney(recentSummary.total)} · {recentSummary.share === null ? 'No share available' : `${recentSummary.share.toFixed(1)}% weighted share`}</span></div>
        {recentSummary.entries > 0 ? <>
          <div className="spend-chart" style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={recentTrend} margin={{ top: 8, right: 15, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={25} /><YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={formatSpendMoney} width={65} axisLine={false} tickLine={false} domain={[0, 'auto']} />
            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel || ''} formatter={(value, name) => [formatSpendMoney(value), name]} />
            <Line name="Total client spend" dataKey="total" stroke="#64748b" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} /><Line name="Spend on DDU creatives" dataKey="ddu" stroke="#e07850" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
          </LineChart></ResponsiveContainer></div>
          <div className="spend-legend"><span style={{ '--series': '#64748b' }}>Total client spend</span><span style={{ '--series': '#e07850' }}>Spend on DDU creatives</span></div>
        </> : <p className="spend-empty">No spend entries in the last 12 completed weeks.</p>}
        <p className="spend-note">Historical trend includes current and past clients. Gaps are unreported weeks, not zero spend. See Analytics for client and period breakdowns.</p>
      </div>}
      {!clients.length ? <p className="spend-empty">{businessView ? 'No active clients in the roster.' : 'No active clients assigned to you in Client Roster.'}</p> : <>
        {!weekEntries.length && <p className="spend-note">No entries have been saved for this week yet. Missing entries are not counted as zero spend.</p>}
        <div className="table-wrap"><table className="spend-table"><thead><tr><th>Client</th><th>DDU spend</th><th>Total spend</th><th>DDU share</th><th>Status / action</th></tr></thead><tbody>{displayedRows.map(({ client, entry }) => {
          const share = spendShare(entry)
          const complete = isCompleteSpendEntry(entry)
          return <tr key={client.id}><td style={{ fontWeight: 600 }}>{client.name}</td><td className="spend-money">{formatSpendMoney(entry?.ddu_spend)}</td><td className="spend-money">{formatSpendMoney(entry?.total_spend)}</td><td className="spend-money">{share === null ? '—' : `${share.toFixed(1)}%`}</td><td><div className="spend-actions"><span className="spend-chip" style={{ color: !complete ? 'var(--text-muted)' : spendStatus(share).color, background: !complete ? 'var(--bg)' : spendStatus(share).bg }}>{!entry ? 'Not logged' : !complete ? 'Incomplete log' : Number(entry.total_spend) === 0 ? 'Zero spend' : spendStatus(share).label}</span><button className={`btn btn-sm ${complete ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setLogClient(client)}>{entry ? complete ? 'Edit' : 'Complete log' : 'Log spend'}</button></div></td></tr>
        })}</tbody></table></div>
        {businessView && rows.length > 8 && <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowAllClients(value => !value)}>{showAllClients ? 'Show first 8 · missing and low share first' : `Show all ${rows.length} active clients`}</button>}
        <p className="spend-note">Active {businessView ? 'company' : 'assigned'} clients only. Totals reflect saved entries; coverage may differ from the previous week. DDU share measures creative adoption, not revenue or ROAS.</p>
      </>}
    </>}
    {logClient && <SpendLogModal client={logClient} existing={weekEntries.find(row => row.client_id === logClient.id)} weekStart={week} onClose={() => setLogClient(null)} onSave={load} />}
  </section>
}
