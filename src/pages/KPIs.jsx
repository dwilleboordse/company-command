import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Plus, Edit2, Check, X } from 'lucide-react'

const DEPT_OPTIONS = ['all', 'company', 'marketing', 'delivery', 'operations', 'management']
const ROLE_LABELS = {
  company_wide: 'Company Wide', marketing: 'Marketing', media_buyer: 'Media Buyer',
  creative_strategist: 'Creative Strategist', editor: 'Editor', designer: 'Designer',
  ugc_manager: 'UGC Manager', email_marketer: 'Email Marketer', ops_manager: 'Operations Manager',
  ops_assistant: 'Operations Assistant', hr_manager: 'HR Manager', management: 'Management',
}

function getStatus(kpi) {
  if (!kpi.goal_value) return 'gray'
  const ratio = kpi.goal_direction === 'min'
    ? kpi.goal_value / Math.max(kpi.current_value, 0.01)
    : kpi.current_value / Math.max(kpi.goal_value, 0.01)
  if (ratio >= 0.9) return 'green'
  if (ratio >= 0.7) return 'amber'
  return 'red'
}

function getProgress(kpi) {
  if (!kpi.goal_value) return 0
  if (kpi.goal_direction === 'min') {
    return Math.min(100, (kpi.goal_value / Math.max(kpi.current_value, 0.01)) * 100)
  }
  return Math.min(100, (kpi.current_value / Math.max(kpi.goal_value, 0.01)) * 100)
}

function KPIChart({ kpi, entries }) {
  if (!entries || entries.length < 2) return (
    <p className="text-muted text-sm" style={{ padding: '12px 0' }}>No trend data yet. Update this KPI weekly to see the chart.</p>
  )
  const data = entries.map(e => ({ week: e.week_start?.slice(5), value: e.value }))
  const color = getStatus(kpi) === 'green' ? '#22c55e' : getStatus(kpi) === 'red' ? '#ef4444' : '#f59e0b'
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="week" tick={{ fill: '#3d526e', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#3d526e', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#0e1420', border: '1px solid #1e2d47', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#7a8ba8' }}
          itemStyle={{ color: color }}
        />
        <ReferenceLine y={kpi.goal_value} stroke={color} strokeDasharray="4 4" strokeOpacity={0.5} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function EditKPIModal({ kpi, onClose, onSave }) {
  const [form, setForm] = useState({
    metric_name: kpi.metric_name,
    goal_value: kpi.goal_value,
    current_value: kpi.current_value,
    goal_direction: kpi.goal_direction,
    unit: kpi.unit,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('kpis').update({
      ...form,
      updated_at: new Date().toISOString()
    }).eq('id', kpi.id)
    if (!error) {
      // Also log entry for history
      const weekStart = getMonday()
      await supabase.from('kpi_entries').insert({
        kpi_id: kpi.id,
        value: parseFloat(form.current_value),
        week_start: weekStart,
      })
      onSave()
    }
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Update KPI</h2>
        <div className="form-group">
          <label>Metric Name</label>
          <input value={form.metric_name} onChange={e => setForm({ ...form, metric_name: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Current Value</label>
            <input type="number" value={form.current_value} onChange={e => setForm({ ...form, current_value: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Goal Value</label>
            <input type="number" value={form.goal_value} onChange={e => setForm({ ...form, goal_value: e.target.value })} />
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Unit</label>
            <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="%, #, $, mo" />
          </div>
          <div className="form-group">
            <label>Direction</label>
            <select value={form.goal_direction} onChange={e => setForm({ ...form, goal_direction: e.target.value })}>
              <option value="max">Higher is better (≥)</option>
              <option value="min">Lower is better (≤)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save & Log Entry'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function AddKPIModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    department: 'delivery', role_type: 'creative_strategist', metric_name: '',
    goal_value: '', current_value: '', goal_direction: 'max', unit: '%', visibility: 'team'
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.metric_name) return
    setSaving(true)
    await supabase.from('kpis').insert({ ...form, goal_value: parseFloat(form.goal_value) || 0, current_value: parseFloat(form.current_value) || 0 })
    onSave()
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add KPI</h2>
        <div className="form-group">
          <label>Metric Name</label>
          <input value={form.metric_name} onChange={e => setForm({ ...form, metric_name: e.target.value })} placeholder="e.g. First Pass Approval Rate" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Department</label>
            <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
              {['company', 'marketing', 'delivery', 'operations', 'management'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Role Type</label>
            <select value={form.role_type} onChange={e => setForm({ ...form, role_type: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Current Value</label>
            <input type="number" value={form.current_value} onChange={e => setForm({ ...form, current_value: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Goal Value</label>
            <input type="number" value={form.goal_value} onChange={e => setForm({ ...form, goal_value: e.target.value })} />
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Unit</label>
            <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="%, #, $" />
          </div>
          <div className="form-group">
            <label>Direction</label>
            <select value={form.goal_direction} onChange={e => setForm({ ...form, goal_direction: e.target.value })}>
              <option value="max">Higher is better</option>
              <option value="min">Lower is better</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Visibility</label>
          <select value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}>
            <option value="team">Team (all athletes)</option>
            <option value="management">Management only</option>
            <option value="ceo">CEO only</option>
          </select>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Adding...' : 'Add KPI'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function getMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export default function KPIs() {
  const { profile, isCEO, isManagement } = useAuth()
  const [kpis, setKpis] = useState([])
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [dept, setDept] = useState('all')
  const [editKPI, setEditKPI] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedKPI, setExpandedKPI] = useState(null)

  useEffect(() => { loadKPIs() }, [profile, dept])

  async function loadKPIs() {
    if (!profile) return
    setLoading(true)

    let q = supabase.from('kpis').select('*').eq('is_active', true).order('department').order('role_type')

    if (!isCEO && !isManagement) {
      q = q.eq('visibility', 'team')
      if (profile.position) q = q.eq('role_type', profile.position)
    } else if (!isCEO) {
      q = q.in('visibility', ['team', 'management'])
    }

    if (dept !== 'all') q = q.eq('department', dept)

    const { data } = await q
    setKpis(data || [])
    setLoading(false)
  }

  async function loadEntries(kpiId) {
    if (entries[kpiId]) return
    const { data } = await supabase.from('kpi_entries').select('*')
      .eq('kpi_id', kpiId).order('week_start').limit(12)
    setEntries(prev => ({ ...prev, [kpiId]: data || [] }))
  }

  async function toggleExpand(kpi) {
    if (expandedKPI === kpi.id) { setExpandedKPI(null); return }
    setExpandedKPI(kpi.id)
    await loadEntries(kpi.id)
  }

  // Group by department + role
  const grouped = kpis.reduce((acc, kpi) => {
    const key = `${kpi.department}__${kpi.role_type}`
    if (!acc[key]) acc[key] = { dept: kpi.department, role: kpi.role_type, kpis: [] }
    acc[key].kpis.push(kpi)
    return acc
  }, {})

  const onTarget = kpis.filter(k => getStatus(k) === 'green').length
  const offTarget = kpis.filter(k => getStatus(k) === 'red').length
  const close = kpis.filter(k => getStatus(k) === 'amber').length

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">KPIs</h1>
            <p className="page-subtitle">Track, update, and visualize performance metrics across the team</p>
          </div>
          {isManagement && (
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Plus size={15} /> Add KPI
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Summary */}
        <div className="stat-row">
          <div className="stat-box">
            <div className="stat-box-label">Total KPIs</div>
            <div className="stat-box-value">{kpis.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">On Target</div>
            <div className="stat-box-value text-green">{onTarget}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Close</div>
            <div className="stat-box-value text-amber">{close}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Off Target</div>
            <div className="stat-box-value text-red">{offTarget}</div>
          </div>
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
          <div className="empty-state"><p>No KPIs found for this filter.</p></div>
        ) : (
          Object.values(grouped).map(group => (
            <div key={`${group.dept}-${group.role}`} style={{ marginBottom: 32 }}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="section-title">{ROLE_LABELS[group.role] || group.role}</h2>
                <span className={`dept-tag ${group.dept}`}>{group.dept}</span>
              </div>
              <div className="kpi-grid">
                {group.kpis.map(kpi => {
                  const status = getStatus(kpi)
                  const progress = getProgress(kpi)
                  const isExpanded = expandedKPI === kpi.id
                  return (
                    <div key={kpi.id} className={`kpi-card ${status}`} style={{ cursor: 'pointer' }}>
                      <div onClick={() => toggleExpand(kpi)}>
                        <div className="kpi-metric">{kpi.metric_name}</div>
                        <div className={`kpi-value ${status}`}>
                          {kpi.unit === '$' ? '$' : ''}{kpi.current_value}{kpi.unit === '$' ? '' : kpi.unit}
                        </div>
                        <div className="kpi-goal">
                          Goal: <span>{kpi.goal_direction === 'min' ? '≤' : '≥'}{kpi.unit === '$' ? '$' : ''}{kpi.goal_value}{kpi.unit === '$' ? '' : kpi.unit}</span>
                        </div>
                        <div className="progress-bar-wrap">
                          <div className={`progress-bar-fill ${status}`} style={{ width: `${progress}%` }} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                          <KPIChart kpi={kpi} entries={entries[kpi.id]} />
                          {isManagement && (
                            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setEditKPI(kpi)}>
                              <Edit2 size={12} /> Update Value
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {editKPI && <EditKPIModal kpi={editKPI} onClose={() => setEditKPI(null)} onSave={loadKPIs} />}
      {showAdd && <AddKPIModal onClose={() => setShowAdd(false)} onSave={loadKPIs} />}
    </>
  )
}
