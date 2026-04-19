import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, BookOpen, Target, CheckCircle2, Circle, AlertCircle } from 'lucide-react'

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

const INIT_STATUSES = [
  { key:'not_started',    label:'Not Started', color:'var(--text-muted)', bg:'transparent',      pct:0   },
  { key:'started',        label:'Started',     color:'var(--accent)',     bg:'var(--accent-dim)', pct:25  },
  { key:'half',           label:'50%',         color:'var(--amber)',      bg:'var(--amber-dim)',  pct:50  },
  { key:'three_quarters', label:'75%',         color:'var(--amber)',      bg:'var(--amber-dim)',  pct:75  },
  { key:'completed',      label:'Done ✓',      color:'var(--green)',      bg:'var(--green-dim)',  pct:100 },
]

function currentQuarter() {
  const m=new Date().getMonth()+1,y=new Date().getFullYear()
  return `Q${m<=3?1:m<=6?2:m<=9?3:4}-${y}`
}
function quarterEndDate(q) {
  const [qp,yr]=q.split('-'); return new Date(parseInt(yr),parseInt(qp.replace('Q',''))*3,0)
}
function daysUntilEnd(q) { return Math.ceil((quarterEndDate(q)-new Date())/(864e5)) }
function quarterProgress(q) {
  const [qp,yr]=q.split('-'),n=parseInt(qp.replace('Q',''))
  const s=new Date(parseInt(yr),(n-1)*3,1),e=quarterEndDate(q)
  return Math.min(100,Math.max(0,Math.round(((new Date()-s)/(e-s))*100)))
}
function parseAssignees(val) {
  if (!val) return []; if (Array.isArray(val)) return val
  try { return JSON.parse(val) } catch { return [] }
}
function krProgress(kr, milestones) {
  const inits = milestones.filter(m=>m.key_result_id===kr.id)
  if (!inits.length) return 0
  return Math.round((inits.filter(m=>m.status==='completed').length/inits.length)*100)
}
function progressColor(pct) {
  if (pct>=100) return 'var(--green)'
  if (pct>=60)  return 'var(--amber)'
  return 'var(--red)'
}

// ── ASSIGNEE AVATARS (compact) ────────────────────────────────
function Avatars({ ids, allMembers, size=22 }) {
  if (!ids?.length) return null
  const members = ids.map(id=>allMembers.find(m=>m.id===id)).filter(Boolean)
  return (
    <div style={{display:'flex',gap:-4}}>
      {members.slice(0,4).map((m,i)=>(
        <div key={m.id} title={m.full_name}
          style={{width:size,height:size,borderRadius:'50%',border:'2px solid var(--bg-card)',
            background:'var(--accent-dim)',color:'var(--accent)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:size*0.38,fontWeight:700,marginLeft:i>0?-6:0,zIndex:10-i,flexShrink:0}}>
          {m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
        </div>
      ))}
      {members.length>4&&<div style={{width:size,height:size,borderRadius:'50%',border:'2px solid var(--bg-card)',background:'var(--bg)',color:'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.32,marginLeft:-6}}>+{members.length-4}</div>}
    </div>
  )
}

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
                cursor:'pointer',fontSize:12,fontWeight:sel?600:400,color:sel?color:'var(--text-secondary)'}}>
              <div style={{width:20,height:20,borderRadius:'50%',background:sel?`${color}20`:'var(--bg)',border:`1px solid ${sel?color:'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:sel?color:'var(--text-muted)'}}>
                {m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
              </div>
              {m.full_name?.split(' ')[0]}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── OBJECTIVE MODAL ──────────────────────────────────────────
function ObjectiveModal({ existing, allMembers, onClose, onSave }) {
  const [form,setForm]=useState({
    title:existing?.title||'', description:existing?.description||'',
    department:existing?.department||'delivery', role_type:existing?.role_type||'creative_strategist',
    quarter:existing?.quarter||currentQuarter(), assignee_ids:parseAssignees(existing?.assignee_ids),
  })
  const [saving,setSaving]=useState(false)
  async function handleSave() {
    if (!form.title) return; setSaving(true)
    const p={title:form.title,description:form.description,department:form.department,role_type:form.role_type,quarter:form.quarter,assignee_ids:form.assignee_ids}
    if (existing) await supabase.from('objectives').update(p).eq('id',existing.id)
    else await supabase.from('objectives').insert({...p,status:'active'})
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit':'New'} Objective</h2>
        <div className="form-group"><label>Title *</label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Deliver exceptional creative output" autoFocus/>
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
          <input value={form.quarter} onChange={e=>setForm({...form,quarter:e.target.value})}/>
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
    current_value:existing?.current_value||'', assignee_ids:parseAssignees(existing?.assignee_ids),
  })
  const [saving,setSaving]=useState(false)
  async function handleSave() {
    if (!form.metric_name||!form.goal_value) return; setSaving(true)
    const p={title:form.title,metric_name:form.metric_name,goal_value:parseFloat(form.goal_value),goal_direction:form.goal_direction,unit:form.unit,visibility:form.visibility,current_value:parseFloat(form.current_value)||0,assignee_ids:form.assignee_ids}
    if (existing) await supabase.from('key_results').update(p).eq('id',existing.id)
    else await supabase.from('key_results').insert({...p,objective_id:objectiveId})
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit':'Add'} Key Result</h2>
        <div className="form-group"><label>What does this KR prove?</label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Clients approve faster with less rework"/>
        </div>
        <div className="form-group"><label>Metric Name *</label>
          <input value={form.metric_name} onChange={e=>setForm({...form,metric_name:e.target.value})} placeholder="e.g. First Pass Approval Rate" autoFocus/>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Goal *</label>
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
    milestone_name:existing?.milestone_name||'', system_name:existing?.system_name||'',
    status:existing?.status||'not_started', notes:existing?.notes||'',
    department:existing?.department||'delivery', role_type:existing?.role_type||'creative_strategist',
    assignee_ids:parseAssignees(existing?.assignee_ids),
  })
  const [saving,setSaving]=useState(false)
  async function handleSave() {
    if (!form.milestone_name) return; setSaving(true)
    const p={system_name:form.system_name||form.milestone_name,milestone_name:form.milestone_name,department:form.department,role_type:form.role_type,status:form.status,notes:form.notes,assignee_ids:form.assignee_ids}
    if (existing) await supabase.from('milestones').update(p).eq('id',existing.id)
    else await supabase.from('milestones').insert({...p,key_result_id:kr.id,is_active:true})
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:500}} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title" style={{marginBottom:4}}>{existing?'Edit Initiative':'Add Initiative'}</h2>
        <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:18}}>Key Result: <strong>{kr.metric_name}</strong></p>
        <div className="form-group"><label>What needs to happen? *</label>
          <input value={form.milestone_name} onChange={e=>setForm({...form,milestone_name:e.target.value})} placeholder="e.g. Build standardized brief template" autoFocus/>
        </div>
        <div className="form-group"><label>Status</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
            {INIT_STATUSES.map(s=>(
              <button key={s.key} onClick={()=>setForm({...form,status:s.key})}
                style={{padding:'5px 12px',borderRadius:'var(--radius)',border:`1.5px solid ${form.status===s.key?s.color:'var(--border)'}`,
                  background:form.status===s.key?s.bg:'transparent',color:form.status===s.key?s.color:'var(--text-secondary)',
                  cursor:'pointer',fontSize:12,fontWeight:form.status===s.key?600:400,transition:'all 0.12s'}}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group"><label>Project / Context</label>
          <input value={form.system_name} onChange={e=>setForm({...form,system_name:e.target.value})} placeholder="e.g. Brief Optimization Project"/>
        </div>
        <div className="form-group"><label>Notes</label>
          <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2} style={{resize:'vertical'}} placeholder="Blockers, context, next steps..."/>
        </div>
        <AssigneePicker allMembers={allMembers} selected={form.assignee_ids} onChange={ids=>setForm({...form,assignee_ids:ids})} accentColor="var(--amber)"/>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!form.milestone_name}>{saving?'Saving...':existing?'Save':'Add'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── INITIATIVE ROW ────────────────────────────────────────────
function InitiativeRow({ ms, kr, allMembers, isManagement, onEdit, onDelete, onStatusChange }) {
  const sInfo = INIT_STATUSES.find(s=>s.key===ms.status)||INIT_STATUSES[0]
  const assignees = parseAssignees(ms.assignee_ids)
  const isDone = ms.status==='completed'

  return (
    <div style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
      {/* Initiative name — full block width, no flex competition */}
      <div style={{
        fontSize:13,fontWeight:isDone?400:500,
        color:isDone?'var(--text-muted)':'var(--text-primary)',
        textDecoration:isDone?'line-through':'none',
        lineHeight:1.5,marginBottom:6,
      }}>
        {ms.milestone_name}
      </div>
      {ms.notes&&(
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>
          {ms.notes}
        </div>
      )}
      {/* Meta row: status + assignees + actions — all inline, never overflow */}
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'nowrap'}}>
        <div style={{width:7,height:7,borderRadius:'50%',background:sInfo.color,flexShrink:0}}/>
        <select value={ms.status} onClick={e=>e.stopPropagation()}
          onChange={e=>onStatusChange(ms.id, e.target.value)}
          style={{fontSize:10,padding:'2px 8px',borderRadius:100,
            fontFamily:'var(--font-mono)',fontWeight:700,maxWidth:110,
            color:sInfo.color,background:sInfo.bg||'var(--bg-card)',
            border:`1px solid ${sInfo.color}30`,cursor:'pointer',flexShrink:0}}>
          {INIT_STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {assignees.length>0&&<Avatars ids={assignees} allMembers={allMembers} size={18}/>}
        {isManagement&&(
          <div className="flex gap-1" style={{marginLeft:'auto',flexShrink:0}}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={e=>{e.stopPropagation();onEdit(ms)}}><Edit2 size={11}/></button>
            <button className="btn btn-danger btn-icon btn-sm" onClick={e=>{e.stopPropagation();onDelete(ms.id)}}><Trash2 size={11}/></button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── KR BLOCK ─────────────────────────────────────────────────
function KRBlock({ kr, milestones, allMembers, onEdit, onDelete, onInitiativeChange, isManagement, isCEO }) {
  const [expanded, setExpanded] = useState(false)
  const [addingInit, setAddingInit] = useState(false)
  const [editingInit, setEditingInit] = useState(null)

  const initiatives = milestones.filter(m=>m.key_result_id===kr.id)
  const done = initiatives.filter(m=>m.status==='completed').length
  const total = initiatives.length
  const pct = krProgress(kr, milestones)
  const color = progressColor(pct)
  const krAssignees = parseAssignees(kr.assignee_ids)

  async function handleStatusChange(id, newStatus) {
    await supabase.from('milestones').update({status:newStatus}).eq('id',id)
    onInitiativeChange()
  }
  async function handleDeleteInit(id) {
    if (!confirm('Remove this initiative?')) return
    await supabase.from('milestones').update({is_active:false}).eq('id',id)
    onInitiativeChange()
  }

  return (
    <div style={{marginBottom:2}}>
      {/* KR Row — always visible */}
      <div onClick={()=>setExpanded(!expanded)}
        style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',cursor:'pointer',borderRadius:'var(--radius)',
          background:expanded?'var(--bg)':'transparent',transition:'background 0.12s'}}
        onMouseEnter={e=>!expanded&&(e.currentTarget.style.background='var(--bg-hover)')}
        onMouseLeave={e=>!expanded&&(e.currentTarget.style.background='transparent')}>

        {/* Expand chevron */}
        <div style={{color:'var(--text-muted)',flexShrink:0,transition:'transform 0.15s',transform:expanded?'rotate(90deg)':'rotate(0deg)'}}>
          <ChevronRight size={14}/>
        </div>

        {/* KR ring progress */}
        <div style={{position:'relative',width:36,height:36,flexShrink:0}}>
          <svg width="36" height="36" style={{transform:'rotate(-90deg)'}}>
            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border)" strokeWidth="3"/>
            <circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3"
              strokeDasharray={`${2*Math.PI*14}`}
              strokeDashoffset={`${2*Math.PI*14*(1-pct/100)}`}
              strokeLinecap="round" style={{transition:'stroke-dashoffset 0.5s ease'}}/>
          </svg>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:9,fontWeight:700,color,fontFamily:'var(--font-mono)'}}>{pct}%</div>
        </div>

        {/* Name + goal */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:2}}>{kr.metric_name}</div>
          <div style={{fontSize:11,color:'var(--text-muted)'}}>
            Goal: {kr.goal_direction==='min'?'≤':'≥'}{kr.goal_value}{kr.unit}
            {kr.current_value!=null&&kr.current_value!==''&&kr.current_value!==0&&(
              <span style={{marginLeft:8,color,fontWeight:600}}>Current: {kr.current_value}{kr.unit}</span>
            )}
          </div>
        </div>

        {/* Initiative count pill */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          {total>0&&(
            <span style={{fontSize:11,color:done===total?'var(--green)':'var(--text-muted)',fontFamily:'var(--font-mono)',
              background:'var(--bg-card)',padding:'2px 8px',borderRadius:100,border:'1px solid var(--border)',fontWeight:done===total?600:400}}>
              {done}/{total}
            </span>
          )}
          {krAssignees.length>0&&<Avatars ids={krAssignees} allMembers={allMembers} size={22}/>}
          {isManagement&&(
            <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>onEdit(kr)}><Edit2 size={11}/></button>
              <button className="btn btn-danger btn-icon btn-sm" onClick={()=>onDelete(kr.id)}><Trash2 size={11}/></button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: initiatives */}
      {expanded&&(
        <div style={{borderTop:'1px solid var(--border)'}}>
          {/* Metric bar */}
          {kr.current_value!=null&&kr.current_value!==''&&(
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 16px',borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
              <div style={{flex:1,height:5,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                <div style={{width:`${Math.min(100,(kr.current_value/kr.goal_value)*100)}%`,height:'100%',background:color,borderRadius:3,transition:'width 0.4s'}}/>
              </div>
              <span style={{fontSize:11,color,fontWeight:600,fontFamily:'var(--font-mono)',flexShrink:0}}>
                {kr.current_value}{kr.unit} / {kr.goal_value}{kr.unit}
              </span>
              {isManagement&&<span style={{fontSize:10,color:'var(--text-muted)'}}>Edit KR to update</span>}
            </div>
          )}

          {/* Initiatives — full width */}
          <div style={{padding:'4px 16px 8px'}}>
            {initiatives.length===0?(
              <div style={{padding:'10px 0',fontSize:12,color:'var(--text-muted)'}}>
                No initiatives yet —
                <button className="btn btn-ghost btn-sm" style={{marginLeft:6,fontSize:11}} onClick={()=>setAddingInit(true)}>
                  <Plus size={11}/> Add one
                </button>
              </div>
            ):(
              <>
                {initiatives.map(ms=>(
                  <InitiativeRow key={ms.id} ms={ms} kr={kr} allMembers={allMembers}
                    isManagement={isManagement}
                    onStatusChange={handleStatusChange}
                    onEdit={setEditingInit}
                    onDelete={handleDeleteInit}/>
                ))}
              </>
            )}
            <button className="btn btn-ghost btn-sm" style={{marginTop:8,fontSize:11,color:'var(--text-muted)'}}
              onClick={()=>setAddingInit(true)}>
              <Plus size={11}/> Add initiative
            </button>
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
  const [expanded, setExpanded] = useState(true)
  const color = ROLE_COLORS[objective.role_type]||'var(--accent)'
  const objAssignees = parseAssignees(objective.assignee_ids)
  const daysLeft = daysUntilEnd(objective.quarter)
  const qProg = quarterProgress(objective.quarter)

  const visibleKRs = keyResults.filter(kr=>{
    if (kr.visibility==='ceo') return isCEO
    if (kr.visibility==='management') return isManagement
    return true
  })

  const krPcts = visibleKRs.map(kr=>krProgress(kr, milestones))
  const objPct = krPcts.length ? Math.round(krPcts.reduce((s,p)=>s+p,0)/krPcts.length) : 0
  const allDone = krPcts.length>0 && krPcts.every(p=>p>=100)
  const finalPct = allDone ? 100 : Math.min(objPct, 99)
  const objColor = finalPct>=100?'var(--green)':finalPct>=60?'var(--amber)':'var(--red)'

  // All initiatives across all KRs
  const allInits = visibleKRs.flatMap(kr=>milestones.filter(m=>m.key_result_id===kr.id))
  const totalInits = allInits.length
  const doneInits = allInits.filter(m=>m.status==='completed').length

  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-xl)',overflow:'hidden',marginBottom:20,boxShadow:'var(--shadow-sm)'}}>

      {/* Objective Header */}
      <div style={{padding:'20px 24px',borderLeft:`5px solid ${color}`,cursor:'pointer'}}
        onClick={()=>setExpanded(!expanded)}>
        <div style={{display:'flex',alignItems:'flex-start',gap:16}}>

          {/* Big progress ring */}
          <div style={{position:'relative',width:56,height:56,flexShrink:0}}>
            <svg width="56" height="56" style={{transform:'rotate(-90deg)'}}>
              <circle cx="28" cy="28" r="22" fill="none" stroke="var(--border)" strokeWidth="4"/>
              <circle cx="28" cy="28" r="22" fill="none" stroke={objColor} strokeWidth="4"
                strokeDasharray={`${2*Math.PI*22}`}
                strokeDashoffset={`${2*Math.PI*22*(1-finalPct/100)}`}
                strokeLinecap="round" style={{transition:'stroke-dashoffset 0.6s ease'}}/>
            </svg>
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:0}}>
              <span style={{fontSize:13,fontWeight:800,color:objColor,lineHeight:1}}>{finalPct}%</span>
            </div>
          </div>

          {/* Title + meta */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}}>
              <span style={{fontSize:10,fontFamily:'var(--font-mono)',fontWeight:700,color,textTransform:'uppercase',letterSpacing:1}}>{objective.quarter}</span>
              {objective.role_type&&<span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{ROLE_LABELS[objective.role_type]}</span>}
              <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:daysLeft<14?'var(--red)':daysLeft<30?'var(--amber)':'var(--text-muted)'}}>
                {daysLeft>0?`${daysLeft}d left`:'Ended'}
              </span>
            </div>
            <h3 style={{fontSize:17,fontWeight:700,letterSpacing:'-0.02em',color:'var(--text-primary)',marginBottom:4,lineHeight:1.3}}>{objective.title}</h3>
            {objective.description&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,marginBottom:6}}>{objective.description}</p>}

            {/* Stats row */}
            <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'var(--text-muted)'}}>
                <strong style={{color:'var(--text-primary)'}}>{visibleKRs.length}</strong> key results
              </span>
              {totalInits>0&&(
                <span style={{fontSize:11,color:'var(--text-muted)'}}>
                  <strong style={{color:doneInits===totalInits?'var(--green)':'var(--text-primary)'}}>{doneInits}/{totalInits}</strong> initiatives done
                </span>
              )}
              {objAssignees.length>0&&<Avatars ids={objAssignees} allMembers={allMembers} size={22}/>}
            </div>
          </div>

          {/* Right: actions + chevron */}
          <div className="flex items-center gap-2" style={{flexShrink:0}}>
            {isManagement&&(
              <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>onEditObj(objective)}><Edit2 size={13}/></button>
                <button className="btn btn-danger btn-icon btn-sm" onClick={()=>onDeleteObj(objective.id)}><Trash2 size={13}/></button>
              </div>
            )}
            <div style={{color:'var(--text-muted)',transition:'transform 0.2s',transform:expanded?'rotate(180deg)':'rotate(0deg)'}}>
              <ChevronDown size={16}/>
            </div>
          </div>
        </div>

        {/* Quarter progress track */}
        <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10}}>
          <div style={{flex:1,height:3,background:'var(--border)',borderRadius:2,overflow:'hidden',position:'relative'}}>
            {/* OKR progress */}
            <div style={{position:'absolute',top:0,left:0,height:'100%',width:`${finalPct}%`,background:objColor,borderRadius:2,transition:'width 0.5s ease',opacity:0.9}}/>
          </div>
          <div style={{height:3,width:80,background:'var(--border)',borderRadius:2,overflow:'hidden',flexShrink:0}}>
            <div style={{height:'100%',width:`${qProg}%`,background:'var(--text-muted)',borderRadius:2,opacity:0.5}}/>
          </div>
          <span style={{fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)',flexShrink:0,width:60,textAlign:'right'}}>Q: {qProg}% done</span>
        </div>
        {finalPct<qProg-15&&krPcts.length>0&&(
          <p style={{fontSize:10,color:'var(--red)',marginTop:5,fontFamily:'var(--font-mono)'}}>⚠ Behind quarter pace</p>
        )}
      </div>

      {/* Key Results */}
      {expanded&&(
        <div style={{borderTop:'1px solid var(--border)',padding:'12px 20px 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--font-mono)'}}>Key Results</span>
            {isManagement&&<button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>onAddKR(objective.id)}><Plus size={12}/> Add KR</button>}
          </div>

          {visibleKRs.length===0?(
            <div style={{padding:'16px 0',textAlign:'center'}}>
              <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:10}}>No key results yet. Add the measurable outcomes that prove this objective is achieved.</p>
              {isManagement&&<button className="btn btn-primary btn-sm" onClick={()=>onAddKR(objective.id)}>Add First Key Result</button>}
            </div>
          ):(
            visibleKRs.map(kr=>(
              <KRBlock key={kr.id} kr={kr} milestones={milestones} allMembers={allMembers}
                onEdit={onEditKR} onDelete={onDeleteKR}
                onInitiativeChange={onInitiativeChange}
                isManagement={isManagement} isCEO={isCEO}/>
            ))
          )}
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
  // viewMode: 'team' = my team + company context | 'company' = company-level only | 'all' = all teams
  const [viewMode,setViewMode]=useState(()=>{
    const saved = typeof window!=='undefined' ? window.localStorage?.getItem('okr-view-mode') : null
    return saved || 'team'
  })
  useEffect(()=>{ try{ window.localStorage?.setItem('okr-view-mode', viewMode) }catch{} },[viewMode])

  useEffect(()=>{ load() },[profile,roleFilter,quarterFilter])

  async function load() {
    if (!profile) return; setLoading(true)
    const {data:memberData}=await supabase.from('profiles').select('id,full_name,position,avatar_url,role').order('full_name')
    setAllMembers(memberData||[])

    let objQ=supabase.from('objectives').select('*').eq('is_active',true).order('created_at')
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
    if (!confirm('Delete this objective?')) return
    await supabase.from('objectives').update({is_active:false}).eq('id',id); load()
  }
  async function deleteKR(id) {
    if (!confirm('Delete this key result?')) return
    await supabase.from('key_results').update({is_active:false}).eq('id',id); load()
  }

  const availableRoles=[...new Set(objectives.map(o=>o.role_type).filter(Boolean))]
  const daysLeft=daysUntilEnd(currentQuarter())
  const qp=quarterProgress(currentQuarter())

  // Summary stats
  const totalKRs = keyResults.length
  const onTrackKRs = keyResults.filter(kr=>krProgress(kr,milestones)>=60).length
  const totalInits = milestones.length
  const doneInits = milestones.filter(m=>m.status==='completed').length

  // Shared render helper for objective cards
  const renderObjCard = (obj) => (
    <ObjectiveCard key={obj.id} objective={obj}
      keyResults={keyResults.filter(kr=>kr.objective_id===obj.id)}
      milestones={milestones}
      allMembers={allMembers}
      onAddKR={id=>setAddKRFor(id)}
      onEditKR={kr=>setEditKR(kr)}
      onDeleteKR={deleteKR}
      onEditObj={o=>setEditObj(o)}
      onDeleteObj={deleteObjective}
      onInitiativeChange={load}
      isManagement={isManagement} isCEO={isCEO}/>
  )

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">OKRs</h1>
            <p className="page-subtitle">
              {quarterFilter==='all'?'All quarters':quarterFilter}
              {quarterFilter===currentQuarter()&&` · ${daysLeft>0?`${daysLeft} days left`:'Quarter ended'}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowGuide(true)}><BookOpen size={14}/> How it works</button>
            {isManagement&&<button className="btn btn-primary btn-sm" onClick={()=>setShowAddObj(true)}><Plus size={14}/> Add Objective</button>}
          </div>
        </div>
      </div>

      <div className="page-body">

        {/* Quarter bar + summary stats */}
        {quarterFilter===currentQuarter()&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:20}}>
            <div className="card" style={{padding:'14px 16px',gridColumn:'1/3'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:6}}>
                <span>{currentQuarter()} — {daysLeft>0?`${daysLeft} days remaining`:'Ended'}</span>
                <span>{qp}% elapsed</span>
              </div>
              <div style={{height:8,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
                <div style={{width:`${qp}%`,height:'100%',background:'linear-gradient(90deg,var(--accent),var(--green))',borderRadius:4,transition:'width 0.5s'}}/>
              </div>
            </div>
            <div className="card" style={{padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:22,fontWeight:800,color:onTrackKRs===totalKRs&&totalKRs>0?'var(--green)':'var(--text-primary)'}}>{onTrackKRs}<span style={{fontSize:14,color:'var(--text-muted)',fontWeight:400}}>/{totalKRs}</span></div>
              <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,marginTop:2}}>KRs on track</div>
            </div>
            <div className="card" style={{padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:22,fontWeight:800,color:doneInits===totalInits&&totalInits>0?'var(--green)':'var(--text-primary)'}}>{doneInits}<span style={{fontSize:14,color:'var(--text-muted)',fontWeight:400}}>/{totalInits}</span></div>
              <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,marginTop:2}}>Initiatives done</div>
            </div>
          </div>
        )}

        {/* View selector + quarter */}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:20,alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <label style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>View</label>
            <select value={viewMode} onChange={e=>setViewMode(e.target.value)}
              style={{width:'auto',fontSize:13,fontWeight:600,padding:'7px 30px 7px 12px',
                border:'1.5px solid var(--border)',borderRadius:'var(--radius)',
                background:'var(--bg-card)',color:'var(--text-primary)',cursor:'pointer',minWidth:180}}>
              <option value="team">My Team</option>
              <option value="company">Company Only</option>
              <option value="all">All Teams</option>
              <option disabled>──────────</option>
              {availableRoles.map(r=>(
                <option key={r} value={`role:${r}`}>{ROLE_LABELS[r]||r}</option>
              ))}
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
            <label style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>Quarter</label>
            <select value={quarterFilter} onChange={e=>setQuarterFilter(e.target.value)}
              style={{width:'auto',fontSize:13,fontWeight:600,padding:'7px 30px 7px 12px',
                border:'1.5px solid var(--border)',borderRadius:'var(--radius)',
                background:'var(--bg-card)',color:'var(--text-primary)',cursor:'pointer'}}>
              {[...new Set(['all',currentQuarter(),...objectives.map(o=>o.quarter)])].map(q=>(
                <option key={q} value={q}>{q==='all'?'All Quarters':q}</option>
              ))}
            </select>
          </div>
        </div>

        {loading?(
          <div className="loading-screen" style={{minHeight:200,background:'transparent'}}><div className="spinner"/></div>
        ):objectives.length===0?(
          <div className="empty-state">
            <Target size={32} style={{color:'var(--text-muted)',marginBottom:12}}/>
            <p style={{marginBottom:8}}>{isManagement?'No objectives yet. Add your first to get started.':'No objectives assigned to you yet.'}</p>
            {isManagement&&<button className="btn btn-primary btn-sm" onClick={()=>setShowAddObj(true)}>Add First Objective</button>}
          </div>
        ):(()=>{
          // Compute which objectives to show based on view mode
          const companyObjs = objectives.filter(o=>o.role_type==='company_wide')
          const teamObjs = objectives.filter(o=>o.role_type!=='company_wide')
          const userRole = profile?.position

          // Specific team selected via "role:{role}" dropdown option
          if (viewMode.startsWith('role:')) {
            const targetRole = viewMode.replace('role:','')
            const roleObjs = objectives.filter(o=>o.role_type===targetRole)
            const roleLabel = ROLE_LABELS[targetRole]||targetRole
            const roleColor = ROLE_COLORS[targetRole]||'var(--accent)'
            return (
              <>
                {/* Company context banner (collapsed) */}
                {companyObjs.length>0&&(
                  <div style={{marginBottom:24}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                      <span style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--font-mono)'}}>Company Context</span>
                      <div style={{flex:1,height:1,background:'var(--border)'}}/>
                    </div>
                    {companyObjs.map(obj=>renderObjCard(obj))}
                  </div>
                )}
                {/* Team-specific objectives */}
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <span style={{fontSize:11,fontWeight:700,color:roleColor,textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--font-mono)'}}>{roleLabel} — Objectives</span>
                    <div style={{flex:1,height:1,background:roleColor,opacity:0.3}}/>
                  </div>
                  {roleObjs.length===0
                    ? <div className="empty-state"><p>No objectives for this team this quarter.</p></div>
                    : roleObjs.map(obj=>renderObjCard(obj))
                  }
                </div>
              </>
            )
          }

          if (viewMode==='company') {
            return companyObjs.length===0
              ? <div className="empty-state"><p>No company objectives this quarter.</p></div>
              : companyObjs.map(obj=>renderObjCard(obj))
          }

          if (viewMode==='team') {
            // My Team: show user's team + company context
            const myTeamObjs = isManagement
              ? teamObjs
              : teamObjs.filter(o=>o.role_type===userRole)
            return (
              <>
                {companyObjs.length>0&&(
                  <div style={{marginBottom:24}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                      <span style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--font-mono)'}}>Company Context</span>
                      <div style={{flex:1,height:1,background:'var(--border)'}}/>
                    </div>
                    {companyObjs.map(obj=>renderObjCard(obj))}
                  </div>
                )}
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--font-mono)'}}>
                      {isManagement?'All Team Objectives':`${ROLE_LABELS[userRole]||'My Team'} — Objectives`}
                    </span>
                    <div style={{flex:1,height:1,background:'var(--accent)',opacity:0.3}}/>
                  </div>
                  {myTeamObjs.length===0
                    ? <div className="empty-state"><p>No team objectives assigned this quarter.</p></div>
                    : myTeamObjs.map(obj=>renderObjCard(obj))
                  }
                </div>
              </>
            )
          }

          // All Teams view — grouped by team for clarity
          return (
            <>
              {/* Company first */}
              {companyObjs.length>0&&(
                <div style={{marginBottom:24}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--font-mono)'}}>Company</span>
                    <div style={{flex:1,height:1,background:'var(--border)'}}/>
                  </div>
                  {companyObjs.map(obj=>renderObjCard(obj))}
                </div>
              )}
              {/* Then each team grouped */}
              {availableRoles.map(r=>{
                const roleObjs = objectives.filter(o=>o.role_type===r)
                if (!roleObjs.length) return null
                const color = ROLE_COLORS[r]||'var(--accent)'
                return (
                  <div key={r} style={{marginBottom:24}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                      <span style={{fontSize:11,fontWeight:700,color,textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--font-mono)'}}>{ROLE_LABELS[r]||r}</span>
                      <div style={{flex:1,height:1,background:color,opacity:0.3}}/>
                    </div>
                    {roleObjs.map(obj=>renderObjCard(obj))}
                  </div>
                )
              })}
            </>
          )
        })()}
      </div>

      {/* Guide modal */}
      {showGuide&&(
        <div className="modal-overlay" onClick={()=>setShowGuide(false)}>
          <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="modal-title" style={{marginBottom:0}}>How OKRs Work</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setShowGuide(false)}>✕</button>
            </div>
            {[
              {tag:'O',color:'var(--accent)',title:'Objective',desc:'The direction. Qualitative and inspiring. Answers "what are we trying to achieve this quarter?"'},
              {tag:'KR',color:'var(--green)',title:'Key Result',desc:'The measure. A specific number that proves the objective is achieved. Track current value by editing the KR.'},
              {tag:'I',color:'var(--amber)',title:'Initiative',desc:'The work. Actions that drive the KR. Click the circle to advance status, or use the dropdown. KR progress = % of initiatives completed.'},
            ].map(item=>(
              <div key={item.tag} style={{display:'flex',gap:14,marginBottom:16,padding:'12px 14px',background:'var(--bg)',borderRadius:'var(--radius-lg)'}}>
                <div style={{width:32,height:32,borderRadius:'var(--radius)',background:`${item.color}15`,border:`1px solid ${item.color}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:item.color,flexShrink:0}}>{item.tag}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:3}}>{item.title}</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>{item.desc}</div>
                </div>
              </div>
            ))}
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
