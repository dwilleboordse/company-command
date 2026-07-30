import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getClientStrategistIds } from '../lib/clientAssignments'
import { ChevronLeft, ChevronRight, Check, Minus } from 'lucide-react'

/* ── ITEMS ────────────────────────────────────────────────
   Weekly booleans: click to toggle.
   Client reports: 3-state (null | 'partial' | 'done'), cycle on click.
   Monthly survey: boolean, but only appears on the first week of each month.
   Slack participation: numeric 1–10.
   ──────────────────────────────────────────────────────── */

const COLUMNS = [
  { type: 'bool',         key: 'weekly_update_sent',   label: 'Weekly Update Sent'    },
  { type: 'bool',         key: 'monday_intentions',    label: 'Mon Intentions'         },
  { type: 'bool',         key: 'friday_reflections',   label: 'Fri Reflections'        },
  { type: 'bool',         key: 'mvp_votes',            label: 'MVP Votes'              },
  { type: 'monthly-tri',  key: 'client_reports',       label: 'Monthly Client Report'  },
  { type: 'monthly-bool', key: 'monthly_survey',       label: 'Monthly Survey'         },
  { type: 'bool',         key: 'on_time_pod_calls',    label: 'Pod Attendance'         },
  { type: 'bool',         key: 'on_time_client_calls', label: 'Client Attendance'      },
]
const isMonthlyType = (t) => t === 'monthly-bool' || t === 'monthly-tri'

const SLACK_KEY = 'slack_participation'
const alphabeticalCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function memberRoleLabel(member) {
  return (member.position || member.role || 'Unassigned').replace(/_/g, ' ')
}

function compareMembersByRoleThenName(a, b) {
  const roleOrder = alphabeticalCollator.compare(memberRoleLabel(a), memberRoleLabel(b))
  if (roleOrder !== 0) return roleOrder
  return alphabeticalCollator.compare(a.full_name || '', b.full_name || '')
}

// ── DATE HELPERS (Monday-anchored, timezone safe) ────────
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
// Only true for weeks strictly after the current week (the current week is fine — that's what we log during)
function isFutureWeek(dateStr) {
  return dateStr > toDateStr(getMondayOfWeek(new Date()))
}
// "First week of the month" = the Monday of that week falls in days 1–7
function isFirstWeekOfMonth(mondayStr) {
  return parseISODate(mondayStr).getDate() <= 7
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

// ── SCORE HELPER ────────────────────────────────────────
function scoreLog(log, monthlyVisible, spendStatus) {
  let earned = 0, total = 0
  COLUMNS.forEach(c => {
    if (isMonthlyType(c.type) && !monthlyVisible) return
    total += 1
    const v = log?.[c.key]
    if (c.type === 'bool' || c.type === 'monthly-bool') {
      if (v) earned += 1
    } else if (c.type === 'monthly-tri') {
      if (v === 'done') earned += 1
      else if (v === 'partial') earned += 0.5
    }
  })
  if (spendStatus?.total > 0) {
    total += 1
    if (spendStatus.complete) earned += 1
  }
  return { earned, total }
}

// ── ROW ──────────────────────────────────────────────────
function MemberRow({ member, log, onChange, monthlyVisible, spendStatus }) {
  const initials = (member.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const { earned, total } = scoreLog(log, monthlyVisible, spendStatus)
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
              {memberRoleLabel(member)}
            </div>
          </div>
        </div>
      </td>

      {COLUMNS.filter(c => !isMonthlyType(c.type) || monthlyVisible).map(c => {
        if (c.type === 'monthly-tri') {
          const v = log?.[c.key] ?? null
          const next = v === null || v === undefined ? 'partial'
                     : v === 'partial' ? 'done'
                     : null
          const style = {
            width: 30, height: 26, borderRadius: 7,
            border: v ? 'none' : '1.5px solid var(--border)',
            background: v === 'done' ? 'var(--green-dim)' : v === 'partial' ? 'var(--amber-dim)' : 'transparent',
            color: v === 'done' ? 'var(--green)' : v === 'partial' ? 'var(--amber)' : 'var(--text-muted)',
            display: 'inline-grid', placeItems: 'center', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, transition: 'all 0.12s',
          }
          const label = v === 'done' ? 'Done' : v === 'partial' ? 'Partial' : 'Not done — click to cycle'
          const glyph = v === 'done' ? '✓' : v === 'partial' ? '½' : '—'
          return (
            <td key={c.key} style={{ textAlign: 'center' }}>
              <button onClick={() => onChange(member.id, { [c.key]: next })} title={label} style={style}>
                {glyph}
              </button>
            </td>
          )
        }
        // bool + monthly render the same
        const checked = !!log?.[c.key]
        return (
          <td key={c.key} style={{ textAlign: 'center' }}>
            <button
              onClick={() => onChange(member.id, { [c.key]: !checked })}
              title={c.label}
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
        {member.position !== 'creative_strategist' ? (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ) : spendStatus?.total > 0 ? (
          <span
            title={spendStatus.complete
              ? `All ${spendStatus.total} assigned clients logged for W${weekNum(spendStatus.weekStart)}`
              : `${spendStatus.logged} of ${spendStatus.total} assigned clients logged for W${weekNum(spendStatus.weekStart)}`}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              minWidth: 48, height: 26, padding: '0 8px', borderRadius: 7,
              background: spendStatus.complete ? 'var(--green-dim)' : 'transparent',
              border: spendStatus.complete ? 'none' : '1.5px solid var(--border)',
              color: spendStatus.complete ? 'var(--green)' : 'var(--text-muted)',
              fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
            }}
          >
            {spendStatus.complete ? <Check size={14} strokeWidth={3} /> : <Minus size={12} />}
            {spendStatus.logged}/{spendStatus.total}
          </span>
        ) : (
          <span title="No active clients assigned" style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>

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
          color: earned === total && total > 0
            ? 'var(--green)'
            : earned >= total * 0.7 ? 'var(--amber)' : 'var(--text-muted)',
        }}>
          {earned % 1 === 0 ? earned : earned.toFixed(1)}/{total}
        </span>
      </td>
    </tr>
  )
}

// ── MAIN PAGE ────────────────────────────────────────────
export default function Accountability() {
  const { profile, isManagement, isOps } = useAuth()
  const canEdit = isManagement || isOps

  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState({})
  const [clients, setClients] = useState([])
  const [spendEntries, setSpendEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  // Default to the CURRENT week — team logs during the week, not after
  const [selectedWeek, setSelectedWeek] = useState(() => toDateStr(getMondayOfWeek(new Date())))

  const monthlyVisible = isFirstWeekOfMonth(selectedWeek)

  useEffect(() => {
    if (!canEdit) return
    let cancelled = false

    async function loadAccountability() {
      setLoading(true)
      const spendWeek = toDateStr(addWeeks(parseISODate(selectedWeek), -1))
      const [memberResult, logResult, clientResult, spendResult] = await Promise.all([
        supabase.from('profiles').select('id,full_name,position,role,is_active').eq('is_active', true).order('full_name'),
        supabase.from('accountability_logs').select('*').eq('week_start', selectedWeek),
        supabase.from('clients')
          .select('id,name,cs_ids,assigned_cs_id,is_active,is_archived')
          .eq('is_active', true)
          .or('is_archived.is.null,is_archived.eq.false'),
        supabase.from('spend_entries')
          .select('client_id,week_start,total_spend')
          .eq('week_start', spendWeek),
      ])
      if (cancelled) return

      const activeMembers = (memberResult.data || [])
        .filter(member => member.is_active === true && member.full_name)
        .sort(compareMembersByRoleThenName)
      setMembers(activeMembers)
      const map = {}
      ;(logResult.data || []).forEach(l => { map[l.user_id] = l })
      setLogs(map)
      setClients((clientResult.data || []).filter(client => client.is_active === true && client.is_archived !== true))
      setSpendEntries(spendResult.data || [])
      ;[memberResult, logResult, clientResult, spendResult].forEach(result => {
        if (result.error) console.error('Accountability load failed:', result.error.message)
      })
      setLoading(false)
    }

    loadAccountability()
    return () => { cancelled = true }
  }, [canEdit, selectedWeek])

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
    if (!isFutureWeek(next)) setSelectedWeek(next)
  }
  const canGoNext = !isFutureWeek(toDateStr(addWeeks(parseISODate(selectedWeek), 1)))
  const thisWeekStr = toDateStr(getMondayOfWeek(new Date()))
  const lastWeekStr = toDateStr(getLastMonday())
  const isThisWeek  = selectedWeek === thisWeekStr
  const isLastWeek  = selectedWeek === lastWeekStr

  const spendStatusByMember = useMemo(() => {
    const spendWeek = toDateStr(addWeeks(parseISODate(selectedWeek), -1))
    const loggedClientIds = new Set(
      spendEntries
        .filter(entry => Number(entry.total_spend) > 0)
        .map(entry => entry.client_id)
    )
    const result = {}

    members.forEach(member => {
      if (member.position !== 'creative_strategist') return
      const assignedClientIds = clients
        .filter(client => getClientStrategistIds(client).includes(member.id))
        .map(client => client.id)
      const logged = assignedClientIds.filter(clientId => loggedClientIds.has(clientId)).length
      result[member.id] = {
        weekStart: spendWeek,
        logged,
        total: assignedClientIds.length,
        complete: assignedClientIds.length > 0 && logged === assignedClientIds.length,
      }
    })

    return result
  }, [clients, members, selectedWeek, spendEntries])

  const stats = useMemo(() => {
    const tot = members.length
    let fully = 0, missingAny = 0, totItems = 0, doneItems = 0
    members.forEach(m => {
      const { earned, total } = scoreLog(logs[m.id], monthlyVisible, spendStatusByMember[m.id])
      totItems += total
      doneItems += earned
      if (total > 0 && earned === total) fully += 1
      else missingAny += 1
    })
    const completion = totItems > 0 ? Math.round((doneItems / totItems) * 100) : 0
    return { tot, fully, missingAny, completion }
  }, [members, logs, monthlyVisible, spendStatusByMember])

  if (!canEdit) {
    return (
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <p className="text-muted">Operations / management access only.</p>
      </div>
    )
  }

  const visibleColumns = COLUMNS.filter(c => !isMonthlyType(c.type) || monthlyVisible)

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
              <div style={{
                fontSize: 10, marginTop: 1,
                color: isThisWeek ? 'var(--accent)' : isLastWeek ? 'var(--green)' : 'var(--text-muted)',
              }}>
                {isThisWeek ? '● This week' : isLastWeek ? '✓ Last week' : 'Historical'}
                {monthlyVisible && <span style={{ marginLeft: 6, color: 'var(--accent)' }}>· Monthly week</span>}
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
                {visibleColumns.map(c => <th key={c.key} style={{ textAlign: 'center', fontSize: 10 }}>{c.label}</th>)}
                <th style={{ textAlign: 'center', fontSize: 10 }}>Spend Tracker</th>
                <th style={{ textAlign: 'center' }}>Slack Participation 1–10</th>
                <th style={{ textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleColumns.length + 4} style={{ textAlign: 'center', padding: 32 }}>
                  <div className="spinner" style={{ display: 'inline-block' }} />
                </td></tr>
              ) : members.length === 0 ? (
                <tr><td colSpan={visibleColumns.length + 4}><div className="empty-state"><p>No team members found.</p></div></td></tr>
              ) : members.map(m => (
                <MemberRow
                  key={m.id}
                  member={m}
                  log={logs[m.id]}
                  onChange={handleChange}
                  monthlyVisible={monthlyVisible}
                  spendStatus={spendStatusByMember[m.id]}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend + note when monthly column is hidden */}
        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap',
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span><b style={{ color: 'var(--text-primary)' }}>Monthly Client Report:</b> click to cycle — <span style={{ color: 'var(--text-muted)' }}>—</span> not done, <span style={{ color: 'var(--amber)' }}>½</span> partial, <span style={{ color: 'var(--green)' }}>✓</span> done</span>
          <span>
            <b style={{ color: 'var(--text-primary)' }}>Spend Tracker:</b> Creative Strategists receive a check when every active assigned client has prior-week spend logged.
          </span>
          {!monthlyVisible && (
            <span style={{ color: 'var(--accent)' }}>
              Monthly Client Report and Monthly Survey columns only appear during the first week of each month.
            </span>
          )}
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
