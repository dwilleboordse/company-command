import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, BookOpen, Check } from 'lucide-react'

const ROLE_LABELS = {
  company_wide:'Company Wide', marketing:'Marketing', media_buyer:'Media Buyer',
  creative_strategist:'Creative Strategist', editor:'Editor', designer:'Designer',
  ugc_manager:'UGC Manager', email_marketer:'Email Marketer', ops_manager:'Operations Manager',
  ops_assistant:'Operations Assistant', hr_manager:'HR Manager', management:'Management',
}
const ROLE_COLORS = {
  creative_strategist:'#16a34a', media_buyer:'#3b82f6', editor:'#8b5cf6',
  designer:'#dc2626', ugc_manager:'#06b6d4', email_marketer:'#d97706',
  ops_manager:'#3b82f6', ops_assistant:'#06b6d4', hr_manager:'#a78bfa',
  marketing:'#d97706', management:'#7c3aed', company_wide:'#d97706',
}

function currentQuarter() {
  const m=new Date().getMonth()+1, y=new Date().getFullYear()
  return `Q${m<=3?1:m<=6?2:m<=9?3:4}-${y}`
}
function quarterEndDate(q) {
  const [qpart,year]=q.split('-'); const num=parseInt(qpart.replace('Q',''))
  return new Date(parseInt(year),num*3,0)
}
function daysUntilEnd(q) { return Math.ceil((quarterEndDate(q)-new Date())/(1000*60*60*24)) }
function quarterProgress(q) {
  const [qpart,year]=q.split('-'); const num=parseInt(qpart.replace('Q',''))
  const start=new Date(parseInt(year),(num-1)*3,1), end=quarterEndDate(q)
  return Math.min(100,Math.max(0,Math.round(((new Date()-start)/(end-start))*100)))
}
function parseAssignees(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  try { return JSON.parse(val) } catch { return [] }
}

const INIT_STATUSES = [
  { key:'not_started',    label:'Not Started', color:'var(--text-muted)',    pct:0   },
  { key:'started',        label:'Started',     color:'var(--accent)',        pct:25  },
  { key:'half',           label:'50% Done',    color:'var(--amber)',         pct:50  },
  { key:'three_quarters', label:'75% Done',    color:'var(--amber)',         pct:75  },
  { key:'completed',      label:'Done',        color:'var(--green)',         pct:100 },
]
function initPct(status) { return INIT_STATUSES.find(s=>s.key===status)?.pct||0 }
function initColor(status) { return INIT_STATUSES.find(s=>s.key===status)?.color||'var(--text-muted)' }

// ── ASSIGNEE PICKER ──────────────────────────────────────────
function AssigneePicker({ allMembers, selected, onChange, accentColor }) {
  const color = accentColor||'var(--accent)'
  if (!allMembers?.length) return null
  return (
    <div className="form-group">
      <label>Assigned Team Members</label>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
        {allMembers.map(m=>{
          const sel=selected.includes(m.id)
          return (
            <div key={m.id} onClick={()=>onChange(sel?selected.filter(x=>x!==m.id):[...selected,m.id])}
              style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:100,
                border:`2px solid ${sel?color:'var(--border)'}`,background:sel?`${color}12`:'var(--bg-input)',
                cursor:'pointer',fontSize:12,fontWeight:sel?600:400,color:sel?color:'var(--text-secondary)',transition:'all 0.12s'}}>
              <div className="user-avatar" style={{width:20,height:20,fontSize:8,border:`1px solid ${sel?color:'var(--border)'}`,background:sel?`${color}20`:'var(--bg)'}}>
                {m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
              </div>
              {m.full_name?.split(' ')[0]} {m.full_name?.split(' ')[1]?m.full_name.split(' ')[1][0]+'.':''}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ASSIGNEE NAMES ───────────────────────────────────────────
function AssigneeNames({ ids, allMembers, color }) {
  if (!ids?.length||!allMembers?.length) return null
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4}}>
      {ids.map(id=>{
        const m=allMembers.find(x=>x.id===id)
        if (!m) return null
        return (
          <div key={id} style={{display:'flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:100,
            background:`${color||'var(--accent)'}10`,border:`1px solid ${color||'var(--accent)'}30`}}>
            <div className="user-avatar" style={{width:16,height:16,fontSize:7,border:'none',background:`${color||'var(--accent)'}20`,color:color||'var(--accent)'}}>
              {m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
            </div>
            <span style={{fontSize:11,color:color||'var(--accent)',fontWeight:500}}>{m.full_name}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── OBJECTIVE MODAL ──────────────────────────────────────────
function ObjectiveModal({ existing, allMembers, onClose, onSave }) {
  const [form,setForm]=useState({
    title:existing?.title||'', description:existing?.description||'',
    department:existing?.department||'delivery', role_type:existing?.role_type||'creative_strategist',
    quarter:existing?.quarter||currentQuarter(),
    assignee_ids:parseAssignees(existing?.assignee_ids),
  })
  const [saving,setSaving]=useState(false)
  async function handleSave() {
    if (!form.title) return; setSaving(true)
    const payload={title:form.title,description:form.description,department:form.department,role_type:form.role_type,quarter:form.quarter,assignee_ids:form.assignee_ids}
    if (existing) await supabase.from('objectives').update(payload).eq('id',existing.id)
    else await supabase.from('objectives').insert({...payload,status:'active'})
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:540}} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit':'New'} Objective</h2>
        <div className="card mb-4" style={{padding:'10px 14px',borderLeft:'3px solid var(--accent)'}}>
          <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6}}>
            <strong style={{color:'var(--accent)'}}>Objective</strong> = What you want to achieve this quarter. Qualitative and ambitious. Not a number.
          </p>
        </div>
        <div className="form-group"><label>Objective Title *</label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Deliver exceptional creative output for every client" autoFocus/>
        </div>
        <div className="form-group"><label>Why does this matter?</label>
          <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={2} style={{resize:'vertical'}}/>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Department</label>
            <select value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>
              {['delivery','marketing','operations','management','company'].map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Role Type</label>
            <select value={form.role_type} onChange={e=>setForm({...form,role_type:e.target.value})}>
              <option value="">All roles</option>
              {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group"><label>Quarter</label>
          <input value={form.quarter} onChange={e=>setForm({...form,quarter:e.target.value})} placeholder="Q2-2026"/>
        </div>
        <AssigneePicker allMembers={allMembers} selected={form.assignee_ids} onChange={ids=>setForm({...form,assignee_ids:ids})} accentColor="var(--accent)"/>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':existing?'Save':'Add Objective'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── KR MODAL ────────────────────────────────────────────────
function KRModal({ objectiveId, existing, allMembers, onClose, onSave }) {
  const [form,setForm]=useState({
    title:existing?.title||'', metric_name:existing?.metric_name||'',
    goal_value:existing?.goal_value||'', goal_direction:existing?.goal_direction||'max',
    unit:existing?.unit||'%', visibility:existing?.visibility||'team',
    current_value:existing?.current_value||'',
    assignee_ids:parseAssignees(existing?.assignee_ids),
  })
  const [saving,setSaving]=useState(false)
  async function handleSave() {
    if (!form.metric_name||!form.goal_value) return; setSaving(true)
    const payload={title:form.title,metric_name:form.metric_name,goal_value:parseFloat(form.goal_value),
      goal_direction:form.goal_direction,unit:form.unit,visibility:form.visibility,
      current_value:parseFloat(form.current_value)||0,assignee_ids:form.assignee_ids}
    if (existing) await supabase.from('key_results').update(payload).eq('id',existing.id)
    else await supabase.from('key_results').insert({...payload,objective_id:objectiveId})
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit':'Add'} Key Result</h2>
        <div className="card mb-4" style={{padding:'10px 14px',borderLeft:'3px solid var(--green)'}}>
          <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6}}>
            <strong style={{color:'var(--green)'}}>Key Result</strong> = A specific measurable outcome. Progress is tracked through initiatives and manual updates — not weekly logs.
          </p>
        </div>
        <div className="form-group"><label>What does achieving this KR prove?</label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Clients approve work faster with less rework"/>
        </div>
        <div className="form-group"><label>Metric Name *</label>
          <input value={form.metric_name} onChange={e=>setForm({...form,metric_name:e.target.value})} placeholder="e.g. First Pass Approval Rate"/>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Goal Value *</label>
            <input type="number" value={form.goal_value} onChange={e=>setForm({...form,goal_value:e.target.value})}/>
          </div>
          <div className="form-group"><label>Current Value</label>
            <input type="number" value={form.current_value} onChange={e=>setForm({...form,current_value:e.target.value})} placeholder="0"/>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Unit</label>
            <input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="%, #, $"/>
          </div>
          <div className="form-group"><label>Direction</label>
            <select value={form.goal_direction} onChange={e=>setForm({...form,goal_direction:e.target.value})}>
              <option value="max">Higher is better (≥)</option>
              <option value="min">Lower is better (≤)</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label>Visibility</label>
          <select value={form.visibility} onChange={e=>setForm({...form,visibility:e.target.value})}>
            <option value="team">Team</option>
            <option value="management">Management only</option>
            <option value="ceo">CEO only</option>
          </select>
        </div>
        <AssigneePicker allMembers={allMembers} selected={form.assignee_ids} onChange={ids=>setForm({...form,assignee_ids:ids})} accentColor="var(--green)"/>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':existing?'Save':'Add KR'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── INITIATIVE MODAL ─────────────────────────────────────────
function InitiativeModal({ kr, existing, allMembers, onClose, onSave }) {
  const [form,setForm]=useState({
    system_name:existing?.system_name||'', milestone_name:existing?.milestone_name||'',
    department:existing?.department||'delivery', role_type:existing?.role_type||'creative_strategist',
    status:existing?.status||'not_started', notes:existing?.notes||'',
    assignee_ids:parseAssignees(existing?.assignee_ids),
  })
  const [saving,setSaving]=useState(false)
  async function handleSave() {
    if (!form.milestone_name) return; setSaving(true)
    const payload={system_name:form.system_name||form.milestone_name,milestone_name:form.milestone_name,
      department:form.department,role_type:form.role_type,status:form.status,
      notes:form.notes,assignee_ids:form.assignee_ids}
    if (existing) await supabase.from('milestones').update(payload).eq('id',existing.id)
    else await supabase.from('milestones').insert({...payload,key_result_id:kr.id,is_active:true})
    onSave(); setSaving(false); onClose()
  }
  const selStatus = INIT_STATUSES.find(s=>s.key===form.status)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit Initiative':'Add Initiative'}</h2>
        <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:16}}>
          Supporting: <strong style={{color:'var(--amber)'}}>{kr.metric_name}</strong>
        </p>
        <div className="form-group"><label>Initiative / Action *</label>
          <input value={form.milestone_name} onChange={e=>setForm({...form,milestone_name:e.target.value})} placeholder="e.g. Build standardized brief template" autoFocus/>
        </div>
        <div className="form-group"><label>Project / System (optional)</label>
          <input value={form.system_name} onChange={e=>setForm({...form,system_name:e.target.value})} placeholder="e.g. Brief Optimization Project"/>
        </div>
        <div className="form-group"><label>Status</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>
            {INIT_STATUSES.map(s=>(
              <div key={s.key} onClick={()=>setForm({...form,status:s.key})}
                style={{padding:'6px 12px',borderRadius:'var(--radius)',cursor:'pointer',fontSize:12,fontWeight:form.status===s.key?600:400,
                  border:`2px solid ${form.status===s.key?s.color:'var(--border)'}`,
                  background:form.status===s.key?`${s.color}12`:'var(--bg-input)',
                  color:form.status===s.key?s.color:'var(--text-secondary)',transition:'all 0.12s'}}>
                {s.label}
              </div>
            ))}
          </div>
        </div>
        <div className="form-group"><label>Notes</label>
          <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2} style={{resize:'vertical'}} placeholder="Context, blockers, next steps..."/>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Department</label>
            <select value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>
              {['delivery','marketing','operations','management'].map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Role Type</label>
            <select value={form.role_type} onChange={e=>setForm({...form,role_type:e.target.value})}>
              {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <AssigneePicker allMembers={allMembers} selected={form.assignee_ids} onChange={ids=>setForm({...form,assignee_ids:ids})} accentColor="var(--amber)"/>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!form.milestone_name}>
            {saving?'Saving...':existing?'Save Changes':'Add Initiative'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── KR ROW ───────────────────────────────────────────────────
function KRRow({ kr, milestones, allMembers, onEdit, onDelete, onInitiativeChange, isManagement, isCEO }) {
  const [expanded,setExpanded]=useState(false)
  const [addingInit,setAddingInit]=useState(false)
  const [editingInit,setEditingInit]=useState(null)
  const [editingValue,setEditingValue]=useState(false)
  const [newValue,setNewValue]=useState(kr.current_value||0)
  const [saving,setSaving]=useState(false)

  const krAssignees = parseAssignees(kr.assignee_ids)
  const initiatives = milestones.filter(m=>m.key_result_id===kr.id)
  const doneInit = initiatives.filter(m=>m.status==='completed').length
  const totalInit = initiatives.length

  // Progress: initiatives drive 50%, current_value drives 50%
  const initProgress = totalInit > 0 ? (doneInit/totalInit)*100 : 0
  const valueProgress = kr.goal_value > 0
    ? Math.min(100, kr.goal_direction==='min'
        ? (kr.goal_value / Math.max(kr.current_value||0, 0.01))*100
        : ((kr.current_value||0) / kr.goal_value)*100)
    : 0
  const overallProgress = totalInit > 0
    ? Math.round(initProgress*0.5 + valueProgress*0.5)
    : Math.round(valueProgress)

  const isOnTrack = overallProgress >= 100
  const statusColor = isOnTrack ? 'var(--green)' : overallProgress >= 60 ? 'var(--amber)' : 'var(--red)'

  async function saveValue() {
    setSaving(true)
    await supabase.from('key_results').update({current_value: parseFloat(newValue)||0}).eq('id', kr.id)
    setSaving(false)
    setEditingValue(false)
    onInitiativeChange()
  }

  return (
    <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:8,boxShadow:'var(--shadow-xs)'}}>
      {/* KR Header */}
      <div style={{padding:'12px 14px',cursor:'pointer',background:'var(--bg-card)'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--green)',background:'var(--green-dim)',padding:'1px 7px',borderRadius:100,fontWeight:600}}>KR</span>
              <span style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{kr.metric_name}</span>
              {totalInit>0&&(
                <span style={{fontSize:9,color:'var(--amber)',fontFamily:'var(--font-mono)',background:'var(--amber-dim)',padding:'1px 6px',borderRadius:100,fontWeight:600}}>
                  {doneInit}/{totalInit} initiatives
                </span>
              )}
            </div>
            {kr.title&&<p style={{fontSize:11,color:'var(--text-muted)',marginTop:2,marginLeft:34}}>{kr.title}</p>}
            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginTop:3,marginLeft:34}}>
              Goal: {kr.goal_direction==='min'?'≤':'≥'}{kr.goal_value}{kr.unit}
              {kr.current_value!=null&&<span style={{marginLeft:10}}>Current: <strong style={{color:statusColor}}>{kr.current_value}{kr.unit}</strong></span>}
            </div>
            {krAssignees.length>0&&<div style={{marginLeft:34,marginTop:4}}><AssigneeNames ids={krAssignees} allMembers={allMembers} color="var(--green)"/></div>}
          </div>
          <div className="flex items-center gap-2" style={{flexShrink:0}}>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:700,letterSpacing:'-0.03em',color:statusColor}}>{overallProgress}%</div>
              <div style={{fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>progress</div>
            </div>
            {isManagement&&(
              <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>onEdit(kr)}><Edit2 size={12}/></button>
                <button className="btn btn-danger btn-icon btn-sm" onClick={()=>onDelete(kr.id)}><Trash2 size={12}/></button>
              </div>
            )}
            {expanded?<ChevronUp size={14} color="var(--text-muted)"/>:<ChevronDown size={14} color="var(--text-muted)"/>}
          </div>
        </div>
        {/* Progress bar */}
        <div style={{marginTop:8,height:5,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
          <div style={{width:`${overallProgress}%`,height:'100%',background:statusColor,borderRadius:3,transition:'width 0.5s ease'}}/>
        </div>
        {totalInit>0&&(
          <div style={{display:'flex',gap:16,marginTop:4,fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
            <span>Initiatives: {Math.round(initProgress)}%</span>
            <span>Value: {Math.round(valueProgress)}%</span>
          </div>
        )}
      </div>

      {/* Expanded body */}
      {expanded&&(
        <div style={{background:'var(--bg)',borderTop:'1px solid var(--border)'}}>
          {/* Current value update */}
          <div style={{padding:'12px 14px',borderBottom:'1px solid var(--border)',background:'var(--bg-card)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-primary)',flex:1}}>
                Current Value
                <span style={{fontSize:10,color:'var(--text-muted)',fontWeight:400,marginLeft:8}}>Update when the metric changes</span>
              </div>
              {editingValue?(
                <div className="flex gap-2 items-center">
                  <input type="number" value={newValue} onChange={e=>setNewValue(e.target.value)}
                    style={{width:100,padding:'5px 8px',fontSize:12}} autoFocus
                    onKeyDown={e=>e.key==='Enter'&&saveValue()}/>
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>{kr.unit}</span>
                  <button className="btn btn-primary btn-sm" onClick={saveValue} disabled={saving}>
                    {saving?'…':<Check size={12}/>}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditingValue(false)}>✕</button>
                </div>
              ):(
                <div className="flex items-center gap-3">
                  <span style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:700,color:statusColor}}>
                    {kr.current_value!=null?`${kr.current_value}${kr.unit}`:'Not set'}
                  </span>
                  <span style={{fontSize:11,color:'var(--text-muted)'}}>/ {kr.goal_value}{kr.unit} goal</span>
                  <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>{setNewValue(kr.current_value||0);setEditingValue(true)}}>
                    <Edit2 size={11}/> Update
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Initiatives */}
          <div style={{padding:'12px 14px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--amber)',textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>
                Initiatives {totalInit>0&&`· ${doneInit}/${totalInit} done`}
              </div>
              {(isManagement||parseAssignees(kr.assignee_ids).length===0)&&(
                <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();setAddingInit(true)}}>
                  <Plus size={12}/> Add Initiative
                </button>
              )}
            </div>

            {totalInit===0?(
              <div style={{padding:'12px 0',color:'var(--text-muted)',fontSize:12}}>
                No initiatives yet. Initiatives are the actions that drive this Key Result forward.
                <button className="btn btn-ghost btn-sm" style={{marginLeft:10,fontSize:11}} onClick={()=>setAddingInit(true)}>
                  <Plus size={11}/> Add first initiative
                </button>
              </div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {initiatives.map(ms=>{
                  const msAssignees=parseAssignees(ms.assignee_ids)
                  const sInfo=INIT_STATUSES.find(s=>s.key===ms.status)||INIT_STATUSES[0]
                  return (
                    <div key={ms.id} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px'}}>
                        {/* Status dot */}
                        <div style={{width:10,height:10,borderRadius:'50%',background:sInfo.color,flexShrink:0,marginTop:3}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:500,color:ms.status==='completed'?'var(--text-muted)':'var(--text-primary)',textDecoration:ms.status==='completed'?'line-through':'none'}}>
                            {ms.milestone_name}
                          </div>
                          {ms.system_name&&ms.system_name!==ms.milestone_name&&(
                            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{ms.system_name}</div>
                          )}
                          {ms.notes&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:3,fontStyle:'italic'}}>{ms.notes}</div>}
                          {msAssignees.length>0&&<div style={{marginTop:4}}><AssigneeNames ids={msAssignees} allMembers={allMembers} color="var(--amber)"/></div>}
                        </div>
                        {/* Status selector */}
                        <div onClick={e=>e.stopPropagation()} style={{flexShrink:0,display:'flex',gap:4,alignItems:'center'}}>
                          <select value={ms.status}
                            onChange={async e=>{
                              await supabase.from('milestones').update({status:e.target.value}).eq('id',ms.id)
                              onInitiativeChange()
                            }}
                            style={{width:'auto',fontSize:10,padding:'3px 24px 3px 7px',fontFamily:'var(--font-mono)',color:sInfo.color,border:`1px solid ${sInfo.color}30`}}>
                            {INIT_STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                          {isManagement&&<>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setEditingInit(ms)}><Edit2 size={11}/></button>
                            <button className="btn btn-danger btn-icon btn-sm" onClick={async()=>{
                              if(!confirm('Remove this initiative?')) return
                              await supabase.from('milestones').update({is_active:false}).eq('id',ms.id)
                              onInitiativeChange()
                            }}><Trash2 size={11}/></button>
                          </>}
                        </div>
                      </div>
                      {/* Progress bar for initiative */}
                      <div style={{height:2,background:'var(--border)'}}>
                        <div style={{width:`${sInfo.pct}%`,height:'100%',background:sInfo.color,transition:'width 0.3s ease'}}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {addingInit&&<InitiativeModal kr={kr} allMembers={allMembers} onClose={()=>setAddingInit(false)} onSave={()=>{setAddingInit(false);onInitiativeChange()}}/>}
      {editingInit&&<InitiativeModal kr={kr} existing={editingInit} allMembers={allMembers} onClose={()=>setEditingInit(null)} onSave={()=>{setEditingInit(null);onInitiativeChange()}}/>}
    </div>
  )
}

// ── OBJECTIVE CARD ────────────────────────────────────────────
function ObjectiveCard({ objective, keyResults, milestones, allMembers, onAddKR, onEditKR, onDeleteKR, onEditObj, onDeleteObj, onInitiativeChange, isManagement, isCEO }) {
  const [expanded,setExpanded]=useState(true)
  const color = ROLE_COLORS[objective.role_type]||'var(--accent)'
  const objAssignees = parseAssignees(objective.assignee_ids)

  const visibleKRs = keyResults.filter(kr=>{
    if (kr.visibility==='ceo') return isCEO
    if (kr.visibility==='management') return isManagement
    return true
  })

  // Progress: average of KR progress values
  const krProgresses = visibleKRs.map(kr=>{
    const initiatives = milestones.filter(m=>m.key_result_id===kr.id)
    const doneInit = initiatives.filter(m=>m.status==='completed').length
    const totalInit = initiatives.length
    const initProgress = totalInit>0 ? (doneInit/totalInit)*100 : 0
    const valueProgress = kr.goal_value>0
      ? Math.min(100, kr.goal_direction==='min'
          ? (kr.goal_value/Math.max(kr.current_value||0,0.01))*100
          : ((kr.current_value||0)/kr.goal_value)*100)
      : 0
    return totalInit>0 ? (initProgress*0.5 + valueProgress*0.5) : valueProgress
  })

  const avgProgress = krProgresses.length ? Math.round(krProgresses.reduce((s,p)=>s+p,0)/krProgresses.length) : 0
  const allComplete = krProgresses.length>0 && krProgresses.every(p=>p>=100)
  const overallProgress = allComplete ? 100 : Math.min(avgProgress, 99)

  const daysLeft = daysUntilEnd(objective.quarter)
  const qProg = quarterProgress(objective.quarter)
  const statusColor = overallProgress>=100?'var(--green)':overallProgress>=60?'var(--amber)':'var(--red)'

  return (
    <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
      <div style={{padding:'16px 18px',borderLeft:`5px solid ${color}`,cursor:'pointer'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}}>
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color,background:`${color}15`,padding:'2px 8px',borderRadius:100,textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>Objective</span>
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',background:'var(--bg)',padding:'2px 8px',borderRadius:100}}>{objective.quarter}</span>
              {objective.role_type&&<span style={{fontSize:9,color,fontFamily:'var(--font-mono)',background:`${color}12`,padding:'2px 7px',borderRadius:100}}>{ROLE_LABELS[objective.role_type]||objective.role_type}</span>}
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:daysLeft<14?'var(--red)':daysLeft<30?'var(--amber)':'var(--text-muted)',background:'var(--bg)',padding:'2px 8px',borderRadius:100}}>
                {daysLeft>0?`${daysLeft}d left`:daysLeft===0?'Ends today':'Quarter ended'}
              </span>
            </div>
            <h3 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,letterSpacing:'-0.02em',marginBottom:4,color:'var(--text-primary)'}}>{objective.title}</h3>
            {objective.description&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,marginBottom:4}}>{objective.description}</p>}
            {objAssignees.length>0&&<AssigneeNames ids={objAssignees} allMembers={allMembers} color={color}/>}
          </div>
          <div className="flex items-center gap-3" style={{flexShrink:0}}>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:800,letterSpacing:'-0.04em',color:statusColor}}>{overallProgress}%</div>
              <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{overallProgress>=100?'✓ Complete':'of objective'}</div>
            </div>
            {isManagement&&(
              <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>onEditObj(objective)}><Edit2 size={13}/></button>
                <button className="btn btn-danger btn-icon btn-sm" onClick={()=>onDeleteObj(objective.id)}><Trash2 size={13}/></button>
              </div>
            )}
            {expanded?<ChevronUp size={16} color="var(--text-muted)"/>:<ChevronDown size={16} color="var(--text-muted)"/>}
          </div>
        </div>
        <div style={{marginTop:12}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:3}}>
            <span>OKR progress — driven by initiatives + metric values</span><span>{overallProgress}%</span>
          </div>
          <div style={{height:6,background:'var(--border)',borderRadius:3,overflow:'hidden',marginBottom:4}}>
            <div style={{width:`${overallProgress}%`,height:'100%',background:overallProgress>=100?'var(--green)':color,borderRadius:3,transition:'width 0.5s ease'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:3}}>
            <span>Quarter elapsed</span><span>{qProg}%</span>
          </div>
          <div style={{height:3,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
            <div style={{width:`${qProg}%`,height:'100%',background:'var(--text-muted)',borderRadius:2}}/>
          </div>
          {overallProgress<qProg-15&&krProgresses.length>0&&(
            <p style={{fontSize:10,color:'var(--red)',marginTop:4,fontFamily:'var(--font-mono)'}}>⚠ Behind quarter pace — {qProg-overallProgress}% gap</p>
          )}
        </div>
      </div>

      {expanded&&(
        <div style={{padding:'16px 18px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
          <div className="flex items-center justify-between mb-3">
            <h4 style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>Key Results</h4>
            {isManagement&&<button className="btn btn-ghost btn-sm" onClick={()=>onAddKR(objective.id)}><Plus size={13}/> Add KR</button>}
          </div>
          {visibleKRs.length===0?(
            <div className="empty-state" style={{padding:'20px 0'}}>
              <p>No key results yet.</p>
              {isManagement&&<button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={()=>onAddKR(objective.id)}>Add First KR</button>}
            </div>
          ):visibleKRs.map(kr=>(
            <KRRow key={kr.id} kr={kr}
              milestones={milestones}
              allMembers={allMembers}
              onEdit={onEditKR} onDelete={onDeleteKR}
              onInitiativeChange={onInitiativeChange}
              isManagement={isManagement} isCEO={isCEO}/>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function OKRs() {
  const { profile, isCEO, isManagement } = useAuth()
  const [objectives,setObjectives]=useState([])
  const [keyResults,setKeyResults]=useState([])
  const [allMembers,setAllMembers]=useState([])
  const [milestones,setMilestones]=useState([])
  const [loading,setLoading]=useState(true)
  const [roleFilter,setRoleFilter]=useState('all')
  const [quarterFilter,setQuarterFilter]=useState(currentQuarter())
  const [showAddObj,setShowAddObj]=useState(false)
  const [editObj,setEditObj]=useState(null)
  const [addKRFor,setAddKRFor]=useState(null)
  const [editKR,setEditKR]=useState(null)
  const [showGuide,setShowGuide]=useState(false)

  useEffect(()=>{load()},[profile,roleFilter,quarterFilter])

  async function load() {
    if (!profile) return; setLoading(true)
    const {data:allMemberData}=await supabase.from('profiles').select('id,full_name,position,avatar_url,role').order('full_name')
    setAllMembers(allMemberData||[])

    let objQ=supabase.from('objectives').select('*').eq('is_active',true).order('role_type')
    if (roleFilter!=='all') objQ=objQ.eq('role_type',roleFilter)
    if (quarterFilter!=='all') objQ=objQ.eq('quarter',quarterFilter)
    const {data:objData}=await objQ

    let filteredObjs=objData||[]
    if (!isManagement) {
      filteredObjs=filteredObjs.filter(o=>{
        const ids=parseAssignees(o.assignee_ids)
        return ids.length===0?(o.role_type===profile.position):ids.includes(profile.id)
      })
    }
    setObjectives(filteredObjs)

    if (!filteredObjs.length) { setLoading(false); return }

    const {data:krData}=await supabase.from('key_results').select('*')
      .in('objective_id',filteredObjs.map(o=>o.id)).eq('is_active',true)

    let filteredKRs=krData||[]
    if (!isManagement) {
      filteredKRs=filteredKRs.filter(kr=>{
        const ids=parseAssignees(kr.assignee_ids)
        return ids.length===0?true:ids.includes(profile.id)
      })
    }
    setKeyResults(filteredKRs)

    if (filteredKRs.length) {
      const {data:msData}=await supabase.from('milestones').select('*')
        .in('key_result_id',filteredKRs.map(k=>k.id)).eq('is_active',true).order('created_at')
      setMilestones(msData||[])
    }

    setLoading(false)
  }

  async function deleteObjective(id) {
    if (!confirm('Delete this objective and all its key results?')) return
    await supabase.from('objectives').update({is_active:false}).eq('id',id); load()
  }
  async function deleteKR(id) {
    if (!confirm('Delete this key result?')) return
    await supabase.from('key_results').update({is_active:false}).eq('id',id); load()
  }

  const availableRoles=[...new Set(objectives.map(o=>o.role_type).filter(Boolean))]
  const byRole=objectives.reduce((acc,o)=>{
    const key=o.role_type||'other'; if(!acc[key])acc[key]=[]; acc[key].push(o); return acc
  },{})
  const daysLeft=daysUntilEnd(currentQuarter())
  const qp=quarterProgress(currentQuarter())

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">OKRs</h1>
            <p className="page-subtitle">{quarterFilter==='all'?'All quarters':quarterFilter}{quarterFilter===currentQuarter()&&` · ${daysLeft>0?`${daysLeft} days left`:'Quarter ended'}`}</p>
          </div>
          <div className="flex gap-2" style={{flexWrap:'wrap'}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowGuide(true)}><BookOpen size={14}/> How OKRs Work</button>
            {isManagement&&<button className="btn btn-primary btn-sm" onClick={()=>setShowAddObj(true)}><Plus size={14}/> Add Objective</button>}
          </div>
        </div>
      </div>

      <div className="page-body">
        {quarterFilter===currentQuarter()&&(
          <div className="card mb-4" style={{padding:'12px 16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:6}}>
              <span>{currentQuarter()} — Quarter Timeline</span>
              <span style={{color:daysLeft<14?'var(--red)':daysLeft<30?'var(--amber)':'var(--text-secondary)'}}>{daysLeft>0?`${daysLeft} days remaining`:'Quarter ended'}</span>
            </div>
            <div style={{height:8,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
              <div style={{width:`${qp}%`,height:'100%',background:'linear-gradient(90deg,var(--accent),var(--green))',borderRadius:4,transition:'width 0.5s ease'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginTop:4}}>
              <span>Start of quarter</span><span>{qp}% elapsed</span><span>End of quarter</span>
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:20,alignItems:'center'}}>
          <div className="tabs" style={{border:'none',marginBottom:0,flexWrap:'wrap'}}>
            <button className={`tab ${roleFilter==='all'?'active':''}`} onClick={()=>setRoleFilter('all')}>All Roles</button>
            {availableRoles.map(r=>(
              <button key={r} className={`tab ${roleFilter===r?'active':''}`} onClick={()=>setRoleFilter(r)} style={{color:roleFilter===r?ROLE_COLORS[r]:undefined}}>{ROLE_LABELS[r]||r}</button>
            ))}
          </div>
          <select value={quarterFilter} onChange={e=>setQuarterFilter(e.target.value)} style={{width:'auto',fontSize:12,marginLeft:'auto'}}>
            {[...new Set(['all',currentQuarter(),...objectives.map(o=>o.quarter)])].map(q=><option key={q} value={q}>{q==='all'?'All Quarters':q}</option>)}
          </select>
        </div>

        {loading?(
          <div className="loading-screen" style={{minHeight:200,background:'transparent'}}><div className="spinner"/></div>
        ):objectives.length===0?(
          <div className="empty-state">
            <p>{isManagement?'No objectives yet.':'No objectives assigned to you yet.'}</p>
            {isManagement&&<button className="btn btn-primary btn-sm" style={{marginTop:12}} onClick={()=>setShowAddObj(true)}>Add First Objective</button>}
          </div>
        ):(
          Object.entries(byRole).map(([role,objs])=>(
            <div key={role} style={{marginBottom:32}}>
              <div className="flex items-center gap-3 mb-3">
                <div style={{width:10,height:10,borderRadius:'50%',background:ROLE_COLORS[role]||'var(--accent)',flexShrink:0}}/>
                <h2 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,letterSpacing:'-0.02em',color:'var(--text-primary)'}}>{ROLE_LABELS[role]||role}</h2>
                <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>{objs.length} objective{objs.length!==1?'s':''}</span>
              </div>
              {objs.map(obj=>{
                const objKRs=keyResults.filter(kr=>kr.objective_id===obj.id)
                return (
                  <ObjectiveCard key={obj.id} objective={obj}
                    keyResults={objKRs} milestones={milestones}
                    allMembers={allMembers}
                    onAddKR={id=>setAddKRFor(id)}
                    onEditKR={kr=>setEditKR(kr)}
                    onDeleteKR={deleteKR}
                    onEditObj={o=>setEditObj(o)}
                    onDeleteObj={deleteObjective}
                    onInitiativeChange={load}
                    isManagement={isManagement} isCEO={isCEO}/>
                )
              })}
            </div>
          ))
        )}
      </div>

      {showGuide&&(
        <div className="modal-overlay" onClick={()=>setShowGuide(false)}>
          <div className="modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="modal-title" style={{marginBottom:0}}>How OKRs Work</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setShowGuide(false)}>✕</button>
            </div>
            {[
              {tag:'O',color:'var(--accent)',title:'Objective — What you want to achieve',desc:'Qualitative, ambitious, quarterly direction. Not a number.',tip:'If you can measure it directly, it\'s a KR, not an Objective.'},
              {tag:'KR',color:'var(--green)',title:'Key Result — How you know you got there',desc:'A specific measurable outcome. You set the goal value and update the current value manually when the metric changes.',tip:'An objective reaches 100% only when all KRs are complete.'},
              {tag:'I',color:'var(--amber)',title:'Initiative — What actions drive progress',desc:'Specific tasks and projects under each KR. Mark them Not Started → Started → 50% → 75% → Done. Initiative completion drives 50% of KR progress.',tip:'More initiatives completed = faster KR progress.'},
            ].map(item=>(
              <div key={item.tag} style={{marginBottom:14,padding:'12px 16px',background:'var(--bg)',borderRadius:'var(--radius-lg)',borderLeft:`4px solid ${item.color}`}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:item.color,background:`${item.color}15`,padding:'2px 8px',borderRadius:100,fontWeight:600}}>{item.tag}</span>
                  <strong style={{fontSize:13,color:'var(--text-primary)'}}>{item.title}</strong>
                </div>
                <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:4}}>{item.desc}</p>
                <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>💡 {item.tip}</p>
              </div>
            ))}
            <div style={{padding:'12px 14px',background:'var(--accent-dim)',border:'1px solid var(--accent)',borderRadius:'var(--radius-lg)'}}>
              <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>
                <strong style={{color:'var(--accent)'}}>Progress formula:</strong> KR progress = 50% from initiative completion + 50% from current metric value vs goal. Objective = average of all KR progress. No weekly logging required.
              </p>
            </div>
          </div>
        </div>
      )}

      {showAddObj&&<ObjectiveModal allMembers={allMembers} onClose={()=>setShowAddObj(false)} onSave={load}/>}
      {editObj&&<ObjectiveModal existing={editObj} allMembers={allMembers} onClose={()=>setEditObj(null)} onSave={load}/>}
      {addKRFor&&<KRModal objectiveId={addKRFor} allMembers={allMembers} onClose={()=>setAddKRFor(null)} onSave={load}/>}
      {editKR&&<KRModal existing={editKR} objectiveId={editKR.objective_id} allMembers={allMembers} onClose={()=>setEditKR(null)} onSave={load}/>}
    </>
  )
}
