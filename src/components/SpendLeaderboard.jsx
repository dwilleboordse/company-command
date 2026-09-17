import { Fragment, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, RefreshCw, Trophy } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { weekLabel } from '../lib/dates'
import { fetchSpendLeaderboardData } from '../lib/spendData'
import { formatSpendMoney } from '../lib/spendAnalytics'
import { buildSpendLeaderboard, resolveLeaderboardPeriod } from '../lib/spendLeaderboard'
import { planToday } from '../lib/planReview'
import './spend.css'
import './SpendLeaderboard.css'

const rollingPeriods = [
  { value: 'week', label: 'Last completed week' },
  { value: '4w', label: 'Last 4 completed weeks' },
  { value: '12w', label: 'Last 12 completed weeks' },
]
const fullPeriods = [
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'ytd', label: 'Year to date' },
]
const shareLabel = value => value === null || value === undefined ? '—' : `${value.toFixed(1)}%`
const exactMoney = value => value === null || value === undefined ? 'No recorded spend' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
const countLabel = (count, singular) => `${count} ${singular}${count === 1 ? '' : 's'}`

function ClientContributions({ row, id }) {
  return <div className="spend-leaderboard-detail" id={id}>
    <h3>Client contributions for {row.name}</h3>
    <p className="spend-note">Amounts below are this strategist’s share of each client’s recorded spend.</p>
    <table className="spend-leaderboard-clients">
      <caption className="spend-leaderboard-sr-only">Client contributions for {row.name}</caption>
      <thead><tr><th scope="col">Client</th><th scope="col">DDU spend</th><th scope="col">Total spend</th><th scope="col">DDU share</th><th scope="col">Reporting</th></tr></thead>
      <tbody>{row.clients.map(client => <tr key={client.id}>
        <th scope="row">{client.name}<span className="spend-leaderboard-subtext">{client.assignmentCount > 1 ? `1/${client.assignmentCount} shared allocation` : 'Sole strategist'}</span></th>
        <td className="spend-money" title={exactMoney(client.ddu)}>{formatSpendMoney(client.ddu)}</td>
        <td className="spend-money" title={exactMoney(client.total)}>{formatSpendMoney(client.total)}</td>
        <td className="spend-money">{shareLabel(client.share)}</td>
        <td>{countLabel(client.completeEntries, 'log')}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function LeaderboardTable({ rows, allRows, compact, ownId, expandedId, onExpand, scopeId, extraOwnRowId }) {
  const maxDdu = Math.max(0, ...allRows.map(row => row.ddu ?? 0))
  return <div className="spend-leaderboard-table-wrap" role="region" aria-label="Strategist spend leaderboard" tabIndex={0}>
    <table className="spend-leaderboard-table">
      <caption className="spend-leaderboard-sr-only">Creative strategist leaderboard. DDU spend and share reflect the selected reporting period and current client assignments.</caption>
      <thead><tr>
        <th scope="col" className="spend-leaderboard-rank">Rank</th><th scope="col">Creative strategist</th>
        <th scope="col">Spend on DDU assets</th><th scope="col" title="DDU spend divided by total client spend, weighted by spend">Weighted DDU share</th><th scope="col">Reporting</th>
        {!compact && <th scope="col"><span className="spend-leaderboard-sr-only">Client details</span></th>}
      </tr></thead>
      <tbody>{rows.map(row => {
        const hasData = row.completeEntries > 0
        const ownRow = row.id === ownId
        const expanded = row.id === expandedId
        const detailId = `${scopeId}-clients-${row.id}`
        return <Fragment key={row.id}>
          <tr className={`${ownRow ? 'spend-leaderboard-own' : ''} ${row.id === extraOwnRowId ? 'spend-leaderboard-extra-own' : ''}`}>
            <td className="spend-leaderboard-rank"><span className={`spend-leaderboard-rank-value${row.rank === 1 ? ' is-leading' : ''}`} title={row.rank ? `Rank ${row.rank}` : 'Unranked'}>{row.rank ?? '—'}</span></td>
            <th scope="row" className="spend-leaderboard-name">{row.name}{ownRow && <span className="spend-leaderboard-you">You</span>}{!hasData && <span className="spend-leaderboard-subtext">No complete logs · unranked</span>}{hasData && row.total === 0 && <span className="spend-leaderboard-subtext">Zero spend recorded · unranked</span>}</th>
            <td className="spend-leaderboard-amount"><span className="spend-money" title={hasData ? exactMoney(row.ddu) : 'No complete spend logs'}>{hasData ? formatSpendMoney(row.ddu) : '—'}</span>
              {hasData && <span className="spend-leaderboard-bar" aria-hidden="true"><span style={{ width: `${maxDdu > 0 ? Math.max(0, Math.min(100, row.ddu / maxDdu * 100)) : 0}%` }} /></span>}
            </td>
            <td className="spend-money">{shareLabel(row.share)}{hasData && row.total > 0 && <span className="spend-leaderboard-subtext" title={exactMoney(row.total)}>{formatSpendMoney(row.total)} total</span>}</td>
            <td className="spend-leaderboard-reporting">{countLabel(row.reportedClients, 'client')}<span className="spend-leaderboard-subtext">{countLabel(row.completeEntries, 'log')}</span></td>
            {!compact && <td><button type="button" className="spend-leaderboard-expand" aria-label={`${expanded ? 'Hide' : 'Show'} client contributions for ${row.name}`} aria-expanded={expanded} aria-controls={detailId} onClick={() => onExpand(expanded ? null : row.id)} disabled={!row.clients.length}>Clients <ChevronDown size={14} aria-hidden="true" className={expanded ? 'is-expanded' : ''} /></button></td>}
          </tr>
          {!compact && expanded && <tr><td colSpan={6} className="spend-leaderboard-detail-cell"><ClientContributions row={row} id={detailId} /></td></tr>}
        </Fragment>
      })}</tbody>
    </table>
  </div>
}

export default function SpendLeaderboard({ compact = false }) {
  const { profile } = useAuth()
  const scopeId = useId()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestVersion, setRequestVersion] = useState(0)
  const [periodKey, setPeriodKey] = useState('4w')
  const [sortBy, setSortBy] = useState('ddu')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchSpendLeaderboardData()
      .then(next => { if (!cancelled) { setData(next); setError('') } })
      .catch(loadError => { if (!cancelled) setError(loadError.message || 'The leaderboard could not be loaded.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [requestVersion])

  const dates = useMemo(() => (data?.entries || []).map(entry => entry.week_start).filter(Boolean).sort(), [data])
  const earliestDate = dates[0]
  const todayKey = planToday()
  const period = useMemo(() => resolveLeaderboardPeriod(periodKey, {
    earliestDate, today: new Date(`${todayKey}T12:00:00+04:00`),
  }), [periodKey, earliestDate, todayKey])
  const leaderboard = useMemo(() => data ? buildSpendLeaderboard({ ...data, period, sortBy }) : null, [data, period, sortBy])
  const rows = leaderboard?.rows || []
  const summary = leaderboard?.summary
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const ownRow = rows.find(row => row.id === profile?.id)
  const topRows = rows.slice(0, 5)
  const extraOwnRow = compact && ownRow && !topRows.some(row => row.id === ownRow.id) ? ownRow : null
  const displayedRows = compact ? [...topRows, ...(extraOwnRow ? [extraOwnRow] : [])] : rows.filter(row => !normalizedSearch || row.name.toLocaleLowerCase().includes(normalizedSearch))
  const currentYear = Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Dubai' }).format(new Date()))
  const years = [...new Set([currentYear, ...dates.map(date => Number(date.slice(0, 4))).filter(year => year <= currentYear)])].sort((a, b) => b - a)
  const periods = compact ? rollingPeriods : [...rollingPeriods, ...fullPeriods, ...years.map(year => ({ value: `year:${year}`, label: `${year}` })), { value: 'all', label: 'All recorded history' }]
  const teamShare = summary?.allocatedTotal > 0 ? summary.allocatedDdu / summary.allocatedTotal * 100 : null
  const hasCompleteData = (summary?.completeEntries || 0) > 0

  function refresh() {
    setLoading(true)
    setError('')
    setRequestVersion(value => value + 1)
  }

  return <section className={`spend-section spend-leaderboard${compact ? ' card spend-leaderboard-compact' : ''}`} aria-labelledby={`${scopeId}-title`} aria-busy={loading}>
    <div className="spend-heading">
      <div><h2 id={`${scopeId}-title`}><Trophy size={20} aria-hidden="true" />Creative strategist leaderboard</h2>{compact && <p className="spend-note spend-leaderboard-intro">Spend allocated to DDU assets across the team</p>}</div>
      <div className="spend-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading} aria-label="Refresh spend leaderboard"><RefreshCw size={13} aria-hidden="true" />Refresh</button>{compact && <Link className="btn btn-ghost btn-sm" to="/spend?tab=leaderboard">Full leaderboard <ArrowUpRight size={13} aria-hidden="true" /></Link>}</div>
    </div>
    <div className="spend-controls spend-leaderboard-controls">
      <label className="spend-field">Leaderboard period<select value={periodKey} onChange={event => { setPeriodKey(event.target.value); setExpandedId(null) }}>{periods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="spend-field">Rank by<select value={sortBy} onChange={event => setSortBy(event.target.value)}><option value="ddu">DDU spend ($)</option><option value="share">Weighted DDU share (%)</option></select></label>
      {!compact && <label className="spend-field spend-leaderboard-search">Find a strategist<input type="search" placeholder="Search names" value={search} onChange={event => setSearch(event.target.value)} /></label>}
    </div>
    <p className="spend-note spend-leaderboard-period">{period.dateLabel} · Dubai time{compact && rows.length > 5 ? ` · Top 5${extraOwnRow ? ', plus your position' : ' strategists'}` : ''}</p>
    {loading ? <div className="spend-empty" role="status">Loading the leaderboard…</div> : error ? <div role="alert" className="spend-error">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>Retry</button></div> : <>
      {!compact && summary && <div className="spend-kpis spend-leaderboard-kpis">
        <div className="spend-kpi"><div className="spend-kpi-label">Team-allocated DDU spend</div><div className="spend-kpi-value" title={hasCompleteData ? exactMoney(summary.allocatedDdu) : 'No complete logs in this period'}>{hasCompleteData ? formatSpendMoney(summary.allocatedDdu) : '—'}</div><div className="spend-kpi-detail">Attributed to active creative strategists</div></div>
        <div className="spend-kpi"><div className="spend-kpi-label">Team weighted DDU share</div><div className="spend-kpi-value">{shareLabel(teamShare)}</div><div className="spend-kpi-detail">Team DDU spend ÷ team total spend</div></div>
        <div className="spend-kpi"><div className="spend-kpi-label">Complete logs · all clients</div><div className="spend-kpi-value">{summary.completeEntries}</div><div className="spend-kpi-detail">{summary.latestWeek ? `Latest: ${weekLabel(summary.latestWeek)}` : 'No complete logs in this period'} · {countLabel(summary.reportingClients, 'client')}</div></div>
      </div>}
      {!rows.length ? <div className="spend-empty">No active creative strategists are available in the team roster.</div> : <>
        {!hasCompleteData && <div className="spend-leaderboard-notice">No complete spend logs in this period yet. Strategists remain unranked until spend is recorded.</div>}
        {displayedRows.length ? <LeaderboardTable rows={displayedRows} allRows={rows} compact={compact} ownId={profile?.id} expandedId={expandedId} onExpand={setExpandedId} scopeId={scopeId} extraOwnRowId={extraOwnRow?.id} /> : <div className="spend-empty">No strategists match “{search}”. <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>Clear search</button></div>}
        {!compact && normalizedSearch && <p className="spend-note">Showing {displayedRows.length} of {rows.length} strategists. Ranks and summary totals remain team-wide.</p>}
      </>}
      <p className="spend-note spend-leaderboard-caveat">Current roster ownership; shared clients split equally per strategist. Spend share measures adoption, not ROAS.</p>
      {!compact && summary && <details className="spend-leaderboard-methods"><summary>How ranking and reporting work</summary>
        <p>Ranked by {sortBy === 'ddu' ? 'recorded spend on DDU assets' : 'weighted DDU spend share'} for the selected period. Equal values share the same rank, comparing dollars to the cent or share to 0.1 percentage point. No complete logs or zero total client spend means unranked; recorded zero spend is kept as zero. Larger client budgets can produce higher DDU spend without a higher DDU share.</p>
        <p>Source: saved Spend Tracker weekly logs and current Client Roster assignments. All recorded client history is included, including paused and past clients. Historical spend uses current ownership, not the strategist assigned at the time. Spend is split across all assigned strategists; shares belonging to inactive or unavailable people are not redistributed.</p>
        <p>DDU share is allocated DDU spend divided by allocated total client spend, not an average of client percentages. Amounts use the tracker’s existing USD convention, without currency conversion. Weeks belong to the period containing their week-start date; calendar periods may be partial.</p>
        <dl className="spend-leaderboard-quality">
          <div><dt>Unattributed DDU spend</dt><dd title={hasCompleteData ? exactMoney(summary.unattributedDdu) : 'No complete logs'}>{hasCompleteData ? formatSpendMoney(summary.unattributedDdu) : '—'}</dd></div>
          <div><dt>Unattributed total spend</dt><dd title={hasCompleteData ? exactMoney(summary.unattributedTotal) : 'No complete logs'}>{hasCompleteData ? formatSpendMoney(summary.unattributedTotal) : '—'}</dd></div>
          <div><dt>Incomplete logs excluded</dt><dd>{summary.incompleteEntries}</dd></div>
          <div><dt>Duplicate logs excluded</dt><dd>{summary.duplicateEntries}</dd></div>
        </dl>
        <p>Reporting counts are distinct clients and complete client-week logs per strategist. Shared logs appear under each assigned strategist, so row log counts are not additive. The summary counts each saved client-week once.</p>
      </details>}
    </>}
  </section>
}
