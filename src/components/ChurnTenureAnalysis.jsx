import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { analyzeChurnTenure } from '../lib/churnTenure'
import { parseReportingDate } from '../lib/reportingPeriods'

const formatDate = value => parseReportingDate(value)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || '—'

function TenureTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const bucket = payload[0].payload
  return <div className="card" style={{ padding: 12, fontSize: 12 }}>
    <strong>{bucket.label}</strong>
    <div>{bucket.exits} client exits · {bucket.share.toFixed(1)}% of dated exits</div>
  </div>
}

export default function ChurnTenureAnalysis({ clients, records, period }) {
  const analysis = useMemo(() => analyzeChurnTenure(clients, records, period), [clients, records, period])
  const [selection, setSelection] = useState(null)
  // A new reporting period resets the drill-down without an effect-driven render.
  const selectionKey = `${period.start}:${period.end}`
  const selectedMonth = selection?.key === selectionKey ? selection.month : null
  const visibleExits = selectedMonth ? analysis.exits.filter(client => client.month === selectedMonth) : analysis.exits
  const critical = analysis.criticalMonths.map(bucket => bucket.month)

  return <section className="card" style={{ padding: '18px', marginBottom: 24, minWidth: 0 }} aria-labelledby="churn-tenure-title">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <h2 id="churn-tenure-title" style={{ fontSize: 14, fontWeight: 700 }}>When clients churn</h2>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Partnership month at exit · {period.dateLabel}</p>
      </div>
      <a href="/churn-analysis" style={{ fontSize: 11, color: 'var(--accent)' }}>Manage lifecycle dates →</a>
    </div>

    {analysis.exits.length > 0 ? <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Most common exit {critical.length === 1 ? 'month' : 'months'}</div>
          <strong style={{ display: 'block', marginTop: 5, fontSize: 20, color: 'var(--amber)' }}>{critical.map(month => `Month ${month}`).join(', ')}</strong>
          <div style={{ fontSize: 11, marginTop: 3 }}>{analysis.criticalMonths[0].exits} exits{critical.length > 1 ? ' each' : ''} · prioritize retention check-ins</div>
        </div>
        <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Exited in the first 3 months</div>
          <strong style={{ display: 'block', marginTop: 5, fontSize: 20 }}>{analysis.earlyExits} / {analysis.exits.length}</strong>
          <div style={{ fontSize: 11, marginTop: 3 }}>{(analysis.earlyExits / analysis.exits.length * 100).toFixed(1)}% of dated exits in this period</div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: Math.max(340, analysis.buckets.length * 48), height: 245 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analysis.buckets} margin={{ top: 12, right: 10, left: -18, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval={0}/>
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}/>
              <Tooltip content={<TenureTooltip/>}/>
              <Bar dataKey="exits" name="Client exits" maxBarSize={40} radius={[3, 3, 0, 0]}
                onClick={data => setSelection({ key: selectionKey, month: data.month })} cursor="pointer">
                {analysis.buckets.map(bucket => <Cell key={bucket.month} fill={critical.includes(bucket.month) ? 'var(--amber)' : 'var(--accent)'}
                  opacity={selectedMonth && selectedMonth !== bucket.month ? 0.4 : 1}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
        Month 1 starts on the engagement start date; each anniversary starts the next month. Counts show where exits concentrate, not a client’s probability of churning. Paused clients are excluded.
      </p>
      <details style={{ marginTop: 16 }} open={selectedMonth ? true : undefined}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Clients behind the chart ({visibleExits.length})</summary>
        <div style={{ marginTop: 12, marginBottom: 10 }}>
          <label style={{ fontSize: 11 }}>Partnership month{' '}
            <select aria-label="Filter churn clients by partnership month" value={selectedMonth || 'all'} style={{ width: 'auto', marginLeft: 6 }}
              onChange={event => setSelection({ key: selectionKey, month: event.target.value === 'all' ? null : Number(event.target.value) })}>
              <option value="all">All months</option>
              {analysis.buckets.map(bucket => <option key={bucket.month} value={bucket.month}>{bucket.label} ({bucket.exits})</option>)}
            </select>
          </label>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 320 }}>
          <table style={{ width: '100%', fontSize: 11 }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Client</th><th>Started</th><th>Exited</th><th>Partnership month</th></tr></thead>
            <tbody>{visibleExits.map(client => <tr key={client.id}>
              <td>{client.name}</td><td style={{ textAlign: 'center' }}>{formatDate(client.start)}</td><td style={{ textAlign: 'center' }}>{formatDate(client.end)}</td><td style={{ textAlign: 'center' }}>Month {client.month}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </> : <div style={{ padding: '36px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      {analysis.selectedCount ? 'Add valid engagement start dates to analyze these exits.' : 'No dated client exits in this period.'}
    </div>}

    <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
      Coverage: {analysis.exits.length}/{analysis.selectedCount} exits in this period have valid start and end dates.
      {analysis.missingStartCount > 0 && ` ${analysis.missingStartCount} excluded due to missing or invalid start dates.`}
      {analysis.missingEndCount > 0 && ` ${analysis.missingEndCount} past clients have no valid end date and cannot be placed in a period.`}
      {analysis.futureEndCount > 0 && ` ${analysis.futureEndCount} future-dated exits are not counted yet.`}
    </p>
  </section>
}
