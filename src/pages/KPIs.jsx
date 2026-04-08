import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { getMondayStr } from '../lib/dates'

const DEPT_OPTIONS = ['all','company','marketing','delivery','operations','management']
const ROLE_LABELS = {
  company_wide:'Company Wide', marketing:'Marketing', media_buyer:'Media Buyer',
  creative_strategist:'Creative Strategist', editor:'Editor', designer:'Designer',
  ugc_manager:'UGC Manager', email_marketer:'Email Marketer', ops_manager:'Operations Manager',
  ops_assistant:'Operations Assistant', hr_manager:'HR Manager', management:'Management',
}

function getStatus(current, goal, direction) {
  if (!goal) return 'gray'
  const r = direction === 'min' ? goal / Math.max(current, 0.01) : current / Math.max(goal, 0.01)
  return r >= 0.9 ? 'green' : r >= 0.7 ? 'amber' : 'red'
}
function getProgress(current, goal, direction) {
  if (!goal) return 0
  return Math.min(100, direction === 'min'
    ? (goal / Math.max(current, 0.01)) * 100
    : (current / Math.max(goal, 0.01)) * 100)
}

// ── LOG VALUE MODAL ─────────────────────────────────────────
function LogValueModal({ kpi, targetUser, onClose, onSave }) {
  const weekStart = getMondayStr()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (value === '') return
    setSaving(true)
    await supabase.from('user_kpi_values').upsert({
      user_id: targetUser.id,
      kpi_id: kpi.id,
      week_start: weekStart,
      value: parseFloat(value),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,kpi_id,week_start' })
    // Also update the kpi current_value to reflect latest avg
    onSave(); setSaving(false); onClose()
  }

  const status = value !== '' ? getStatus(parseFloat(value), kpi.goal_value, kpi.goal_direction) : 'gray'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Log KPI Value</h2>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{kpi.metric_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            For: <strong style={{ color: 'var(--text-primary)' }}>{targetUser.full_name}</strong> · Week of {weekStart}
          </div>
        </div>
        <div className="form-group">
          <label>Value ({kpi.unit})</label>
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={`Goal: ${kpi.goal_direction === 'min' ? '≤' : '≥'}${kpi.goal_value}${kpi.unit}`}
            autoFocus
          />
        </div>
        {value !== '' && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 16,
            background: status === 'green' ? 'var(--green-dim)' : status === 'red' ? 'var(--red-dim)' : 'var(--amber-dim)',
            border: `1px solid ${status === 'green' ? 'var(--green)' : status === 'red' ? 'var(--red)' : 'var(--amber)'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: 13, color: status === 'green' ? 'var(--green)' : status === 'red' ? 'var(--red)' : 'var(--amber)' }}>
              {parseFloat(value)}{kpi.unit} vs goal {kpi.goal_direction === 'min' ? '≤' : '≥'}{kpi.goal_value}{kpi.unit}
            </span>
            <span className={`badge ${status}`}>
              {status === 'green' ? 'On target' : status === 'red' ? 'Off target' : 'Close'}
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || value === ''}>{saving ? 'Saving...' : 'Save'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── KPI DEFINITION MODALS ───────────────────────────────────
function EditKPIModal({ kpi, onClose, onSave }) {
  const [form, setForm] = useState({ metric_name: kpi.metric_name, goal_value: kpi.goal_value, goal_direction: kpi.goal_direction, unit: kpi.unit })
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    setSaving(true)
    await supabase.from('kpis').update({ ...form, updated_at: new Date().toISOString() }).eq('id', kpi.id)
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Edit KPI Definition</h2>
        <div className="form-group"><label>Metric Name</label><input value={form.metric_name} onChange={e => setForm({ ...form, metric_name: e.target.value })} /></div>
        <div className="grid-2">
          <div className="form-group"><label>Goal</label><input type="number" value={form.goal_value} onChange={e => setForm({ ...form, goal_value: e.target.value })} /></div>
          <div className="form-group"><label>Unit</label><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>Direction</label>
          <select value={form.goal_direction} onChange={e => setForm({ ...form, goal_direction: e.target.value })}>
            <option value="max">Higher is better (≥)</option>
            <option value="min">Lower is better (≤)</option>
          </select>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function AddKPIModal({ onClose, onSave }) {
  const [form, setForm] = useState({ department: 'delivery', role_type: 'creative_strategist', metric_name: '', goal_value: '', goal_direction: 'max', unit: '%', visibility: 'team' })
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!form.metric_name) return
    setSaving(true)
    await supabase.from('kpis').insert({ ...form, goal_value: parseFloat(form.goal_value) || 0, current_value: 0, is_active: true })
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add KPI</h2>
        <div className="form-group"><label>Metric Name</label><input value={form.metric_name} onChange={e => setForm({ ...form, metric_name: e.target.value })} placeholder="e.g. First Pass Approval Rate" /></div>
        <div className="grid-2">
          <div className="form-group"><label>Department</label>
            <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
              {['company','marketing','delivery','operations','management'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Role Type</label>
            <select value={form.role_type} onChange={e => setForm({ ...form, role_type: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Goal</label><input type="number" value={form.goal_value} onChange={e => setForm({ ...form, goal_value: e.target.value })} /></div>
          <div className="form-group"><label>Unit</label><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Direction</label>
            <select value={form.goal_direction} onChange={e => setForm({ ...form, goal_direction: e.target.value })}>
              <option value="max">Higher is better</option>
              <option value="min">Lower is better</option>
            </select>
          </div>
          <div className="form-group"><label>Visibility</label>
            <select value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}>
              <option value="team">Team</option>
              <option value="management">Management only</option>
              <option value="ceo">CEO only</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Adding...' : 'Add KPI'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── INDIVIDUAL MEMBER ROW ────────────────────────────────────
function MemberKPIRow({ member, kpi, userValues, onLog }) {
  const weekStart = getMondayStr()
  const thisWeek = userValues?.find(v => v.week_start === weekStart)
  const current = thisWeek?.value ?? null
  const status = current !== null ? getStatus(current, kpi.goal_value, kpi.goal_direction) : 'gray'
  const progress = current !== null ? getProgress(current, kpi.goal_value, kpi.goal_direction) : 0

  // Build trend from history
  const history = userValues?.slice().reverse().map(v => ({
    week: v.week_start?.slice(5),
    value: v.value
  })) || []

  const [showChart, setShowChart] = useState(false)
  const chartColor = status === 'green' ? '#22c55e' : status === 'red' ? '#ef4444' : '#f59e0b'

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3" style={{ padding: '10px 14px', flexWrap: 'wrap', gap: 8 }}>
        {/* Avatar */}
        <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
          {member.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
        </div>

        {/* Name */}
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 120, flex: 1 }}>{member.full_name}</span>

        {/* Progress bar */}
        <div style={{ flex: 2, minWidth: 100 }}>
          <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, transition: 'width 0.4s ease',
              background: status === 'green' ? 'var(--green)' : status === 'red' ? 'var(--red)' : 'var(--amber)' }} />
          </div>
        </div>

        {/* Value */}
        <div style={{ textAlign: 'right', minWidth: 70, flexShrink: 0 }}>
          {current !== null ? (
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em',
              color: status === 'green' ? 'var(--green)' : status === 'red' ? 'var(--red)' : 'var(--amber)'
            }}>
              {current}{kpi.unit}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>No data</span>
          )}
        </div>

        {/* Status badge */}
        <span className={`badge ${status}`} style={{ fontSize: 9, flexShrink: 0, minWidth: 60, textAlign: 'center' }}>
          {status === 'green' ? 'On target' : status === 'red' ? 'Off target' : status === 'amber' ? 'Close' : 'No data'}
        </span>

        {/* Actions */}
        <div className="flex gap-1" style={{ flexShrink: 0 }}>
          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => onLog(member)}>
            {thisWeek ? <><Edit2 size={11} /> Update</> : '+ Log'}
          </button>
          {history.length > 1 && (
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowChart(!showChart)}>
              {showChart ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Inline trend chart */}
      {showChart && history.length > 1 && (
        <div style={{ padding: '0 14px 14px 14px', background: 'var(--bg)' }}>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="week" tick={{ fill: '#3d526e', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#3d526e', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0e1420', border: '1px solid #1e2d47', borderRadius: 8, fontSize: 11 }}
                formatter={v => [`${v}${kpi.unit}`, member.full_name]} />
              <ReferenceLine y={kpi.goal_value} stroke={chartColor} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} dot={{ fill: chartColor, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── KPI GROUP CARD ───────────────────────────────────────────
function KPIGroupCard({ kpi, members, allUserValues, onLog, onEdit, onDelete, isManagement, currentUserId }) {
  const [expanded, setExpanded] = useState(false)
  const weekStart = getMondayStr()

  // Relevant members: those whose position matches this kpi's role_type
  const relevantMembers = members.filter(m => m.position === kpi.role_type || kpi.role_type === 'company_wide')

  // For athlete view — just show their own
  const displayMembers = isManagement ? relevantMembers : relevantMembers.filter(m => m.id === currentUserId)

  // Compute team avg for this week
  const weekValues = relevantMembers.map(m => {
    const vals = allUserValues[`${m.id}_${kpi.id}`] || []
    return vals.find(v => v.week_start === weekStart)?.value ?? null
  }).filter(v => v !== null)

  const teamAvg = weekValues.length
    ? (weekValues.reduce((s, v) => s + v, 0) / weekValues.length).toFixed(1)
    : null

  const avgStatus = teamAvg !== null ? getStatus(parseFloat(teamAvg), kpi.goal_value, kpi.goal_direction) : 'gray'
  const avgProgress = teamAvg !== null ? getProgress(parseFloat(teamAvg), kpi.goal_value, kpi.goal_direction) : 0
  const onTargetCount = weekValues.filter(v => getStatus(v, kpi.goal_value, kpi.goal_direction) === 'green').length
  const offTargetCount = weekValues.filter(v => getStatus(v, kpi.goal_value, kpi.goal_direction) === 'red').length

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{ padding: '14px 16px', cursor: 'pointer', borderLeft: `4px solid ${avgStatus === 'green' ? 'var(--green)' : avgStatus === 'red' ? 'var(--red)' : avgStatus === 'amber' ? 'var(--amber)' : 'var(--border)'}` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>{kpi.metric_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              Goal: {kpi.goal_direction === 'min' ? '≤' : '≥'}{kpi.goal_value}{kpi.unit}
              {isManagement && relevantMembers.length > 0 && (
                <span style={{ marginLeft: 12 }}>
                  {weekValues.length}/{relevantMembers.length} logged
                  {onTargetCount > 0 && <span style={{ color: 'var(--green)', marginLeft: 8 }}>✓ {onTargetCount} on target</span>}
                  {offTargetCount > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>✗ {offTargetCount} off target</span>}
                </span>
              )}
            </div>
          </div>

          {/* Team avg (management) or personal value (athlete) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {teamAvg !== null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: avgStatus === 'green' ? 'var(--green)' : avgStatus === 'red' ? 'var(--red)' : 'var(--amber)' }}>
                  {isManagement ? `${teamAvg}${kpi.unit}` : `${teamAvg}${kpi.unit}`}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {isManagement ? 'team avg' : 'this week'}
                </div>
              </div>
            )}
            {isManagement && (
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(kpi)}><Edit2 size={13} /></button>
                <button className="btn btn-danger btn-icon btn-sm" onClick={() => onDelete(kpi.id)}><Trash2 size={13} /></button>
              </div>
            )}
            {expanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </div>
        </div>

        {/* Team avg progress bar */}
        {teamAvg !== null && (
          <div className="progress-bar-wrap" style={{ marginTop: 10 }}>
            <div className={`progress-bar-fill ${avgStatus}`} style={{ width: `${avgProgress}%` }} />
          </div>
        )}
      </div>

      {/* Expanded: member rows */}
      {expanded && (
        <div style={{ background: 'var(--bg)' }}>
          {/* Column headers */}
          <div style={{ display: 'flex', padding: '8px 14px', borderBottom: '1px solid var(--border)', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1, flex: 1, minWidth: 120 }}>Team Member</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1, flex: 2, minWidth: 100 }}>Progress</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1, minWidth: 70, textAlign: 'right' }}>This Week</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1, minWidth: 60 }}>Status</span>
            <span style={{ minWidth: 80 }} />
          </div>

          {displayMembers.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px' }}>
              <p>No team members with this role yet. Assign positions in Admin.</p>
            </div>
          ) : displayMembers.map(member => (
            <MemberKPIRow
              key={member.id}
              member={member}
              kpi={kpi}
              userValues={allUserValues[`${member.id}_${kpi.id}`] || []}
              onLog={() => onLog(kpi, member)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── MAIN PAGE ────────────────────────────────────────────────
export default function KPIs() {
  const { profile, isCEO, isManagement } = useAuth()
  const [kpis, setKpis] = useState([])
  const [members, setMembers] = useState([])
  const [allUserValues, setAllUserValues] = useState({}) // key: `userId_kpiId` -> [entries]
  const [loading, setLoading] = useState(true)
  const [dept, setDept] = useState('all')
  const [editKPI, setEditKPI] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [logTarget, setLogTarget] = useState(null) // { kpi, member }

  useEffect(() => { load() }, [profile, dept])

  async function load() {
    if (!profile) return
    setLoading(true)

    // Load KPI definitions
    let q = supabase.from('kpis').select('*').eq('is_active', true).order('department').order('role_type')
    if (!isCEO && !isManagement) q = q.eq('visibility', 'team')
    else if (!isCEO) q = q.in('visibility', ['team', 'management'])
    // Athlete: only see KPIs for their role
    if (!isManagement && profile.position) q = q.eq('role_type', profile.position)
    if (dept !== 'all') q = q.eq('department', dept)
    const { data: kpiData } = await q
    setKpis(kpiData || [])

    // Load team members
    let memberQ = supabase.from('profiles').select('id,full_name,position,role').order('full_name')
    if (!isManagement) memberQ = memberQ.eq('id', profile.id)
    const { data: memberData } = await memberQ
    setMembers(memberData || [])

    // Load all user KPI values
    if (kpiData?.length && memberData?.length) {
      const { data: valData } = await supabase.from('user_kpi_values')
        .select('*')
        .in('kpi_id', kpiData.map(k => k.id))
        .in('user_id', memberData.map(m => m.id))
        .order('week_start', { ascending: false })

      const map = {}
      valData?.forEach(v => {
        const key = `${v.user_id}_${v.kpi_id}`
        if (!map[key]) map[key] = []
        map[key].push(v)
      })
      setAllUserValues(map)
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this KPI?')) return
    await supabase.from('kpis').update({ is_active: false }).eq('id', id)
    setKpis(prev => prev.filter(k => k.id !== id))
  }

  // Group by dept > role
  const grouped = kpis.reduce((acc, kpi) => {
    const key = `${kpi.department}__${kpi.role_type}`
    if (!acc[key]) acc[key] = { dept: kpi.department, role: kpi.role_type, kpis: [] }
    acc[key].kpis.push(kpi)
    return acc
  }, {})

  // Summary stats
  const weekStart = getMondayStr()
  const totalLogged = Object.values(allUserValues).filter(vals => vals.some(v => v.week_start === weekStart)).length
  const onTarget = Object.entries(allUserValues).filter(([key, vals]) => {
    const latest = vals.find(v => v.week_start === weekStart)
    if (!latest) return false
    const kpiId = key.split('_')[1]
    const kpi = kpis.find(k => k.id === kpiId)
    return kpi && getStatus(latest.value, kpi.goal_value, kpi.goal_direction) === 'green'
  }).length
  const offTarget = Object.entries(allUserValues).filter(([key, vals]) => {
    const latest = vals.find(v => v.week_start === weekStart)
    if (!latest) return false
    const kpiId = key.split('_')[1]
    const kpi = kpis.find(k => k.id === kpiId)
    return kpi && getStatus(latest.value, kpi.goal_value, kpi.goal_direction) === 'red'
  }).length

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">KPIs</h1>
            <p className="page-subtitle">Individual performance tracking per team member — {weekStart}</p>
          </div>
          {isManagement && (
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Plus size={15} /> Add KPI
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">KPIs Defined</div><div className="stat-box-value">{kpis.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Logged This Week</div><div className="stat-box-value text-accent">{totalLogged}</div></div>
          <div className="stat-box"><div className="stat-box-label">On Target</div><div className="stat-box-value text-green">{onTarget}</div></div>
          <div className="stat-box"><div className="stat-box-label">Off Target</div><div className="stat-box-value text-red">{offTarget}</div></div>
        </div>

        {/* Dept filter */}
        <div className="tabs">
          {DEPT_OPTIONS.map(d => (
            <button key={d} className={`tab ${dept === d ? 'active' : ''}`} onClick={() => setDept(d)}>
              {d === 'all' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : Object.values(grouped).length === 0 ? (
          <div className="empty-state"><p>No KPIs found.</p></div>
        ) : (
          Object.values(grouped).map(group => (
            <div key={`${group.dept}-${group.role}`} style={{ marginBottom: 32 }}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="section-title">{ROLE_LABELS[group.role] || group.role}</h2>
                <span className={`dept-tag ${group.dept}`}>{group.dept}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.kpis.map(kpi => (
                  <KPIGroupCard
                    key={kpi.id}
                    kpi={kpi}
                    members={members}
                    allUserValues={allUserValues}
                    onLog={(k, m) => setLogTarget({ kpi: k, member: m })}
                    onEdit={k => setEditKPI(k)}
                    onDelete={handleDelete}
                    isManagement={isManagement}
                    currentUserId={profile?.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {logTarget && (
        <LogValueModal
          kpi={logTarget.kpi}
          targetUser={logTarget.member}
          onClose={() => setLogTarget(null)}
          onSave={load}
        />
      )}
      {editKPI && <EditKPIModal kpi={editKPI} onClose={() => setEditKPI(null)} onSave={load} />}
      {showAdd && <AddKPIModal onClose={() => setShowAdd(false)} onSave={load} />}
    </>
  )
}
