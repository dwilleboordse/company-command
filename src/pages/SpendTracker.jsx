import { Fragment, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getClientStrategistIds, getClientStrategistNames } from '../lib/clientAssignments'
import { dateKey } from '../lib/reportingPeriods'
import { fetchSpendData } from '../lib/spendData'
import { formatSpendMoney, isActiveSpendClient, lastCompletedSpendWeek, shiftSpendWeek, spendInPeriod, spendNumber, spendShare, spendStatus, summarizeSpend, SPEND_PLATFORMS } from '../lib/spendAnalytics'
import { weekLabel } from '../lib/dates'
import SpendAnalytics, { SpendKpi } from '../components/SpendAnalytics'
import SpendLogModal from '../components/SpendLogModal'
import SpendLeaderboard from '../components/SpendLeaderboard'
import '../components/spend.css'

export default function SpendTracker() {
  const { profile, isManagement, isOps } = useAuth()
  const canManage = isManagement || isOps
  // Keep existing page access; creative strategists have a focused roster-assigned view.
  const companyView = canManage || profile?.position !== 'creative_strategist'
  const [params, setParams] = useSearchParams()
  const view = ['weekly', 'monthly', 'analytics', 'leaderboard'].includes(params.get('tab')) ? params.get('tab') : 'weekly'
  const isLeaderboard = view === 'leaderboard'
  const [data, setData] = useState({ clients: [], members: [], entries: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [week, setWeek] = useState(lastCompletedSpendWeek)
  const [month, setMonth] = useState(() => dateKey(new Date()).slice(0, 7))
  const [search, setSearch] = useState('')
  const [strategist, setStrategist] = useState('all')
  const [status, setStatus] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [logging, setLogging] = useState(null)
  const [updating, setUpdating] = useState(null)
  const currentWeek = shiftSpendWeek(lastCompletedSpendWeek(), 1)

  const load = useCallback(async () => {
    try { setData(await fetchSpendData(profile, companyView)); setError('') }
    catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }, [profile, companyView])
  useEffect(() => {
    if (isLeaderboard) return
    let cancelled = false
    fetchSpendData(profile, companyView).then(next => { if (!cancelled) { setData(next); setError('') } })
      .catch(loadError => { if (!cancelled) setError(loadError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [profile, companyView, isLeaderboard])

  async function pauseClient(client, paused) {
    if (!canManage || updating) return
    if (paused && !confirm(`Pause "${client.name}"? It will be hidden from the active tracker. Its spend history will be preserved.`)) return
    setUpdating(client.id)
    const patch = paused ? { is_archived: true } : { is_active: true, is_archived: false }
    try {
      const { data: updated, error: updateError } = await supabase.from('clients').update(patch).eq('id', client.id).select('id,is_active,is_archived').single()
      if (updateError) throw updateError
      if (!updated) throw new Error('Client was not updated. Check your edit permissions.')
      setData(current => ({ ...current, clients: current.clients.map(row => row.id === client.id ? { ...row, ...updated } : row) }))
      setError('')
    } catch (updateError) { setError(`${paused ? 'Pause' : 'Unpause'} failed: ${updateError.message}`) }
    finally { setUpdating(null) }
  }

  const baseClients = data.clients.filter(isActiveSpendClient).filter(client => (!search || client.name.toLowerCase().includes(search.toLowerCase()))
    && (strategist === 'all' || getClientStrategistIds(client).includes(strategist)))
  const pausedClients = data.clients.filter(client => !isActiveSpendClient(client))
  const monthEnd = month ? dateKey(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0)) : ''
  const period = view === 'monthly' ? { start: `${month}-01`, end: monthEnd } : { start: week, end: week }
  const baseIds = new Set(baseClients.map(client => client.id))
  const selectedEntries = spendInPeriod(data.entries.filter(row => baseIds.has(row.client_id)), period)
  const summary = summarizeSpend(selectedEntries)
  const rows = baseClients.map(client => {
    const history = data.entries.filter(entry => entry.client_id === client.id)
    const periodEntries = spendInPeriod(history, period)
    return { client, history, periodEntries, ...summarizeSpend(periodEntries) }
  }).filter(row => status === 'all' || (status === 'unlogged' && (row.entries === 0 || row.incomplete > 0))
    || (status === 'low' && row.share !== null && row.share < 20)
    || (status === 'healthy' && row.share >= 20 && row.share < 50)
    || (status === 'excellent' && row.share >= 50))
    .sort((a, b) => Number(a.completeEntries > 0 && !a.incomplete) - Number(b.completeEntries > 0 && !b.incomplete) || (a.share ?? -1) - (b.share ?? -1) || a.client.name.localeCompare(b.client.name))

  return <>
    <div className="page-header"><h1 className="page-title">Spend Tracker</h1><p className="page-subtitle">Log every Monday for the prior week · track adoption of DDU creatives</p></div>
    <div className="page-body">
      <div className="spend-tabs" role="tablist" aria-label="Spend Tracker views">{[['weekly', 'Weekly logging'], ['monthly', 'Monthly overview'], ['analytics', 'Analytics'], ['leaderboard', 'CS leaderboard']].map(([value, label]) => <button key={value} role="tab" aria-selected={view === value} onClick={() => setParams(value === 'weekly' ? {} : { tab: value })}>{label}</button>)}</div>
      {view !== 'leaderboard' && error && <div role="alert" className="spend-error">{error} <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>}
      {view === 'leaderboard' ? <SpendLeaderboard /> : loading ? <div className="loading-screen" style={{ minHeight: 200, background: 'transparent' }}><div className="spinner" /></div> : error && !data.clients.length ? null : view === 'analytics' ? <SpendAnalytics clients={data.clients} entries={data.entries} members={data.members} canFilterTeam={canManage} /> : <>
        <div className="spend-controls">
          {view === 'weekly' ? <div className="spend-actions"><button className="btn btn-ghost btn-sm" aria-label="Previous logging week" onClick={() => setWeek(shiftSpendWeek(week, -1))}><ChevronLeft size={16} /></button><div><strong>Week of {weekLabel(week)}</strong><div className="spend-kpi-detail">{week === lastCompletedSpendWeek() ? 'Target logging week' : week === currentWeek ? 'Current week · in progress' : 'Historical week'}</div></div><button className="btn btn-ghost btn-sm" aria-label="Next logging week" disabled={week >= currentWeek} onClick={() => setWeek(shiftSpendWeek(week, 1))}><ChevronRight size={16} /></button>{week !== lastCompletedSpendWeek() && <button className="btn btn-ghost btn-sm" onClick={() => setWeek(lastCompletedSpendWeek())}>Latest due week</button>}</div> : <label className="spend-field">Month<input type="month" value={month} max={dateKey(new Date()).slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} /></label>}
          <label className="spend-field">Search clients<input placeholder="Client name…" value={search} onChange={e => setSearch(e.target.value)} /></label>
          {canManage && <label className="spend-field">Creative strategist<select value={strategist} onChange={e => setStrategist(e.target.value)}><option value="all">All strategists</option>{data.members.filter(member => member.position === 'creative_strategist').map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></label>}
          <label className="spend-field">Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="unlogged">Not logged / incomplete</option><option value="low">Low share · below 20%</option><option value="healthy">Healthy · 20–49.9%</option><option value="excellent">Excellent · 50%+</option></select></label>
        </div>
        <div className="spend-kpis"><SpendKpi label="Spend on DDU creatives" value={formatSpendMoney(summary.ddu)} /><SpendKpi label="Total client spend" value={formatSpendMoney(summary.total)} /><SpendKpi label="Weighted DDU share" value={summary.share === null ? '—' : `${summary.share.toFixed(1)}%`} detail="Total DDU spend ÷ total client spend" /><SpendKpi label={view === 'monthly' ? 'Clients with complete entries' : 'Clients logged'} value={`${summary.loggedClients} / ${baseClients.length}`} detail={`${summary.completeEntries} complete weekly entries · ${summary.incomplete} incomplete`} /></div>
        <p className="spend-note">Totals reflect active clients matching the search and strategist filters, before the status filter. Zero spend counts as logged; missing or incomplete entries do not. {view === 'monthly' ? 'Weeks are grouped by their week-start date. A client counts when it has at least one complete weekly entry.' : ''}</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div className="table-wrap"><table className="spend-table"><thead><tr><th>Client / strategist</th><th>DDU spend</th><th>Total spend</th><th>DDU share</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <Fragment key={row.client.id}><tr>
          <td><button className="spend-client-link" aria-expanded={expanded === row.client.id} onClick={() => setExpanded(expanded === row.client.id ? null : row.client.id)}>{row.client.name}</button><div className="spend-kpi-detail">{getClientStrategistNames(row.client, data.members).join(', ') || 'No strategist assigned'}</div></td>
          <td className="spend-money">{formatSpendMoney(row.ddu)}</td><td className="spend-money">{formatSpendMoney(row.total)}</td><td className="spend-money">{row.share === null ? '—' : `${row.share.toFixed(1)}%`}</td><td><span className="spend-chip" style={{ color: row.incomplete ? 'var(--text-muted)' : spendStatus(row.share).color, background: row.incomplete ? 'var(--bg)' : spendStatus(row.share).bg }}>{!row.entries ? 'Not logged' : row.incomplete ? 'Incomplete log' : row.total === 0 ? 'Zero spend logged' : spendStatus(row.share).label}</span>{view === 'monthly' && <div className="spend-kpi-detail">{row.completeEntries} complete weeks{row.incomplete ? ` · ${row.incomplete} incomplete` : ''}</div>}</td>
          <td><div className="spend-actions">{view === 'weekly' && <button className={`btn btn-sm ${row.entries ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setLogging({ client: row.client, existing: row.periodEntries[0], weekStart: week })}>{row.entries ? 'Edit' : 'Log spend'}</button>}<button className="btn btn-ghost btn-sm" onClick={() => setExpanded(expanded === row.client.id ? null : row.client.id)}>History</button>{canManage && <button className="btn btn-ghost btn-sm" title={`Pause ${row.client.name}`} disabled={!!updating} onClick={() => pauseClient(row.client, true)}><Pause size={12} /></button>}</div></td>
        </tr>{expanded === row.client.id && <tr><td colSpan={6} style={{ padding: 0 }}><SpendHistory client={row.client} entries={row.history} onLog={setLogging} /></td></tr>}</Fragment>)}{!rows.length && <tr><td colSpan={6} className="spend-empty">No clients match these filters.</td></tr>}</tbody></table></div></div>
        {!!pausedClients.length && <details className="card spend-paused" style={{ padding: 0 }}><summary>Paused / past clients ({pausedClients.length})</summary><p className="spend-note" style={{ padding: '0 16px' }}>Hidden from active logging totals. History is preserved and included in Analytics when current + past clients are selected.</p><div className="table-wrap"><table className="spend-table"><thead><tr><th>Client</th><th>Last logged</th><th>Saved entries</th><th>Actions</th></tr></thead><tbody>{pausedClients.map(client => {
          const history = data.entries.filter(entry => entry.client_id === client.id)
          return <Fragment key={client.id}><tr><td>{client.name}<div className="spend-kpi-detail">{getClientStrategistNames(client, data.members).join(', ') || 'Unassigned'}</div></td><td>{history[0] ? weekLabel(history[0].week_start) : 'No entries'}</td><td>{history.length}</td><td><div className="spend-actions"><button className="btn btn-ghost btn-sm" onClick={() => setExpanded(expanded === client.id ? null : client.id)}>History</button>{canManage && <button className="btn btn-ghost btn-sm" disabled={!!updating} onClick={() => pauseClient(client, false)}><Play size={12} />{updating === client.id ? 'Updating…' : 'Unpause'}</button>}</div></td></tr>{expanded === client.id && <tr><td colSpan={4} style={{ padding: 0 }}><SpendHistory client={client} entries={history} /></td></tr>}</Fragment>
        })}</tbody></table></div></details>}
      </>}
    </div>
    {logging && <SpendLogModal {...logging} onClose={() => setLogging(null)} onSave={load} />}
  </>
}

function SpendHistory({ client, entries, onLog }) {
  return <div className="spend-history">
    <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>{client.name} · saved weekly history</h3>
    {!entries.length ? <p className="spend-note">No saved spend entries yet.</p> : <div className="table-wrap"><table>
      <thead><tr><th>Week start</th><th>DDU spend</th><th>Total spend</th><th>Share</th><th>Notes / platforms</th>{onLog && <th>Edit</th>}</tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.id}>
        <td>{weekLabel(entry.week_start)}<div className="spend-kpi-detail">{entry.week_start.slice(0, 4)}</div></td>
        <td>{formatSpendMoney(entry.ddu_spend)}</td><td>{formatSpendMoney(entry.total_spend)}</td>
        <td>{spendShare(entry) === null ? '—' : `${spendShare(entry).toFixed(1)}%`}</td>
        <td style={{ whiteSpace: 'normal', minWidth: 220 }}>
          <div>{entry.notes || 'No notes'}</div>
          <details className="spend-platform-history"><summary>Platform breakdown</summary>
            {SPEND_PLATFORMS.some(platform => spendNumber(entry[platform.key]) !== null || spendNumber(entry[platform.totalKey]) !== null) ? <>
              <table><thead><tr><th>Platform</th><th>DDU spend</th><th>Total spend</th></tr></thead><tbody>{SPEND_PLATFORMS.map(platform => <tr key={platform.key}><td>{platform.label}</td><td>{formatSpendMoney(entry[platform.key])}</td><td>{formatSpendMoney(entry[platform.totalKey])}</td></tr>)}</tbody></table>
              <p className="spend-note">Values as saved. Legacy breakdowns may not reconcile with headline totals. Other uses the same recorded amount in both columns; — means not recorded.</p>
            </> : <p className="spend-note">No platform breakdown was saved for this entry.</p>}
          </details>
        </td>
        {onLog && <td><button className="btn btn-ghost btn-sm" onClick={() => onLog({ client, existing: entry, weekStart: entry.week_start })}>Edit</button></td>}
      </tr>)}</tbody>
    </table></div>}
  </div>
}
