import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Plus, Edit2, Trash2, Lock } from 'lucide-react'

const MODEL_TYPES = [
  { key:'growth', label:'Growth Model', desc:'Cost to acquire a client — leads, conversion, CAC', color:'#22c55e' },
  { key:'business', label:'Business Model', desc:'Cost to serve a client — margin, utilization, LTV', color:'#3b82f6' },
  { key:'financial', label:'Financial Model', desc:'Forward visibility — MRR, profit, runway', color:'#f59e0b' },
]

function getStatus(m) {
  if (!m.goal_value) return 'gray'
  const r = m.goal_direction==='min' ? m.goal_value/Math.max(m.current_value,0.01) : m.current_value/Math.max(m.goal_value,0.01)
  return r>=0.9?'green':r>=0.7?'amber':'red'
}
function getMonday() {
  const d=new Date(),day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1)
  d.setDate(diff);return d.toISOString().split('T')[0]
}

function ModelModal({ model, onClose, onSave }) {
  const [form, setForm] = useState({ metric_name:model.metric_name, goal_value:model.goal_value, current_value:model.current_value, goal_direction:model.goal_direction, unit:model.unit })
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    setSaving(true)
    await supabase.from('ceo_models').update({ ...form, updated_at:new Date().toISOString() }).eq('id',model.id)
    await supabase.from('ceo_model_entries').insert({ model_id:model.id, value:parseFloat(form.current_value)||0, week_start:getMonday() })
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">Edit Metric</h2>
        <div className="form-group"><label>Metric Name</label><input value={form.metric_name} onChange={e=>setForm({...form,metric_name:e.target.value})} /></div>
        <div className="grid-2">
          <div className="form-group"><label>Current Value</label><input type="number" value={form.current_value} onChange={e=>setForm({...form,current_value:e.target.value})} /></div>
          <div className="form-group"><label>Goal Value</label><input type="number" value={form.goal_value} onChange={e=>setForm({...form,goal_value:e.target.value})} /></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Unit</label><input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} /></div>
          <div className="form-group"><label>Direction</label>
            <select value={form.goal_direction} onChange={e=>setForm({...form,goal_direction:e.target.value})}>
              <option value="max">Higher is better (≥)</option>
              <option value="min">Lower is better (≤)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':'Save & Log'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function AddModal({ activeTab, onClose, onSave }) {
  const [form, setForm] = useState({ model_type:activeTab, metric_name:'', goal_value:'', current_value:'', goal_direction:'max', unit:'%' })
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!form.metric_name) return; setSaving(true)
    await supabase.from('ceo_models').insert({ ...form, goal_value:parseFloat(form.goal_value)||0, current_value:parseFloat(form.current_value)||0 })
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">Add Metric</h2>
        <div className="form-group"><label>Model</label>
          <select value={form.model_type} onChange={e=>setForm({...form,model_type:e.target.value})}>
            {MODEL_TYPES.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Metric Name</label><input value={form.metric_name} onChange={e=>setForm({...form,metric_name:e.target.value})} placeholder="e.g. MRR" /></div>
        <div className="grid-2">
          <div className="form-group"><label>Current</label><input type="number" value={form.current_value} onChange={e=>setForm({...form,current_value:e.target.value})} /></div>
          <div className="form-group"><label>Goal</label><input type="number" value={form.goal_value} onChange={e=>setForm({...form,goal_value:e.target.value})} /></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Unit</label><input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} /></div>
          <div className="form-group"><label>Direction</label>
            <select value={form.goal_direction} onChange={e=>setForm({...form,goal_direction:e.target.value})}>
              <option value="max">Higher is better</option>
              <option value="min">Lower is better</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Adding...':'Add Metric'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
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
    const grouped = (data||[]).reduce((acc,m) => { if (!acc[m.model_type]) acc[m.model_type]=[]; acc[m.model_type].push(m); return acc }, {})
    setModels(grouped); setLoading(false)
  }

  async function loadEntries(modelId) {
    const { data } = await supabase.from('ceo_model_entries').select('*').eq('model_id',modelId).order('week_start').limit(16)
    setEntries(prev => ({...prev,[modelId]:data||[]}))
  }

  async function handleEdit(m) {
    setEditModel(m)
    await loadEntries(m.id)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this metric?')) return
    await supabase.from('ceo_model_entries').delete().eq('model_id',id)
    await supabase.from('ceo_models').delete().eq('id',id)
    load()
  }

  if (!isCEO) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'60vh' }}>
      <Lock size={40} color="var(--text-muted)"/><p className="text-muted" style={{ marginTop:12 }}>CEO access only.</p>
    </div>
  )

  const currentModels = models[activeTab] || []
  const mConfig = MODEL_TYPES.find(m=>m.key===activeTab)

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">CEO Models <span className="ceo-badge"><Lock size={9}/> CEO Only</span></h1>
            <p className="page-subtitle">Growth, Business, and Financial models</p>
          </div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> Add Metric</button>
        </div>
      </div>
      <div className="page-body">
        <div className="tabs">
          {MODEL_TYPES.map(m=><button key={m.key} className={`tab ${activeTab===m.key?'active':''}`} onClick={()=>setActiveTab(m.key)}>{m.label}</button>)}
        </div>
        {mConfig && <p className="text-secondary text-sm mb-6">{mConfig.desc}</p>}

        {loading ? <div className="loading-screen" style={{ minHeight:200 }}><div className="spinner"/></div>
          : currentModels.length===0 ? (
            <div className="empty-state"><p>No metrics yet.</p><button className="btn btn-primary btn-sm" style={{ marginTop:12 }} onClick={()=>setShowAdd(true)}>Add Metric</button></div>
          ) : (
            <>
              <div className="kpi-grid">
                {currentModels.map(m => {
                  const status = getStatus(m)
                  const pct = m.goal_value ? Math.min(100, m.goal_direction==='min' ? (m.goal_value/Math.max(m.current_value,0.01))*100 : (m.current_value/m.goal_value)*100) : 0
                  return (
                    <div key={m.id} className={`kpi-card ${status}`}>
                      <div className="kpi-metric">{m.metric_name}</div>
                      <div className={`kpi-value ${status}`} style={{ fontSize:28 }}>{m.unit==='$'&&'$'}{m.current_value||'—'}{m.unit!=='$'&&m.current_value?m.unit:''}</div>
                      <div className="kpi-goal">Goal: <span>{m.goal_direction==='min'?'≤':'≥'}{m.unit==='$'?'$':''}{m.goal_value||'Not set'}{m.unit!=='$'&&m.goal_value?m.unit:''}</span></div>
                      <div className="progress-bar-wrap"><div className={`progress-bar-fill ${status}`} style={{ width:`${pct}%` }}/></div>
                      <div className="flex gap-2 mt-3">
                        <button className="btn btn-ghost btn-sm" onClick={()=>handleEdit(m)}><Edit2 size={12}/> Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(m.id)}><Trash2 size={12}/> Delete</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Trend charts for all metrics with history */}
              <div style={{ marginTop:32 }}>
                <h3 className="section-title mb-4">Weekly Trends</h3>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
                  {currentModels.map(m => {
                    const data = entries[m.id]
                    if (!data) {
                      // Load entries for this model
                      loadEntries(m.id)
                      return null
                    }
                    return (
                      <div key={`chart-${m.id}`} className="chart-wrap">
                        <div className="chart-title">{m.metric_name}</div>
                        {data.length < 2 ? (
                          <p className="text-muted text-sm">Update this metric weekly to see trend.</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={140}>
                            <LineChart data={data.map(e=>({week:e.week_start?.slice(5),value:e.value}))}>
                              <XAxis dataKey="week" tick={{fill:'#3d526e',fontSize:10}} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fill:'#3d526e',fontSize:10}} axisLine={false} tickLine={false}/>
                              <Tooltip contentStyle={{background:'#0e1420',border:'1px solid #1e2d47',borderRadius:8,fontSize:11}}/>
                              <ReferenceLine y={m.goal_value} stroke={mConfig?.color} strokeDasharray="4 4" strokeOpacity={0.4}/>
                              <Line type="monotone" dataKey="value" stroke={mConfig?.color||'#3b82f6'} strokeWidth={2} dot={{fill:mConfig?.color||'#3b82f6',r:3}}/>
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
      </div>
      {editModel && <ModelModal model={editModel} onClose={()=>setEditModel(null)} onSave={load}/>}
      {showAdd && <AddModal activeTab={activeTab} onClose={()=>setShowAdd(false)} onSave={load}/>}
    </>
  )
}
