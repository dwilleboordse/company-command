import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ChevronDown, ChevronUp, Plus, Trash2, Edit2, Check, X } from 'lucide-react'

const STATUS_OPTIONS = ['not_started','started','half','three_quarters','completed']
const STATUS_LABELS = { not_started:'Not Started', started:'Started', half:'50% Done', three_quarters:'75% Done', completed:'Completed' }
const STATUS_COLORS = { not_started:'gray', started:'red', half:'amber', three_quarters:'amber', completed:'green' }
const ROLE_LABELS = { marketing:'Marketing', media_buyer:'Media Buyer', creative_strategist:'Creative Strategist', editor:'Editor', designer:'Designer', ugc_manager:'UGC Manager', email_marketer:'Email Marketer', ops_manager:'Operations Manager', ops_assistant:'Operations Assistant', hr_manager:'HR Manager', management:'Management' }

function getCompletionPct(milestones) {
  if (!milestones.length) return 0
  const vals = { not_started:0, started:0.25, half:0.5, three_quarters:0.75, completed:1 }
  return Math.round((milestones.reduce((s,m) => s + (vals[m.status]||0), 0) / milestones.length) * 100)
}

function AddMilestoneModal({ onClose, onSave }) {
  const [form, setForm] = useState({ department:'delivery', role_type:'creative_strategist', system_name:'', milestone_name:'' })
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!form.system_name || !form.milestone_name) return
    setSaving(true)
    await supabase.from('milestones').insert({ ...form, status:'not_started' })
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add Milestone</h2>
        <div className="grid-2">
          <div className="form-group"><label>Department</label>
            <select value={form.department} onChange={e => setForm({...form, department:e.target.value})}>
              {['marketing','delivery','operations','management'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Role Type</label>
            <select value={form.role_type} onChange={e => setForm({...form, role_type:e.target.value})}>
              {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group"><label>System Name</label><input value={form.system_name} onChange={e => setForm({...form, system_name:e.target.value})} placeholder="e.g. Creative Volume Control System" /></div>
        <div className="form-group"><label>Milestone Name</label><input value={form.milestone_name} onChange={e => setForm({...form, milestone_name:e.target.value})} placeholder="e.g. Define weekly test plan" /></div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Adding...' : 'Add Milestone'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function InlineEdit({ value, onSave, onCancel }) {
  const [v, setV] = useState(value)
  return (
    <div className="flex items-center gap-2" style={{ flex: 1 }}>
      <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSave(v)} style={{ fontSize: 13, padding: '4px 8px' }} autoFocus />
      <button className="btn btn-primary btn-icon btn-sm" onClick={() => onSave(v)}><Check size={12} /></button>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel}><X size={12} /></button>
    </div>
  )
}

function SystemGroup({ systemName, milestones, canEdit, onStatusChange, onDelete, onRename, onRenameSystem }) {
  const [open, setOpen] = useState(false)
  const [editingSystem, setEditingSystem] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const pct = getCompletionPct(milestones)
  const allDone = milestones.every(m => m.status === 'completed')

  return (
    <div className="ms-system">
      <div className="ms-system-header" onClick={() => !editingSystem && setOpen(!open)}>
        <div className="flex items-center gap-3" style={{ flex: 1 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background: allDone ? 'var(--green-dim)' : 'var(--bg)', border:`2px solid ${allDone ? 'var(--green)' : 'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontFamily:'var(--font-mono)', fontWeight:700, color: allDone ? 'var(--green)' : 'var(--text-muted)', flexShrink:0 }}>
            {pct}%
          </div>
          {editingSystem && canEdit ? (
            <InlineEdit value={systemName} onSave={v => { onRenameSystem(v); setEditingSystem(false) }} onCancel={() => setEditingSystem(false)} />
          ) : (
            <div style={{ flex: 1 }}>
              <div className="ms-system-title">{systemName}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{milestones.filter(m => m.status === 'completed').length}/{milestones.length} steps</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !editingSystem && <button className="btn btn-ghost btn-icon btn-sm" onClick={e => { e.stopPropagation(); setEditingSystem(true) }}><Edit2 size={12} /></button>}
          <div className="progress-bar-wrap" style={{ width:80, marginTop:0 }}><div className="progress-bar-fill green" style={{ width:`${pct}%` }} /></div>
          {open ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
        </div>
      </div>

      {open && (
        <div className="ms-system-body">
          {milestones.map(ms => (
            <div key={ms.id} className="ms-item">
              <div className={`ms-dot ${ms.status}`} />
              {editingId === ms.id && canEdit ? (
                <InlineEdit value={ms.milestone_name} onSave={v => { onRename(ms.id, v); setEditingId(null) }} onCancel={() => setEditingId(null)} />
              ) : (
                <span className="ms-item-name">{ms.milestone_name}</span>
              )}
              {canEdit ? (
                <select value={ms.status} onChange={e => onStatusChange(ms.id, e.target.value)} style={{ width:'auto', fontSize:11, padding:'4px 28px 4px 8px', fontFamily:'var(--font-mono)' }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              ) : (
                <span className={`badge ${STATUS_COLORS[ms.status]}`}>{STATUS_LABELS[ms.status]}</span>
              )}
              {canEdit && editingId !== ms.id && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditingId(ms.id)}><Edit2 size={12} /></button>
              )}
              {canEdit && (
                <button className="btn btn-danger btn-icon btn-sm" onClick={() => onDelete(ms.id)}><Trash2 size={12} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Milestones() {
  const { profile, isManagement } = useAuth()
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  const [deptFilter, setDeptFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('open')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { loadMilestones() }, [profile, deptFilter, statusFilter])

  async function loadMilestones() {
    if (!profile) return; setLoading(true)
    let q = supabase.from('milestones').select('*').eq('is_active', true).order('department').order('role_type').order('system_name')
    if (!isManagement && profile.position) q = q.eq('role_type', profile.position)
    if (deptFilter !== 'all') q = q.eq('department', deptFilter)
    if (statusFilter === 'open') q = q.neq('status', 'completed')
    if (statusFilter === 'completed') q = q.eq('status', 'completed')
    const { data } = await q
    setMilestones(data || []); setLoading(false)
  }

  async function handleStatusChange(id, status) {
    await supabase.from('milestones').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setMilestones(prev => prev.map(m => m.id === id ? {...m, status} : m))
  }

  async function handleDelete(id) {
    if (!confirm('Delete this milestone?')) return
    await supabase.from('milestones').update({ is_active: false }).eq('id', id)
    setMilestones(prev => prev.filter(m => m.id !== id))
  }

  async function handleRename(id, name) {
    await supabase.from('milestones').update({ milestone_name: name }).eq('id', id)
    setMilestones(prev => prev.map(m => m.id === id ? {...m, milestone_name: name} : m))
  }

  async function handleRenameSystem(dept, role, oldName, newName) {
    const ids = milestones.filter(m => m.department === dept && m.role_type === role && m.system_name === oldName).map(m => m.id)
    for (const id of ids) await supabase.from('milestones').update({ system_name: newName }).eq('id', id)
    setMilestones(prev => prev.map(m => m.system_name === oldName && m.department === dept && m.role_type === role ? {...m, system_name: newName} : m))
  }

  const grouped = milestones.reduce((acc, ms) => {
    const dk = ms.department, rk = ms.role_type, sk = ms.system_name
    if (!acc[dk]) acc[dk] = {}
    if (!acc[dk][rk]) acc[dk][rk] = {}
    if (!acc[dk][rk][sk]) acc[dk][rk][sk] = []
    acc[dk][rk][sk].push(ms)
    return acc
  }, {})

  const overallPct = getCompletionPct(milestones)

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1 className="page-title">Milestones</h1><p className="page-subtitle">Systems and sub-goals that drive KPI achievement</p></div>
          {isManagement && <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Milestone</button>}
        </div>
      </div>
      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">Overall Progress</div><div className="stat-box-value text-accent">{overallPct}%</div></div>
          <div className="stat-box"><div className="stat-box-label">Completed</div><div className="stat-box-value text-green">{milestones.filter(m => m.status==='completed').length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Open</div><div className="stat-box-value text-amber">{milestones.filter(m => m.status!=='completed').length}</div></div>
        </div>
        <div className="flex gap-3 mb-6">
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ width:'auto' }}>
            <option value="all">All Departments</option>
            {['marketing','delivery','operations','management'].map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width:'auto' }}>
            <option value="all">All Statuses</option>
            <option value="open">Open Only</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        {loading ? <div className="loading-screen" style={{ minHeight:200 }}><div className="spinner" /></div>
          : Object.keys(grouped).length === 0 ? <div className="empty-state"><p>No milestones found.</p></div>
          : Object.entries(grouped).map(([dept, roles]) => (
            <div key={dept} style={{ marginBottom:36 }}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="section-title" style={{ fontSize:18 }}>{dept.charAt(0).toUpperCase()+dept.slice(1)}</h2>
                <span className={`dept-tag ${dept}`}>{dept}</span>
              </div>
              {Object.entries(roles).map(([role, systems]) => (
                <div key={role} style={{ marginBottom:24 }}>
                  <h3 style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:10 }}>{ROLE_LABELS[role]||role}</h3>
                  {Object.entries(systems).map(([sysName, items]) => (
                    <SystemGroup key={sysName} systemName={sysName} milestones={items}
                      canEdit={isManagement || items.some(m => m.owner_id === profile?.id)}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onRenameSystem={newName => handleRenameSystem(dept, role, sysName, newName)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
      </div>
      {showAdd && <AddMilestoneModal onClose={() => setShowAdd(false)} onSave={loadMilestones} />}
    </>
  )
}
