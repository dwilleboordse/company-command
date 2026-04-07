import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { Plus, ChevronDown, ChevronUp, Edit2 } from 'lucide-react'

function getMonday(d = new Date()) {
  const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const m = new Date(d); m.setDate(diff); m.setHours(0,0,0,0); return m
}
function fmt(d) { return d instanceof Date ? d.toISOString().split('T')[0] : d }
function weekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const end = new Date(d); end.setDate(d.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${d.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}
function weekNum(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)
}
function getStatus(pct) {
  if (pct >= 50) return { label: 'Excellent', color: 'var(--green)', bg: 'var(--green-dim)' }
  if (pct >= 20) return { label: 'Healthy', color: 'var(--amber)', bg: 'var(--amber-dim)' }
  return { label: 'At Risk', color: 'var(--red)', bg: 'var(--red-dim)' }
}
function fmtMoney(n) {
  if (!n) return '—'
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n/1000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

function LogModal({ client, existing, weekStart, onClose, onSave }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    ddu_spend: existing?.ddu_spend || '',
    total_spend: existing?.total_spend || '',
    notes: existing?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const pct = form.total_spend > 0 ? ((form.ddu_spend / form.total_spend) * 100).toFixed(1) : null
  const status = pct !== null ? getStatus(parseFloat(pct)) : null

  async function handleSave() {
    if (!form.total_spend) return
    setSaving(true)
    await supabase.from('spend_entries').upsert({
      client_id: client.id,
      week_start: weekStart,
      ddu_spend: parseFloat(form.ddu_spend) || 0,
      total_spend: parseFloat(form.total_spend) || 0,
      notes: form.notes,
      entered_by: profile?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,week_start' })
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{client.name}</h2>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 18 }}>
          W{weekNum(weekStart)} · {weekLabel(weekStart)}
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>DDU Ad Spend ($)</label>
            <input type="number" value={form.ddu_spend} onChange={e => setForm({ ...form, ddu_spend: e.target.value })} placeholder="0" />
          </div>
          <div className="form-group">
            <label>Total Ad Spend ($)</label>
            <input type="number" value={form.total_spend} onChange={e => setForm({ ...form, total_spend: e.target.value })} placeholder="0" autoFocus />
          </div>
        </div>

        {pct !== null && (
          <div style={{ padding: '12px 16px', borderRadius: 'var(--radius)', background: status.bg, border: `1px solid ${status.color}`, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: status.color }}>{pct}%</div>
              <div style={{ fontSize: 10, color: status.color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>DDU share of total</div>
            </div>
            <span style={{ padding: '4px 12px', borderRadius: 100, background: status.bg, color: status.color, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', border: `1px solid ${status.color}` }}>
              {status.label}
            </span>
          </div>
        )}

        <div className="form-group">
          <label>Notes (optional)</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Platform breakdown, context..." style={{ resize: 'vertical' }} />
        </div>

        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function ClientSpendCard({ client, entries, weekStart, onLog }) {
  const [expanded, setExpanded] = useState(false)
  const thisWeek = entries?.find(e => e.week_start === weekStart)
  const pct = thisWeek?.total_spend > 0 ? ((thisWeek.ddu_spend / thisWeek.total_spend) * 100).toFixed(1) : null
  const status = pct !== null ? getStatus(parseFloat(pct)) : null

  const chartData = entries?.slice().reverse().map(e => {
    const p = e.total_spend > 0 ? parseFloat(((e.ddu_spend / e.total_spend) * 100).toFixed(1)) : 0
    return { week: `W${weekNum(e.week_start)}`, pct: p, ddu: e.ddu_spend, total: e.total_spend }
  })

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderLeft: `4px solid ${status?.color || 'var(--border)'}`, cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>{client.name}</div>
              {thisWeek && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                  DDU {fmtMoney(thisWeek.ddu_spend)} / Total {fmtMoney(thisWeek.total_spend)}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pct !== null ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: status.color }}>{pct}%</div>
                <div style={{ fontSize: 10, color: status.color, fontFamily: 'var(--font-mono)' }}>{status.label}</div>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>No data</span>
            )}
            <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onLog(client, thisWeek) }} style={{ fontSize: 11 }}>
              {thisWeek ? <><Edit2 size={11} /> Update</> : '+ Log'}
            </button>
            {expanded ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
          </div>
        </div>

        {/* Reference lines */}
        {pct !== null && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {/* DDU bar */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                <span>DDU SHARE</span><span>{pct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '20%', top: 0, bottom: 0, width: 1, background: 'rgba(245,158,11,0.4)' }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(34,197,94,0.4)' }} />
                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: status.color, borderRadius: 3, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                <span>0%</span><span style={{ color: 'var(--amber)' }}>20%</span><span style={{ color: 'var(--green)' }}>50%</span><span>100%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {expanded && entries?.length > 0 && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div className="card-label mb-3">Weekly History</div>
          {chartData?.length > 1 ? (
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="week" tick={{ fill: '#3d526e', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#3d526e', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: '#0e1420', border: '1px solid #1e2d47', borderRadius: 8, fontSize: 11 }}
                  formatter={(val, name) => [`${val}%`, 'DDU Share']}
                  labelFormatter={label => label}
                />
                <ReferenceLine y={20} stroke="var(--amber)" strokeDasharray="4 4" strokeOpacity={0.6} />
                <ReferenceLine y={50} stroke="var(--green)" strokeDasharray="4 4" strokeOpacity={0.6} />
                <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={getStatus(entry.pct).color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-muted text-sm">Log at least 2 weeks to see trend.</p>}

          {/* Table */}
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Dates</th>
                  <th>DDU Spend</th>
                  <th>Total Spend</th>
                  <th>DDU %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const p = e.total_spend > 0 ? ((e.ddu_spend / e.total_spend) * 100).toFixed(1) : null
                  const s = p !== null ? getStatus(parseFloat(p)) : null
                  const isThisWeek = e.week_start === weekStart
                  return (
                    <tr key={e.id} style={{ background: isThisWeek ? 'rgba(59,130,246,0.04)' : undefined }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        W{weekNum(e.week_start)} {isThisWeek && <span className="badge blue" style={{ fontSize: 9, marginLeft: 4 }}>this week</span>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{weekLabel(e.week_start)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMoney(e.ddu_spend)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMoney(e.total_spend)}</td>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: s?.color }}>
                        {p !== null ? `${p}%` : '—'}
                      </td>
                      <td>
                        {s && <span style={{ padding: '2px 8px', borderRadius: 100, fontSize: 10, fontFamily: 'var(--font-mono)', background: s.bg, color: s.color }}>{s.label}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SpendTracker() {
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [logClient, setLogClient] = useState(null)
  const [logExisting, setLogExisting] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const weekStart = fmt(getMonday())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: clientData } = await supabase.from('clients').select('*').eq('is_active', true).order('name')
    setClients(clientData || [])

    if (clientData?.length) {
      const { data: entryData } = await supabase.from('spend_entries').select('*')
        .in('client_id', clientData.map(c => c.id))
        .order('week_start', { ascending: false })
      const map = {}
      entryData?.forEach(e => {
        if (!map[e.client_id]) map[e.client_id] = []
        map[e.client_id].push(e)
      })
      setEntries(map)
    }
    setLoading(false)
  }

  function handleLog(client, existing) {
    setLogClient(client)
    setLogExisting(existing || null)
  }

  // Summary stats for this week
  const thisWeekEntries = clients.map(c => entries[c.id]?.find(e => e.week_start === weekStart)).filter(Boolean)
  const totalDDU = thisWeekEntries.reduce((s, e) => s + (e.ddu_spend || 0), 0)
  const totalAll = thisWeekEntries.reduce((s, e) => s + (e.total_spend || 0), 0)
  const avgPct = thisWeekEntries.length ? (thisWeekEntries.reduce((s, e) => s + (e.total_spend > 0 ? (e.ddu_spend / e.total_spend) * 100 : 0), 0) / thisWeekEntries.length).toFixed(1) : null
  const atRisk = thisWeekEntries.filter(e => e.total_spend > 0 && (e.ddu_spend / e.total_spend) < 0.2).length
  const logged = thisWeekEntries.length

  let filtered = clients.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    const e = entries[c.id]?.find(x => x.week_start === weekStart)
    const p = e?.total_spend > 0 ? (e.ddu_spend / e.total_spend) * 100 : null
    if (statusFilter === 'atrisk') return p !== null && p < 20
    if (statusFilter === 'healthy') return p !== null && p >= 20 && p < 50
    if (statusFilter === 'excellent') return p !== null && p >= 50
    if (statusFilter === 'unlogged') return !e
    return true
  })

  // Sort: unlogged last, then by status (at risk first)
  filtered = filtered.sort((a, b) => {
    const ea = entries[a.id]?.find(e => e.week_start === weekStart)
    const eb = entries[b.id]?.find(e => e.week_start === weekStart)
    const pa = ea?.total_spend > 0 ? (ea.ddu_spend / ea.total_spend) * 100 : null
    const pb = eb?.total_spend > 0 ? (eb.ddu_spend / eb.total_spend) * 100 : null
    if (pa === null && pb !== null) return 1
    if (pb === null && pa !== null) return -1
    if (pa !== null && pb !== null) return pa - pb
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Spend Tracker</h1>
            <p className="page-subtitle">DDU vs total ad spend — W{weekNum(weekStart)} · {weekLabel(weekStart)}</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Summary */}
        <div className="stat-row">
          <div className="stat-box">
            <div className="stat-box-label">DDU Spend (This Week)</div>
            <div className="stat-box-value text-accent">{fmtMoney(totalDDU)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Total Spend</div>
            <div className="stat-box-value">{fmtMoney(totalAll)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Avg DDU %</div>
            <div className="stat-box-value" style={{ color: avgPct !== null ? getStatus(parseFloat(avgPct)).color : 'var(--text-muted)' }}>
              {avgPct !== null ? `${avgPct}%` : '—'}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">At Risk</div>
            <div className="stat-box-value text-red">{atRisk}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Logged</div>
            <div className="stat-box-value">{logged}/{clients.length}</div>
          </div>
        </div>

        {/* Legend */}
        <div className="card mb-4" style={{ padding: '12px 16px' }}>
          <div className="flex items-center gap-4 flex-wrap">
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>DDU % thresholds:</span>
            {[
              { label: 'At Risk', sub: '< 20%', color: 'var(--red)', bg: 'var(--red-dim)' },
              { label: 'Healthy', sub: '20–50%', color: 'var(--amber)', bg: 'var(--amber-dim)' },
              { label: 'Excellent', sub: '≥ 50%', color: 'var(--green)', bg: 'var(--green-dim)' },
            ].map(t => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '2px 10px', borderRadius: 100, background: t.bg, color: t.color, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{t.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <div className="tabs" style={{ border: 'none', marginBottom: 0 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'atrisk', label: '🔴 At Risk' },
              { key: 'healthy', label: '🟡 Healthy' },
              { key: 'excellent', label: '🟢 Excellent' },
              { key: 'unlogged', label: 'Not Logged' },
            ].map(f => (
              <button key={f.key} className={`tab ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client..."
            style={{ width: 'auto', marginLeft: 'auto', fontSize: 12, padding: '7px 12px' }}
          />
        </div>

        {loading ? (
          <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(client => (
              <ClientSpendCard
                key={client.id}
                client={client}
                entries={entries[client.id] || []}
                weekStart={weekStart}
                onLog={handleLog}
              />
            ))}
            {filtered.length === 0 && (
              <div className="empty-state"><p>No clients match this filter.</p></div>
            )}
          </div>
        )}
      </div>

      {logClient && (
        <LogModal
          client={logClient}
          existing={logExisting}
          weekStart={weekStart}
          onClose={() => { setLogClient(null); setLogExisting(null) }}
          onSave={load}
        />
      )}
    </>
  )
}
