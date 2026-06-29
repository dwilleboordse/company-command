import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ChevronRight, Check, Minus } from 'lucide-react'

const BOOL_ITEMS = [
  { key: 'monday_intentions',    label: 'Mon Intentions'   },
  { key: 'friday_reflections',   label: 'Fri Reflections'  },
  { key: 'mvp_votes',            label: 'MVP Votes'        },
  { key: 'client_reports',       label: 'Client Reports'   },
  { key: 'monthly_survey',       label: 'Monthly Survey'   },
  { key: 'on_time_pod_calls',    label: 'On Time — Pod'    },
  { key: 'on_time_client_calls', label: 'On Time — Client' },
]
const SLACK_KEY = 'slack_participation'

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseISODate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function getMondayOfWeek(d) {
  const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(m.getDate() + diff); m.setHours(0, 0, 0, 0); return m
}
function getLastMonday() {
  const d = new Date(); const day = d.getDay()
  const diff = day === 0 ? 13 : day + 6
  d.setDate(d.getDate() - diff); d.setHours(0, 0, 0, 0); return d
}
function addWeeks(d, n) { const r = new Date(d); r.setDate(r.getDate() + n * 7); return r }
function isCurrentOrFutureWeek(dateStr) {
  return dateStr >= toDateStr(getMondayOfWeek(new Date()))
}
function weekLabel(mondayStr) {
  const start = parseISODate(mondayStr); const end = parseISODate(mondayStr); end.setDate(end.getDate() + 6)
  const fmt = (d) => `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
  return `${fmt(start)} – ${fmt(end)}`
}
function weekNum(mondayStr) {
  const d = parseISODate(mondayStr)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
}

function MemberRow({ member, log, onChange }) {
  const initials = (member.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const boolsDone = BOOL_ITEMS.filter(i => !!log?.[i.key]).length
  const slack = log?.[SLACK_KEY] ?? null

  return (
    <tr>
      <td style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--accent-grad, linear-gradient(135deg,#8b6dff,#5b8cff))', color: '#fff',
            display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0
          }}>{initials}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{member.full_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {(member.position || member.role || '').replace(/_/g, ' ')}
            </div>
          </div>
        </div>
      </td>

      {BOOL_ITEMS.map(item => {
        const checked = !!log?.[item.key]
        return (
          <td key={item.key} style={{ textAlign: 'center' }}>
            <button
              onClick={() => onChange(member.id, { [item.key]: !checked })}
              title={item.label}
              style={{
                width: 26, height: 26, borderRadius: 7,
                border: checked ? 'none' : '1.5px solid var(--border)',
                background: checked ? 'var(--green-dim)' : 'transparent',
                color: checked ? 'var(--green)' : 'var(--text-muted)',
                display: 'inline-grid', placeItems: 'center',
                cursor: 'pointer', transition: 'all 0.12s',
              }}>
              {checked ? <Check size={15} strokeWidth={3} /> : <Minus size={13} />}
            </button>
          </td>
        )
      })}

      <td style={{ textAlign: 'center' }}>
        <select
          value={slack ?? ''}
          onChange={e => onChange(member.id, { [SLACK_KEY]: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ width: 64, padding: '5px 6px', fontSize: 12, textAlign: 'center' }}
        >
          <option value="">—</option>
          {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>

      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: boolsDone === BOOL_ITEMS.length
            ? 'var(--green)'
            : boolsDone >= 5 ? 'var(--amber)' : 'var(--text-muted)',
        }}>
          {boolsDone}/{BOOL_ITEMS.length}
        </span>
      </td>
    </tr>
  )
}

export default function Accountability() {
  const { profile, isManagement, isOps } = useAuth()
  const canEdit = isManagement || isOps

  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(() => toDateStr(getLastMonday()))

  useEffect(() => { if (canEdit) load() }, [canEdit, selectedWeek])

  async function load() {
    setLoading(true)
    const [{ data: memberData }, { data: logData }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,position,role').order('full_name'),
      supabase.from('accountability_logs').select('*').eq('week_start', selectedWeek),
    ])
    setMembers((memberData || []).filter(m => m.full_name))
    const map = {}
    ;(logData || []).forEach(l => { map[l.user_id] = l })
    setLogs(map)
    setLoading(false)
  }

  async function handleChange(userId, patch) {
    setSaving(userId)
    const existing = logs[userId] || {}
    const next = { ...existing, ...patch, user_id: userId, week_start: selectedWeek, logged_by: profile?.id }
    setLogs(prev => ({ ...prev, [userId]: { ...prev[userId], ...patch } }))
    const { data, error } = await supabase
      .from('accountability_logs')
      .upsert(next, { onConflict: 'user_id,week_start' })
      .select()
      .single()
    if (!error && data) {
      setLogs(prev => ({ ...prev, [userId]: data }))
    } else if (error) {
      console.error('Accountability save failed:', error.message)
      setLogs(prev => ({ ...prev, [userId]: existing }))
    }
    setSaving(null)
  }

  function prevWeek() { setSelectedWeek(w => toDateStr(addWeeks(parseISODate(w), -1))) }
  function nextWeek() {
    const next = toDateStr(addWeeks(parseISODate(selectedWeek), 1))
    if (!isCurrentOrFutureWeek(next)) setSelectedWeek(next)
  }
  const canGoNext = !isCurrentOrFutureWeek(toDateStr(addWeeks(parseISODate(selectedWeek), 1)))
  const isLastWeek = selectedWeek === toDateStr(getLastMonday())

  const stats = useMemo(() => {
    const tot = members.length
    const fully = members.filter(m => {
      const l = logs[m.id]
      return l && BOOL_ITEMS.every(i => l[i.key])
    }).length
    const missingAny = members.filter(m => {
      const l = logs[m.id]
      return !l || BOOL_ITEMS.some(i => !l[i.key])
    }).length
    let totBools = 0, doneBools = 0
    members.forEach(m => {
      const l = logs[m.id]
      BOOL_ITEMS.forEach(i => {
        totBools++
        if (l?.[i.key]) doneBools++
      })
    })
    const completion = totBools > 0 ? Math.round((doneBools / totBools) * 100) : 0
    return { tot, fully, missingAny, completion }
  }, [members, logs])

  if (!canEdit) {
    return (
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <p className="text-muted">Operations / management access only.</p>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">Accountability</h1>
            <p className="page-subtitle">Weekly accountability log — ops/management edit, everyone sees the leaderboard</p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            overflow: 'hidden', background: 'var(--bg-card)', boxShadow: 'var(--shadow-xs)'
          }}>
            <button onClick={prevWeek} style={{ padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={15} />
            </button>
            <div style={{ padding: '7px 16px', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', textAlign: 'center', minWidth: 170 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                W{weekNum(selectedWeek)} · {weekLabel(selectedWeek)}
              </div>
              <div style={{ fontSize: 10, color: isLastWeek ? 'var(--green)' : 'var(--text-muted)', marginTop: 1 }}>
                {isLastWeek ? '✓ Last week' : 'Historical'}
              </div>
            </div>
            <button onClick={nextWeek} disabled={!canGoNext} style={{ padding: '8px 12px', border: 'none', background: 'transparent', cursor: canGoNext ? 'pointer' : 'not-allowed', color: canGoNext ? 'var(--text-secondary)' : 'var(--border)', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">Team</div><div className="stat-box-value">{stats.tot}</div></div>
          <div className="stat-box"><div className="stat-box-label">Fully Accountable</div><div className="stat-box-value text-green">{stats.fully}</div></div>
          <div className="stat-box"><div className="stat-box-label">Missing Items</div><div className="stat-box-value text-amber">{stats.missingAny}</div></div>
          <div className="stat-box"><div className="stat-box-label">Week Completion</div><div className="stat-box-value text-accent">{stats.completion}%</div></div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Team member</th>
                {BOOL_ITEMS.map(i => <th key={i.key} style={{ textAlign: 'center', fontSize: 10 }}>{i.label}</th>)}
                <th style={{ textAlign: 'center' }}>Slack 1–10</th>
                <th style={{ textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={BOOL_ITEMS.length + 3} style={{ textAlign: 'center', padding: 32 }}>
                  <div className="spinner" style={{ display: 'inline-block' }} />
                </td></tr>
              ) : members.length === 0 ? (
                <tr><td colSpan={BOOL_ITEMS.length + 3}><div className="empty-state"><p>No team members found.</p></div></td></tr>
              ) : members.map(m => (
                <MemberRow key={m.id} member={m} log={logs[m.id]} onChange={handleChange} />
              ))}
            </tbody>
          </table>
        </div>

        {saving && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
            Saving…
          </div>
        )}
      </div>
    </>
  )
}
