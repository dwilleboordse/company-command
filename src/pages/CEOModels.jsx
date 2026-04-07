import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Plus, Edit2, Lock } from 'lucide-react'

const MODEL_TYPES = [
  { key: 'growth', label: 'Growth Model', desc: 'Cost to acquire a client — leads, conversion, CAC', color: '#22c55e' },
  { key: 'business', label: 'Business Model', desc: 'Cost to serve a client — margin, utilization, LTV', color: '#3b82f6' },
  { key: 'financial', label: 'Financial Model', desc: 'Forward visibility — MRR, profit, runway', color: '#f59e0b' },
]

function getStatus(m) {
  if (!m.goal_value) return 'gray'
  const ratio = m.goal_direction === 'min'
    ? m.goal_value / Math.max(m.current_value, 0.01)
    : m.current_value / Math.max(m.goal_value, 0.01)
  if (ratio >= 0.9) return 'green'
  if (ratio >= 0.7) return 'amber'
  return 'red'
}

function EditModelModal({ model, onClose, onSave }) {
  const [form, setForm] = useState({
    metric_name: model.metric_name,
    goal_value: model.goal_value,
    current_value: model.current_value,
    goal_direction: model.goal_direction,
    unit: model.unit,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('ceo_models').update({ ...form, updated_at: new Date().toISOString() }).eq('id', model.id)
    // Log entry
    const weekStart = getMonday()
    await supabase.from('ceo_model_entries').insert({ model_id: model.id, value: parseFloat(form.current_value) || 0, week_start: weekStart })
    onSave()
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Update Metric</h2>
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
            <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="%, $, #, days, mo" />
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save & Log'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function AddModelMetricModal({ onClose, onSave }) {
  const [form, setForm] = useState({ model_type: 'growth', metric_name: '', goal_value: '', current_value: '', goal_direction: 'max', unit: '%' })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.metric_name) return
    setSaving(true)
    await supabase.from('ceo_models').insert({ ...form, goal_value: parseFloat(form.goal_value) || 0, current_value: parseFloat(form.current_value) || 0 })
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add Metric</h2>
        <div className="form-group">
          <label>Model</label>
          <select value={form.model_type} onChange={e => setForm({ ...form, model_type: e.target.value })}>
            {MODEL_TYPES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Metric Name</label>
          <input value={form.metric_name} onChange={e => setForm({ ...form, metric_name: e.target.value })} placeholder="e.g. MRR" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Current</label>
            <input type="number" value={form.current_value} onChange={e => setForm({ ...form, current_value: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Goal</label>
            <input type="number" value={form.goal_value} onChange={e => setForm({ ...form, goal_value: e.target.value })} />
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Unit</label>
            <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Direction</label>
            <select value={form.goal_direction} onChange={e => setForm({ ...form, goal_direction: e.target.value })}>
              <option value="max">Higher is better</option>
              <option value="min">Lower is better</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Adding...' : 'Add Metric'}</button>
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

export default function CEOModels() {
  const { isCEO } = useAuth()
  const [models, setModels] = useState({})
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [editModel, setEditModel] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [activeTab, setActiveTab] = useState('growth')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('ceo_models').select('*').order('model_type').order('metric_name')
    const grouped = (data || []).reduce((acc, m) => {
      if (!acc[m.model_type]) acc[m.model_type] = []
      acc[m.model_type].push(m)
      return acc
    }, {})
    setModels(grouped)
    setLoading(false)
  }

  async function loadEntries(modelId) {
    if (entries[modelId]) return
    const { data } = await supabase.from('ceo_model_entries').select('*').eq('model_id', modelId).order('week_start').limit(12)
    setEntries(prev => ({ ...prev, [modelId]: data || [] }))
  }

  if (!isCEO) return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Lock size={40} color="var(--text-muted)" />
      <p className="text-muted" style={{ marginTop: 12 }}>CEO access only.</p>
    </div>
  )

  const currentModels = models[activeTab] || []
  const mConfig = MODEL_TYPES.find(m => m.key === activeTab)

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">
              CEO Models
              <span className="ceo-badge"><Lock size={9} /> CEO Only</span>
            </h1>
            <p className="page-subtitle">Growth, Business, and Financial models — private to Dennis</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Metric
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="tabs">
          {MODEL_TYPES.map(m => (
            <button key={m.key} className={`tab ${activeTab === m.key ? 'active' : ''}`} onClick={() => setActiveTab(m.key)}>
              {m.label}
            </button>
          ))}
        </div>

        {mConfig && (
          <p className="text-secondary text-sm mb-6">{mConfig.desc}</p>
        )}

        {loading ? (
          <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : currentModels.length === 0 ? (
          <div className="empty-state">
            <p>No metrics yet. Add your first metric for this model.</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>Add Metric</button>
          </div>
        ) : (
          <div className="kpi-grid">
            {currentModels.map(m => {
              const status = getStatus(m)
              const pct = m.goal_value ? Math.min(100, m.goal_direction === 'min'
                ? (m.goal_value / Math.max(m.current_value, 0.01)) * 100
                : (m.current_value / m.goal_value) * 100) : 0

              return (
                <div key={m.id} className={`kpi-card ${status}`} style={{ cursor: 'pointer' }}
                  onClick={() => { setEditModel(m); loadEntries(m.id) }}>
                  <div className="kpi-metric">{m.metric_name}</div>
                  <div className={`kpi-value ${status}`} style={{ fontSize: 28 }}>
                    {m.unit === '$' && '$'}{m.current_value || '—'}{m.unit !== '$' && m.current_value ? m.unit : ''}
                  </div>
                  <div className="kpi-goal">
                    Goal: <span>{m.goal_direction === 'min' ? '≤' : '≥'}{m.unit === '$' ? '$' : ''}{m.goal_value || 'Not set'}{m.unit !== '$' && m.goal_value ? m.unit : ''}</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div className={`progress-bar-fill ${status}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setEditModel(m); loadEntries(m.id) }}>
                      <Edit2 size={11} /> Update
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Trend charts */}
        {currentModels.filter(m => entries[m.id]?.length > 1).map(m => (
          <div key={`chart-${m.id}`} className="chart-wrap mt-6">
            <div className="chart-title">{m.metric_name} — Trend</div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={entries[m.id]?.map(e => ({ week: e.week_start?.slice(5), value: e.value }))}>
                <XAxis dataKey="week" tick={{ fill: '#3d526e', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#3d526e', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0e1420', border: '1px solid #1e2d47', borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={m.goal_value} stroke={mConfig?.color} strokeDasharray="4 4" strokeOpacity={0.5} />
                <Line type="monotone" dataKey="value" stroke={mConfig?.color || '#3b82f6'} strokeWidth={2} dot={{ fill: mConfig?.color || '#3b82f6', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {editModel && <EditModelModal model={editModel} onClose={() => setEditModel(null)} onSave={load} />}
      {showAdd && <AddModelMetricModal onClose={() => setShowAdd(false)} onSave={load} />}
    </>
  )
}
