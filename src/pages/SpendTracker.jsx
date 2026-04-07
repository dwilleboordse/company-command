import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { ChevronDown, ChevronUp, Edit2, UserCircle } from 'lucide-react'

const PLATFORMS = [
  { key: 'meta_spend', label: 'Meta', color: '#3b82f6' },
  { key: 'tiktok_spend', label: 'TikTok', color: '#f43f5e' },
  { key: 'applovin_spend', label: 'AppLovin', color: '#8b5cf6' },
  { key: 'other_spend', label: 'Other', color: '#6b7280' },
]

function getMonday(d = new Date()) {
  const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const m = new Date(d); m.setDate(diff); m.setHours(0, 0, 0, 0); return m
}
function fmt(d) { return d instanceof Date ? d.toISOString().split('T')[0] : d }
function weekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00'), end = new Date(d)
  end.setDate(d.getDate() + 6)
  const o = { month: 'short', day: 'numeric' }
  return `${d.toLocaleDateString('en-US', o)} – ${end.toLocaleDateString('en-US', o)}`
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
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${Number(n).toLocaleString()}`
}
function initials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
}

// ── ASSIGN CS MODAL ────────────────────────────────────────
function AssignCSModal({ client, members, onClose, onSave }) {
  const [selected, setSelected] = useState(client.assigned_cs_id || '')
  const [saving, setSaving] = useState(false)
  const cs = members.filter(m => m.position === 'creative_strategist')

  async function handleSave() {
    setSaving(true)
    await supabase.from('clients').update({ assigned_cs_id: selected || null }).eq('id', client.id)
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Assign Creative Strategist</h2>
        <p className="text-secondary text-sm mb-4">{client.name}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          <div
            onClick={() => setSelected('')}
            style={{ padding: '10px 14px', borderRadius: 'var(--radius)', border: `2px solid ${!selected ? 'var(--accent)' : 'var(--border)'}`, background: !selected ? 'var(--accent-dim)' : 'var(--bg-input)', cursor: 'pointer', fontSize: 13, color: !selected ? 'var(--accent)' : 'var(--text-muted)' }}>
            — Unassigned
          </div>
          {cs.map(m => (
            <div key={m.id} onClick={() => setSelected(m.id)}
              style={{ padding: '10px 14px', borderRadius: 'var(--radius)', border: `2px solid ${selected === m.id ? 'var(--accent)' : 'var(--border)'}`, background: selected === m.id ? 'var(--accent-dim)' : 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>{initials(m.full_name)}</div>
              <span style={{ fontSize: 13, fontWeight: 500, color: selected === m.id ? 'var(--accent)' : 'var(--text-primary)' }}>{m.full_name}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Assign'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── LOG MODAL ───────────────────────────────────────────────
function LogModal({ client, existing, weekStart, csName, onClose, onSave }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    ddu_spend: existing?.ddu_spend || '',
    total_spend: existing?.total_spend || '',
    meta_spend: existing?.meta_spend || '',
    tiktok_spend: existing?.tiktok_spend || '',
    applovin_spend: existing?.applovin_spend || '',
    other_spend: existing?.other_spend || '',
    notes: existing?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [autoSum, setAutoSum] = useState(true)

  // Auto-sum DDU from platforms
  const platformSum = PLATFORMS.reduce((s, p) => s + (parseFloat(form[p.key]) || 0), 0)
  const dduDisplay = autoSum && platformSum > 0 ? platformSum : parseFloat(form.ddu_spend) || 0
  const pct = form.total_spend > 0 ? ((dduDisplay / form.total_spend) * 100).toFixed(1) : null
  const status = pct !== null ? getStatus(parseFloat(pct)) : null

  // When any platform changes and autoSum is on, update ddu_spend display
  useEffect(() => {
    if (autoSum && platformSum > 0) {
      setForm(f => ({ ...f, ddu_spend: platformSum.toString() }))
    }
  }, [form.meta_spend, form.tiktok_spend, form.applovin_spend, form.other_spend])

  async function handleSave() {
    if (!form.total_spend) return
    setSaving(true)
    await supabase.from('spend_entries').upsert({
      client_id: client.id,
      week_start: weekStart,
      ddu_spend: dduDisplay,
      total_spend: parseFloat(form.total_spend) || 0,
      meta_spend: parseFloat(form.meta_spend) || 0,
      tiktok_spend: parseFloat(form.tiktok_spend) || 0,
      applovin_spend: parseFloat(form.applovin_spend) || 0,
      other_spend: parseFloat(form.other_spend) || 0,
      notes: form.notes,
      entered_by: profile?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,week_start' })
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="modal-title" style={{ marginBottom: 0 }}>{client.name}</h2>
          {pct !== null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: status.color }}>{pct}%</div>
              <div style={{ fontSize: 10, color: status.color, fontFamily: 'var(--font-mono)' }}>{status.label}</div>
            </div>
          )}
        </div>
        {csName && <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>CS: {csName} · W{weekNum(weekStart)} · {weekLabel(weekStart)}</p>}

        {/* Platform spend */}
        <div className="card-label" style={{ marginBottom: 10 }}>Platform Spend (optional — DDU assets only)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {PLATFORMS.map(p => (
            <div key={p.key}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                {p.label} ($)
              </label>
              <input
                type="number"
                value={form[p.key]}
                onChange={e => setForm({ ...form, [p.key]: e.target.value })}
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {platformSum > 0 && (
          <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Platform total (DDU spend)</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmtMoney(platformSum)}</span>
          </div>
        )}

        {/* Manual DDU override */}
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>DDU Total Ad Spend ($)</span>
            {platformSum > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => setAutoSum(!autoSum)}>
                {autoSum ? 'Auto-summed from platforms' : 'Enter manually'}
              </span>
            )}
          </label>
          <input
            type="number"
            value={autoSum && platformSum > 0 ? platformSum : form.ddu_spend}
            onChange={e => { setAutoSum(false); setForm({ ...form, ddu_spend: e.target.value }) }}
            placeholder="0"
            style={{ background: autoSum && platformSum > 0 ? 'rgba(59,130,246,0.06)' : undefined, borderColor: autoSum && platformSum > 0 ? 'var(--accent)' : undefined }}
          />
        </div>

        <div className="form-group">
          <label>Total Ad Spend — All Channels ($) <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span></label>
          <input type="number" value={form.total_spend} onChange={e => setForm({ ...form, total_spend: e.target.value })} placeholder="0" autoFocus />
        </div>

        {pct !== null && (
          <div style={{ padding: '10px 14px', borderRadius: 'var(--radius)', background: status.bg, border: `1px solid ${status.color}`, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: status.color }}>DDU share: <strong>{pct}%</strong> of total spend</span>
              <span style={{ padding: '2px 10px', borderRadius: 100, background: status.bg, color: status.color, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', border: `1px solid ${status.color}` }}>{status.label}</span>
            </div>
            <div style={{ marginTop: 8, height: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '20%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.3)' }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.3)' }} />
              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: status.color, borderRadius: 3 }} />
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Notes (optional)</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Context, blockers..." style={{ resize: 'vertical' }} />
        </div>

        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.total_spend}>{saving ? 'Saving...' : 'Save'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── CLIENT CARD ─────────────────────────────────────────────
function ClientSpendCard({ client, entries, weekStart, onLog, onAssign, csMap, canAssign }) {
  const [expanded, setExpanded] = useState(false)
  const thisWeek = entries?.find(e => e.week_start === weekStart)
  const pct = thisWeek?.total_spend > 0 ? ((thisWeek.ddu_spend / thisWeek.total_spend) * 100).toFixed(1) : null
  const status = pct !== null ? getStatus(parseFloat(pct)) : null
  const csName = csMap[client.assigned_cs_id]?.full_name

  const chartData = entries?.slice().reverse().map(e => {
    const p = e.total_spend > 0 ? parseFloat(((e.ddu_spend / e.total_spend) * 100).toFixed(1)) : 0
    return { week: `W${weekNum(e.week_start)}`, pct: p, ddu: e.ddu_spend, total: e.total_spend }
  })

  // Platform breakdown for this week
  const hasPlatforms = thisWeek && PLATFORMS.some(p => thisWeek[p.key] > 0)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderLeft: `4px solid ${status?.color || 'var(--border)'}`, cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>{client.name}</span>
              {csName ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', background: 'var(--accent-dim)', padding: '1px 7px', borderRadius: 100 }}>
                  {initials(csName)} {csName.split(' ')[0]}
                </span>
              ) : canAssign && (
                <span onClick={e => { e.stopPropagation(); onAssign(client) }}
                  style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', cursor: 'pointer', textDecoration: 'underline' }}>
                  assign CS
                </span>
              )}
            </div>
            {thisWeek && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                DDU {fmtMoney(thisWeek.ddu_spend)} · Total {fmtMoney(thisWeek.total_spend)}
                {hasPlatforms && (
                  <span style={{ marginLeft: 8 }}>
                    {PLATFORMS.filter(p => thisWeek[p.key] > 0).map(p => (
                      <span key={p.key} style={{ color: p.color, marginRight: 6 }}>{p.label} {fmtMoney(thisWeek[p.key])}</span>
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
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

        {pct !== null && (
          <div style={{ marginTop: 10, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '20%', top: 0, bottom: 0, width: 1, background: 'rgba(245,158,11,0.5)' }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(34,197,94,0.5)' }} />
            <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: status.color, borderRadius: 3, transition: 'width 0.4s ease' }} />
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          {/* Platform breakdown */}
          {hasPlatforms && (
            <div style={{ marginBottom: 16 }}>
              <div className="card-label mb-2">This Week — Platform Breakdown</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PLATFORMS.filter(p => thisWeek[p.key] > 0).map(p => (
                  <div key={p.key} style={{ padding: '8px 14px', borderRadius: 'var(--radius)', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmtMoney(thisWeek[p.key])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chart */}
          {chartData?.length > 1 ? (
            <>
              <div className="card-label mb-2">DDU % — Weekly Trend</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <XAxis dataKey="week" tick={{ fill: '#3d526e', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#3d526e', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: '#0e1420', border: '1px solid #1e2d47', borderRadius: 8, fontSize: 11 }} formatter={v => [`${v}%`, 'DDU Share']} />
                  <ReferenceLine y={20} stroke="var(--amber)" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <ReferenceLine y={50} stroke="var(--green)" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                    {chartData.map((e, i) => <Cell key={i} fill={getStatus(e.pct).color} fillOpacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : <p className="text-muted text-sm">Log at least 2 weeks to see trend.</p>}

          {/* History table */}
          {entries?.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Dates</th>
                    <th>Meta</th>
                    <th>TikTok</th>
                    <th>AppLovin</th>
                    <th>Other</th>
                    <th>DDU Total</th>
                    <th>All Channels</th>
                    <th>DDU %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const p = e.total_spend > 0 ? ((e.ddu_spend / e.total_spend) * 100).toFixed(1) : null
                    const s = p !== null ? getStatus(parseFloat(p)) : null
                    const isThis = e.week_start === weekStart
                    return (
                      <tr key={e.id} style={{ background: isThis ? 'rgba(59,130,246,0.04)' : undefined }}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          W{weekNum(e.week_start)}{isThis && <span className="badge blue" style={{ fontSize: 9, marginLeft: 4 }}>now</span>}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{weekLabel(e.week_start)}</td>
                        {PLATFORMS.map(pl => (
                          <td key={pl.key} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: e[pl.key] > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {e[pl.key] > 0 ? fmtMoney(e[pl.key]) : '—'}
                          </td>
                        ))}
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMoney(e.ddu_spend)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMoney(e.total_spend)}</td>
                        <td style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: s?.color }}>{p !== null ? `${p}%` : '—'}</td>
                        <td>{s && <span style={{ padding: '2px 8px', borderRadius: 100, fontSize: 10, fontFamily: 'var(--font-mono)', background: s.bg, color: s.color }}>{s.label}</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── MAIN PAGE ────────────────────────────────────────────────
export default function SpendTracker() {
  const { profile, isManagement } = useAuth()
  const [clients, setClients] = useState([])
  const [members, setMembers] = useState([])
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [logClient, setLogClient] = useState(null)
  const [logExisting, setLogExisting] = useState(null)
  const [assignClient, setAssignClient] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [csFilter, setCsFilter] = useState('all')
  const [search, setSearch] = useState('')

  const weekStart = fmt(getMonday())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: clientData }, { data: memberData }] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('id,full_name,position').order('full_name'),
    ])
    setClients(clientData || [])
    setMembers(memberData || [])

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

  const csMap = Object.fromEntries(members.map(m => [m.id, m]))
  const csMembers = members.filter(m => m.position === 'creative_strategist')

  // Summary
  const thisWeekAll = clients.map(c => entries[c.id]?.find(e => e.week_start === weekStart)).filter(Boolean)
  const totalDDU = thisWeekAll.reduce((s, e) => s + (e.ddu_spend || 0), 0)
  const totalAll = thisWeekAll.reduce((s, e) => s + (e.total_spend || 0), 0)
  const avgPct = thisWeekAll.length
    ? (thisWeekAll.reduce((s, e) => s + (e.total_spend > 0 ? (e.ddu_spend / e.total_spend) * 100 : 0), 0) / thisWeekAll.length).toFixed(1)
    : null
  const atRisk = thisWeekAll.filter(e => e.total_spend > 0 && (e.ddu_spend / e.total_spend) < 0.2).length

  // Filter
  let filtered = clients.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if (csFilter !== 'all' && c.assigned_cs_id !== csFilter) return false
    const e = entries[c.id]?.find(x => x.week_start === weekStart)
    const p = e?.total_spend > 0 ? (e.ddu_spend / e.total_spend) * 100 : null
    if (statusFilter === 'atrisk') return p !== null && p < 20
    if (statusFilter === 'healthy') return p !== null && p >= 20 && p < 50
    if (statusFilter === 'excellent') return p !== null && p >= 50
    if (statusFilter === 'unlogged') return !e
    return true
  })

  // Sort: at risk first, then healthy, then excellent, unlogged last
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

  const csName = logClient ? csMap[logClient.assigned_cs_id]?.full_name : null

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">Spend Tracker</h1>
            <p className="page-subtitle">W{weekNum(weekStart)} · {weekLabel(weekStart)}</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">DDU Spend</div><div className="stat-box-value text-accent">{fmtMoney(totalDDU)}</div></div>
          <div className="stat-box"><div className="stat-box-label">Total Spend</div><div className="stat-box-value">{fmtMoney(totalAll)}</div></div>
          <div className="stat-box"><div className="stat-box-label">Avg DDU %</div>
            <div className="stat-box-value" style={{ color: avgPct !== null ? getStatus(parseFloat(avgPct)).color : 'var(--text-muted)' }}>
              {avgPct !== null ? `${avgPct}%` : '—'}
            </div>
          </div>
          <div className="stat-box"><div className="stat-box-label">At Risk</div><div className="stat-box-value text-red">{atRisk}</div></div>
          <div className="stat-box"><div className="stat-box-label">Logged</div><div className="stat-box-value">{thisWeekAll.length}/{clients.length}</div></div>
        </div>

        {/* Threshold legend */}
        <div className="card mb-4" style={{ padding: '10px 14px' }}>
          <div className="flex items-center gap-4 flex-wrap">
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>DDU % OF TOTAL</span>
            {[
              { label: 'At Risk', sub: '< 20%', color: 'var(--red)', bg: 'var(--red-dim)' },
              { label: 'Healthy', sub: '20–50%', color: 'var(--amber)', bg: 'var(--amber-dim)' },
              { label: 'Excellent', sub: '≥ 50%', color: 'var(--green)', bg: 'var(--green-dim)' },
            ].map(t => (
              <div key={t.label} className="flex items-center gap-2">
                <span style={{ padding: '2px 10px', borderRadius: 100, background: t.bg, color: t.color, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{t.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <div className="tabs" style={{ border: 'none', marginBottom: 0, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'atrisk', label: '🔴 At Risk' },
              { key: 'healthy', label: '🟡 Healthy' },
              { key: 'excellent', label: '🟢 Excellent' },
              { key: 'unlogged', label: 'Not Logged' },
            ].map(f => <button key={f.key} className={`tab ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>)}
          </div>
          <select value={csFilter} onChange={e => setCsFilter(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
            <option value="all">All Creative Strategists</option>
            {csMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            <option value="unassigned">Unassigned</option>
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client..." style={{ width: 'auto', fontSize: 12, padding: '7px 12px', marginLeft: 'auto' }} />
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
                onLog={(c, e) => { setLogClient(c); setLogExisting(e || null) }}
                onAssign={c => setAssignClient(c)}
                csMap={csMap}
                canAssign={isManagement}
              />
            ))}
            {filtered.length === 0 && <div className="empty-state"><p>No clients match this filter.</p></div>}
          </div>
        )}
      </div>

      {logClient && (
        <LogModal
          client={logClient}
          existing={logExisting}
          weekStart={weekStart}
          csName={csName}
          onClose={() => { setLogClient(null); setLogExisting(null) }}
          onSave={load}
        />
      )}
      {assignClient && (
        <AssignCSModal
          client={assignClient}
          members={members}
          onClose={() => setAssignClient(null)}
          onSave={load}
        />
      )}
    </>
  )
}
