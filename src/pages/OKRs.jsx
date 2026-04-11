import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { getMondayStr } from '../lib/dates'

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
function daysUntilEnd(q) {
  return Math.ceil((quarterEndDate(q)-new Date())/(1000*60*60*24))
}
function quarterProgress(q) {
  const [qpart,year]=q.split('-'); const num=parseInt(qpart.replace('Q',''))
  const start=new Date(parseInt(year),(num-1)*3,1)
  const end=quarterEndDate(q)
  return Math.min(100,Math.max(0,Math.round(((new Date()-start)/(end-start))*100)))
}
function getProgress(current,goal,direction) {
  if (!goal||current==null) return 0
  return Math.min(100,direction==='min'?(goal/Math.max(current,0.01))*100:(current/Math.max(goal,0.01))*100)
}
function getStatus(current,goal,direction) {
  if (goal==null||current==null) return 'gray'
  const r=direction==='min'?goal/Math.max(current,0.01):current/Math.max(goal,0.01)
  return r>=1?'green':r>=0.7?'amber':'red'
}
// Safe parse of assignee_ids from jsonb — handles null, string, array
function parseAssignees(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  try { return JSON.parse(val) } catch { return [] }
}

// ── MULTI-SELECT ASSIGNEE PICKER ──────────────────────────────
function AssigneePicker({ allMembers, selected, onChange, accentColor }) {
  const color = accentColor || 'var(--accent)'
  if (!allMembers?.length) return null
  return (
    <div className="form-group">
      <label>Assigned Team Members</label>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
        {allMembers.map(m=>{
          const sel=selected.includes(m.id)
          return (
            <div key={m.id}
              onClick={()=>onChange(sel?selected.filter(x=>x!==m.id):[...selected,m.id])}
              style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:100,
                border:`2px solid ${sel?color:'var(--border)'}`,
                background:sel?`${color}12`:'var(--bg-input)',
                cursor:'pointer',fontSize:12,fontWeight:sel?600:400,
                color:sel?color:'var(--text-secondary)',transition:'all 0.12s'}}>
              <div className="user-avatar" style={{width:20,height:20,fontSize:8,
                border:sel?`1px solid ${color}`:'1px solid var(--border)',
                background:sel?`${color}20`:'var(--bg)'}}>
                {m.avatar_url?<img src={m.avatar_url} alt=""/>:m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
              </div>
              {m.full_name?.split(' ')[0]} {m.full_name?.split(' ')[1]?m.full_name.split(' ')[1][0]+'.':''}
            </div>
          )
        })}
      </div>
      {selected.length>0&&(
        <p style={{fontSize:11,color:'var(--text-muted)',marginTop:6,fontFamily:'var(--font-mono)'}}>
          {selected.length} member{selected.length!==1?'s':''} assigned
        </p>
      )}
    </div>
  )
}

// ── ASSIGNEE NAME LIST ────────────────────────────────────────
function AssigneeNames({ ids, allMembers, color }) {
  if (!ids?.length||!allMembers?.length) return null
  const names = ids.map(id=>allMembers.find(m=>m.id===id)?.full_name).filter(Boolean)
  if (!names.length) return null
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4,flexWrap:'wrap'}}>
      {ids.map(id=>{
        const m=allMembers.find(x=>x.id===id)
        if (!m) return null
        return (
          <div key={id} style={{display:'flex',alignItems:'center',gap:4,
            padding:'2px 8px',borderRadius:100,
            background:`${color||'var(--accent)'}10`,
            border:`1px solid ${color||'var(--accent)'}30`}}>
            <div className="user-avatar" style={{width:16,height:16,fontSize:7,
              border:'none',background:`${color||'var(--accent)'}20`,color:color||'var(--accent)'}}>
              {m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
            </div>
            <span style={{fontSize:11,color:color||'var(--accent)',fontWeight:500}}>{m.full_name}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── MODALS ───────────────────────────────────────────────────

function LogKRModal({ kr, member, onClose, onSave }) {
  const weekStart = getMondayStr()
  const [value,setValue]=useState('')
  const [saving,setSaving]=useState(false)

  async function handleSave() {
    if (value==='') return; setSaving(true)
    await supabase.from('kr_values').upsert({
      key_result_id:kr.id, user_id:member.id,
      week_start:weekStart, value:parseFloat(value)
    },{onConflict:'key_result_id,user_id,week_start'})
    onSave(); setSaving(false); onClose()
  }

  const status=value!==''?getStatus(parseFloat(value),kr.goal_value,kr.goal_direction):'gray'
  const statusColor=status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title" style={{marginBottom:6}}>Log Progress</h2>
        <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4}}>{kr.metric_name}</p>
        <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:18}}>
          {member.full_name} · {weekStart}
        </p>
        <div className="form-group">
          <label>Your value this week ({kr.unit})</label>
          <input type="number" value={value} onChange={e=>setValue(e.target.value)}
            placeholder={`Goal: ${kr.goal_direction==='min'?'≤':'≥'}${kr.goal_value}${kr.unit}`} autoFocus/>
        </div>
        {value!==''&&(
          <div style={{padding:'10px 14px',borderRadius:'var(--radius)',marginBottom:14,
            background:status==='green'?'var(--green-dim)':status==='red'?'var(--red-dim)':'var(--amber-dim)',
            border:`1px solid ${statusColor}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,color:statusColor}}>
              {parseFloat(value)}{kr.unit} vs goal {kr.goal_direction==='min'?'≤':'≥'}{kr.goal_value}{kr.unit}
            </span>
            <span className={`badge ${status}`}>{status==='green'?'On track':status==='red'?'Behind':'Close'}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||value===''}>Save Progress</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function ObjectiveModal({ existing, allMembers, onClose, onSave }) {
  const quarter=currentQuarter()
  const [form,setForm]=useState({
    title:existing?.title||'', description:existing?.description||'',
    department:existing?.department||'delivery', role_type:existing?.role_type||'creative_strategist',
    quarter:existing?.quarter||quarter,
    assignee_ids: parseAssignees(existing?.assignee_ids),
  })
  const [saving,setSaving]=useState(false)

  async function handleSave() {
    if (!form.title) return; setSaving(true)
    const payload={
      title:form.title, description:form.description, department:form.department,
      role_type:form.role_type, quarter:form.quarter,
      assignee_ids:form.assignee_ids,
      updated_at:new Date().toISOString()
    }
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
            <strong style={{color:'var(--accent)'}}>Objective</strong> = What you want to achieve. Qualitative, ambitious, inspiring. Not a number.
          </p>
        </div>
        <div className="form-group"><label>Objective Title *</label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Deliver exceptional creative output for every client"/>
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
        <AssigneePicker allMembers={allMembers} selected={form.assignee_ids}
          onChange={ids=>setForm({...form,assignee_ids:ids})} accentColor="var(--accent)"/>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':existing?'Save':'Add Objective'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function KRModal({ objectiveId, existing, allMembers, onClose, onSave }) {
  const [form,setForm]=useState({
    title:existing?.title||'', metric_name:existing?.metric_name||'',
    goal_value:existing?.goal_value||'', current_value:existing?.current_value||0,
    goal_direction:existing?.goal_direction||'max', unit:existing?.unit||'%',
    visibility:existing?.visibility||'team',
    assignee_ids: parseAssignees(existing?.assignee_ids),
  })
  const [saving,setSaving]=useState(false)

  async function handleSave() {
    if (!form.metric_name||!form.goal_value) return; setSaving(true)
    const payload={
      title:form.title, metric_name:form.metric_name,
      goal_value:parseFloat(form.goal_value), goal_direction:form.goal_direction,
      unit:form.unit, visibility:form.visibility,
      assignee_ids:form.assignee_ids,
      updated_at:new Date().toISOString()
    }
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
            <strong style={{color:'var(--green)'}}>Key Result</strong> = A specific measurable number that proves the objective is achieved.
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
          <div className="form-group"><label>Unit</label>
            <input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="%, #, $"/>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Direction</label>
            <select value={form.goal_direction} onChange={e=>setForm({...form,goal_direction:e.target.value})}>
              <option value="max">Higher is better (≥)</option>
              <option value="min">Lower is better (≤)</option>
            </select>
          </div>
          <div className="form-group"><label>Visibility</label>
            <select value={form.visibility} onChange={e=>setForm({...form,visibility:e.target.value})}>
              <option value="team">Team</option>
              <option value="management">Management only</option>
              <option value="ceo">CEO only</option>
            </select>
          </div>
        </div>
        <AssigneePicker allMembers={allMembers} selected={form.assignee_ids}
          onChange={ids=>setForm({...form,assignee_ids:ids})} accentColor="var(--green)"/>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':existing?'Save':'Add KR'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function InitiativeModal({ kr, existing, allMembers, onClose, onSave }) {
  const STATUS_OPTIONS=['not_started','started','half','three_quarters','completed']
  const STATUS_LABELS={not_started:'Not Started',started:'Started',half:'50%',three_quarters:'75%',completed:'Completed'}
  const ROLE_LABELS_LOCAL={marketing:'Marketing',media_buyer:'Media Buyer',creative_strategist:'Creative Strategist',editor:'Editor',designer:'Designer',ugc_manager:'UGC Manager',email_marketer:'Email Marketer',ops_manager:'Operations Manager',ops_assistant:'Operations Assistant',hr_manager:'HR Manager',management:'Management'}
  const [tab,setTab]=useState(existing?'edit':'new')
  const [form,setForm]=useState({
    system_name:existing?.system_name||'', milestone_name:existing?.milestone_name||'',
    department:existing?.department||'delivery', role_type:existing?.role_type||'creative_strategist',
    status:existing?.status||'not_started',
    assignee_ids: parseAssignees(existing?.assignee_ids),
  })
  const [existingMilestones,setExistingMilestones]=useState([])
  const [saving,setSaving]=useState(false)

  useEffect(()=>{if(tab==='link')loadUnlinked()},[tab])

  async function loadUnlinked() {
    const {data}=await supabase.from('milestones').select('*')
      .eq('is_active',true).is('key_result_id',null).neq('status','completed').order('system_name')
    setExistingMilestones(data||[])
  }

  async function handleSave() {
    if (!form.system_name||!form.milestone_name) return; setSaving(true)
    const payload={
      system_name:form.system_name, milestone_name:form.milestone_name,
      department:form.department, role_type:form.role_type,
      status:form.status, assignee_ids:form.assignee_ids,
      updated_at:new Date().toISOString()
    }
    if (existing) await supabase.from('milestones').update(payload).eq('id',existing.id)
    else await supabase.from('milestones').insert({...payload,status:form.status,key_result_id:kr.id,is_active:true})
    onSave(); setSaving(false); onClose()
  }

  async function handleLink(milestoneId) {
    setSaving(true)
    await supabase.from('milestones').update({key_result_id:kr.id}).eq('id',milestoneId)
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title" style={{marginBottom:4}}>{existing?'Edit Initiative':'Add Initiative'}</h2>
        {!existing&&<p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:16}}>Supporting KR: <strong style={{color:'var(--amber)'}}>{kr.metric_name}</strong></p>}
        {!existing&&(
          <div className="tabs" style={{marginBottom:16}}>
            <button className={`tab ${tab==='new'?'active':''}`} onClick={()=>setTab('new')}>Create New</button>
            <button className={`tab ${tab==='link'?'active':''}`} onClick={()=>setTab('link')}>Link Existing</button>
          </div>
        )}
        {(tab==='new'||existing)&&(
          <>
            <div className="form-group"><label>System / Project Name</label>
              <input value={form.system_name} onChange={e=>setForm({...form,system_name:e.target.value})} placeholder="e.g. Approval Rate Optimization" autoFocus={!existing}/>
            </div>
            <div className="form-group"><label>Initiative / Action Step</label>
              <input value={form.milestone_name} onChange={e=>setForm({...form,milestone_name:e.target.value})} placeholder="e.g. Build standardized brief template"/>
            </div>
            <div className="grid-2">
              <div className="form-group"><label>Department</label>
                <select value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>
                  {['delivery','marketing','operations','management'].map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Role Type</label>
                <select value={form.role_type} onChange={e=>setForm({...form,role_type:e.target.value})}>
                  {Object.entries(ROLE_LABELS_LOCAL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                {STATUS_OPTIONS.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <AssigneePicker allMembers={allMembers} selected={form.assignee_ids}
              onChange={ids=>setForm({...form,assignee_ids:ids})} accentColor="var(--amber)"/>
            <div className="flex gap-2 mt-2">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving||!form.system_name||!form.milestone_name}>
                {saving?'Saving...':existing?'Save Changes':'Add Initiative'}
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
        {tab==='link'&&!existing&&(
          <>
            <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:12}}>Select an unlinked milestone to attach to this KR.</p>
            {existingMilestones.length===0?<div className="empty-state" style={{padding:'20px 0'}}><p>No unlinked milestones found.</p></div>:(
              <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:300,overflowY:'auto'}}>
                {existingMilestones.map(ms=>(
                  <div key={ms.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius)',cursor:'pointer'}} onClick={()=>handleLink(ms.id)}>
                    <div className={`ms-dot ${ms.status}`}/>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{ms.milestone_name}</div><div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{ms.system_name}</div></div>
                    <span style={{fontSize:11,color:'var(--accent)',fontWeight:600}}>Link →</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-ghost" style={{marginTop:12}} onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── MEMBER KR ROW — own component (fixes hooks-in-map bug) ────
function MemberKRRow({ member, kr, krValues, weekStart, onLog, canLog }) {
  const [showChart,setShowChart]=useState(false)
  const vals = krValues[`${member.id}_${kr.id}`]||[]
  const thisWeek = vals.find(v=>v.week_start===weekStart)
  // Latest value across all weeks
  const latestEntry = vals[0] // already sorted desc
  const current = latestEntry?.value ?? null
  const status = current!==null?getStatus(current,kr.goal_value,kr.goal_direction):'gray'
  const progress = current!==null?getProgress(current,kr.goal_value,kr.goal_direction):0
  const history = vals.slice().reverse().map(v=>({week:v.week_start?.slice(5),value:v.value}))
  const chartColor = status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'

  return (
    <div style={{borderBottom:'1px solid var(--border)'}}>
      <div className="flex items-center gap-2" style={{padding:'9px 14px',flexWrap:'wrap'}}>
        <div className="user-avatar" style={{width:26,height:26,fontSize:9,flexShrink:0}}>
          {member.avatar_url?<img src={member.avatar_url} alt=""/>:member.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
        </div>
        <span style={{fontSize:12,fontWeight:500,flex:1,minWidth:100}}>{member.full_name}</span>
        <div style={{flex:2,minWidth:80}}>
          <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
            <div style={{width:`${progress}%`,height:'100%',borderRadius:2,transition:'width 0.4s ease',
              background:status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'}}/>
          </div>
        </div>
        <div style={{minWidth:64,textAlign:'right',flexShrink:0}}>
          {current!==null?(
            <div>
              <span style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:700,color:status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'}}>
                {current}{kr.unit}
              </span>
              {!thisWeek&&<div style={{fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>prev week</div>}
            </div>
          ):<span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>—</span>}
        </div>
        <span className={`badge ${status}`} style={{fontSize:9,minWidth:60,textAlign:'center',flexShrink:0}}>
          {status==='green'?'On track':status==='red'?'Behind':status==='amber'?'Close':'No data'}
        </span>
        <div className="flex gap-1" style={{flexShrink:0}}>
          {canLog&&(
            <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={()=>onLog(kr,member)}>
              {thisWeek?<><Edit2 size={11}/> Update</>:'+ Log'}
            </button>
          )}
          {history.length>1&&<button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setShowChart(!showChart)}>{showChart?<ChevronUp size={12}/>:<ChevronDown size={12}/>}</button>}
        </div>
      </div>
      {showChart&&history.length>1&&(
        <div style={{padding:'0 14px 10px',background:'var(--bg)'}}>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={history} margin={{top:4,right:8,bottom:0,left:-20}}>
              <XAxis dataKey="week" tick={{fill:'var(--text-muted)',fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'var(--text-muted)',fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:11}}
                formatter={v=>[`${v}${kr.unit}`,member.full_name]}/>
              <ReferenceLine y={kr.goal_value} stroke={chartColor} strokeDasharray="4 4" strokeOpacity={0.6}/>
              <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} dot={{fill:chartColor,r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── KR ROW ────────────────────────────────────────────────────
function KRRow({ kr, members, krValues, milestones, allMembers, onLog, onEdit, onDelete, onInitiativeChange, isManagement, isCEO, profileId }) {
  const [expanded,setExpanded]=useState(false)
  const [addingInitiative,setAddingInitiative]=useState(false)
  const [editingInitiative,setEditingInitiative]=useState(null)

  const weekStart = getMondayStr()
  const krAssignees = parseAssignees(kr.assignee_ids)

  // Team avg from LATEST values per member (not just this week)
  const memberLatestVals = members.map(m=>{
    const vals = krValues[`${m.id}_${kr.id}`]||[]
    return vals.length ? vals[0].value : null
  }).filter(v=>v!==null)

  const teamAvg = memberLatestVals.length
    ? (memberLatestVals.reduce((s,v)=>s+v,0)/memberLatestVals.length).toFixed(1)
    : null
  const status = teamAvg!==null?getStatus(parseFloat(teamAvg),kr.goal_value,kr.goal_direction):'gray'
  const progress = teamAvg!==null?getProgress(parseFloat(teamAvg),kr.goal_value,kr.goal_direction):0
  const onTrack = memberLatestVals.filter(v=>getStatus(v,kr.goal_value,kr.goal_direction)==='green').length
  const behind = memberLatestVals.filter(v=>getStatus(v,kr.goal_value,kr.goal_direction)==='red').length

  const initiatives = milestones.filter(m=>m.key_result_id===kr.id)
  const doneInit = initiatives.filter(m=>m.status==='completed').length

  const STATUS_OPTIONS=['not_started','started','half','three_quarters','completed']
  const STATUS_LABELS={not_started:'Not Started',started:'Started',half:'50%',three_quarters:'75%',completed:'Done'}

  return (
    <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:8,boxShadow:'var(--shadow-xs)'}}>
      <div style={{padding:'12px 14px',cursor:'pointer',background:'var(--bg-card)'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--accent)',background:'var(--accent-dim)',padding:'1px 7px',borderRadius:100,flexShrink:0,fontWeight:600}}>KR</span>
              <span style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{kr.metric_name}</span>
              {initiatives.length>0&&(
                <span style={{fontSize:9,color:'var(--amber)',fontFamily:'var(--font-mono)',background:'var(--amber-dim)',padding:'1px 6px',borderRadius:100,fontWeight:600}}>
                  {doneInit}/{initiatives.length} initiatives
                </span>
              )}
            </div>
            {kr.title&&<p style={{fontSize:11,color:'var(--text-muted)',marginTop:2,marginLeft:34}}>{kr.title}</p>}
            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginTop:3,marginLeft:34}}>
              Goal: {kr.goal_direction==='min'?'≤':'≥'}{kr.goal_value}{kr.unit}
              {members.length>0&&<span style={{marginLeft:10}}>
                {memberLatestVals.length}/{members.length} logged
                {onTrack>0&&<span style={{color:'var(--green)',marginLeft:8}}>✓{onTrack}</span>}
                {behind>0&&<span style={{color:'var(--red)',marginLeft:6}}>✗{behind}</span>}
              </span>}
            </div>
            {/* KR assignee names */}
            {krAssignees.length>0&&allMembers&&(
              <div style={{marginLeft:34,marginTop:4}}>
                <AssigneeNames ids={krAssignees} allMembers={allMembers} color="var(--green)"/>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2" style={{flexShrink:0}}>
            {teamAvg!==null&&(
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:700,letterSpacing:'-0.03em',
                  color:status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'}}>{teamAvg}{kr.unit}</div>
                <div style={{fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>avg</div>
              </div>
            )}
            {isManagement&&(
              <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>onEdit(kr)}><Edit2 size={12}/></button>
                <button className="btn btn-danger btn-icon btn-sm" onClick={()=>onDelete(kr.id)}><Trash2 size={12}/></button>
              </div>
            )}
            {expanded?<ChevronUp size={14} color="var(--text-muted)"/>:<ChevronDown size={14} color="var(--text-muted)"/>}
          </div>
        </div>
        <div className="progress-bar-wrap" style={{marginTop:8}}>
          <div className={`progress-bar-fill ${status}`} style={{width:`${progress}%`}}/>
        </div>
      </div>

      {expanded&&(
        <div style={{background:'var(--bg)',borderTop:'1px solid var(--border)'}}>
          {/* Member rows */}
          <div style={{borderBottom:'1px solid var(--border)'}}>
            {members.map(m=>{
              // Only assignees can log; management can always log
              const canLog = isManagement || parseAssignees(kr.assignee_ids).includes(m.id) || m.id===profileId
              return (
                <MemberKRRow key={m.id} member={m} kr={kr} krValues={krValues}
                  weekStart={weekStart} onLog={onLog} canLog={canLog}/>
              )
            })}
            {members.length===0&&(
              <div style={{padding:'16px 14px',color:'var(--text-muted)',fontSize:12}}>
                No team members assigned to this KR yet. Edit the KR to assign members.
              </div>
            )}
          </div>

          {/* Initiatives */}
          <div style={{padding:'12px 14px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--amber)',textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>
                Initiatives {initiatives.length>0&&`· ${doneInit}/${initiatives.length} done`}
              </div>
              {isManagement&&(
                <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();setAddingInitiative(true)}}>
                  <Plus size={12}/> Add Initiative
                </button>
              )}
            </div>
            {initiatives.length===0?(
              <p style={{fontSize:11,color:'var(--text-muted)'}}>
                {isManagement?'No initiatives yet. Add one to define the actions driving this KR.':'No initiatives linked yet.'}
              </p>
            ):initiatives.map(ms=>{
              const msAssignees = parseAssignees(ms.assignee_ids)
              return (
                <div key={ms.id} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <div className="flex items-center gap-2" style={{flexWrap:'wrap'}}>
                    <div className={`ms-dot ${ms.status}`} style={{flexShrink:0}}/>
                    <div style={{flex:1,minWidth:120}}>
                      <div style={{fontSize:12,fontWeight:500,color:'var(--text-primary)'}}>{ms.milestone_name}</div>
                      <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{ms.system_name}</div>
                    </div>
                    <select value={ms.status}
                      onChange={async e=>{
                        await supabase.from('milestones').update({status:e.target.value}).eq('id',ms.id)
                        onInitiativeChange&&onInitiativeChange()
                      }}
                      style={{width:'auto',fontSize:10,padding:'3px 24px 3px 7px',fontFamily:'var(--font-mono)'}}
                      onClick={e=>e.stopPropagation()}>
                      {STATUS_OPTIONS.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    {isManagement&&(
                      <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setEditingInitiative(ms)}><Edit2 size={11}/></button>
                        <button className="btn btn-danger btn-icon btn-sm"
                          onClick={async()=>{
                            if(!confirm('Remove this initiative?')) return
                            await supabase.from('milestones').update({is_active:false}).eq('id',ms.id)
                            onInitiativeChange&&onInitiativeChange()
                          }}><Trash2 size={11}/></button>
                      </div>
                    )}
                  </div>
                  {/* Initiative assignee names */}
                  {msAssignees.length>0&&allMembers&&(
                    <div style={{marginLeft:20,marginTop:4}}>
                      <AssigneeNames ids={msAssignees} allMembers={allMembers} color="var(--amber)"/>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {addingInitiative&&(
        <InitiativeModal kr={kr} allMembers={allMembers}
          onClose={()=>setAddingInitiative(false)}
          onSave={()=>{setAddingInitiative(false);onInitiativeChange&&onInitiativeChange()}}/>
      )}
      {editingInitiative&&(
        <InitiativeModal kr={kr} existing={editingInitiative} allMembers={allMembers}
          onClose={()=>setEditingInitiative(null)}
          onSave={()=>{setEditingInitiative(null);onInitiativeChange&&onInitiativeChange()}}/>
      )}
    </div>
  )
}

// ── OBJECTIVE CARD ─────────────────────────────────────────────
function ObjectiveCard({ objective, keyResults, members, krValues, milestones, allMembers, onAddKR, onEditKR, onDeleteKR, onEditObj, onDeleteObj, onLog, onInitiativeChange, isManagement, isCEO, profileId }) {
  const [expanded,setExpanded]=useState(true)
  const color = ROLE_COLORS[objective.role_type]||'var(--accent)'
  const objAssignees = parseAssignees(objective.assignee_ids)

  // ── CORRECT PROGRESS LOGIC ──────────────────────────────────
  // Uses LATEST logged value per KR per member (not just this week)
  // Objective only hits 100% when ALL KRs are at goal AND all initiatives done
  const krProgresses = keyResults.map(kr=>{
    const memberVals = members.map(m=>{
      const vals = krValues[`${m.id}_${kr.id}`]||[]
      return vals.length ? vals[0].value : null // latest value
    }).filter(v=>v!==null)

    if (!memberVals.length) return null
    const avg = memberVals.reduce((s,v)=>s+v,0)/memberVals.length
    return {
      progress: getProgress(avg,kr.goal_value,kr.goal_direction),
      onTarget: getStatus(avg,kr.goal_value,kr.goal_direction)==='green'
    }
  }).filter(v=>v!==null)

  const allKRsOnTarget = krProgresses.length>0 && krProgresses.every(k=>k.onTarget)
  const allInitiativesDone = milestones.filter(m=>keyResults.some(kr=>kr.id===m.key_result_id)).every(m=>m.status==='completed')
  const hasInitiatives = milestones.filter(m=>keyResults.some(kr=>kr.id===m.key_result_id)).length>0

  // Progress = avg of KR progresses, but CAPPED at 99% unless truly complete
  const avgProgress = krProgresses.length
    ? Math.round(krProgresses.reduce((s,k)=>s+k.progress,0)/krProgresses.length)
    : 0

  // 100% only when all KRs on target AND (no initiatives OR all done)
  const overallProgress = allKRsOnTarget && (!hasInitiatives||allInitiativesDone)
    ? 100
    : Math.min(avgProgress, 99) // never show 100% unless truly complete

  const visibleKRs = keyResults.filter(kr=>{
    if (kr.visibility==='ceo') return isCEO
    if (kr.visibility==='management') return isManagement
    return true
  })

  const daysLeft = daysUntilEnd(objective.quarter)
  const qProg = quarterProgress(objective.quarter)

  return (
    <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
      <div style={{padding:'16px 18px',borderLeft:`5px solid ${color}`,cursor:'pointer'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}}>
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color,background:`${color}15`,padding:'2px 8px',borderRadius:100,textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>Objective</span>
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',background:'var(--bg)',padding:'2px 8px',borderRadius:100}}>{objective.quarter}</span>
              {objective.role_type&&<span style={{fontSize:9,color,fontFamily:'var(--font-mono)',background:`${color}12`,padding:'2px 7px',borderRadius:100,fontWeight:500}}>{ROLE_LABELS[objective.role_type]||objective.role_type}</span>}
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:daysLeft<14?'var(--red)':daysLeft<30?'var(--amber)':'var(--text-muted)',background:'var(--bg)',padding:'2px 8px',borderRadius:100}}>
                {daysLeft>0?`${daysLeft}d left`:daysLeft===0?'Ends today':'Quarter ended'}
              </span>
            </div>
            <h3 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,letterSpacing:'-0.02em',marginBottom:4,color:'var(--text-primary)'}}>{objective.title}</h3>
            {objective.description&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,marginBottom:4}}>{objective.description}</p>}
            {/* Objective assignee names */}
            {objAssignees.length>0&&allMembers&&(
              <AssigneeNames ids={objAssignees} allMembers={allMembers} color={color}/>
            )}
          </div>
          <div className="flex items-center gap-3" style={{flexShrink:0}}>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:800,letterSpacing:'-0.04em',
                color:overallProgress===100?'var(--green)':overallProgress>=70?'var(--amber)':color}}>
                {overallProgress}%
              </div>
              <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
                {overallProgress===100?'✓ Complete':'of objective'}
              </div>
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
            <span>OKR progress</span>
            <span>{overallProgress}% {allKRsOnTarget&&(!hasInitiatives||allInitiativesDone)?'— All complete ✓':krProgresses.length===0?'— No data yet':''}</span>
          </div>
          <div style={{height:6,background:'var(--border)',borderRadius:3,overflow:'hidden',marginBottom:4}}>
            <div style={{width:`${overallProgress}%`,height:'100%',
              background:overallProgress===100?'var(--green)':color,
              borderRadius:3,transition:'width 0.5s ease'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:3}}>
            <span>Quarter elapsed</span><span>{qProg}%</span>
          </div>
          <div style={{height:3,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
            <div style={{width:`${qProg}%`,height:'100%',background:'var(--text-muted)',borderRadius:2}}/>
          </div>
          {overallProgress<qProg-10&&krProgresses.length>0&&(
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
            <KRRow key={kr.id} kr={kr} members={members} krValues={krValues}
              milestones={milestones} allMembers={allMembers}
              onLog={onLog} onEdit={onEditKR} onDelete={onDeleteKR}
              onInitiativeChange={onInitiativeChange}
              isManagement={isManagement} isCEO={isCEO} profileId={profileId}/>
          ))}
        </div>
      )}
    </div>
  )
}

// ── OKR GUIDE ─────────────────────────────────────────────────
function OKRGuide({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title" style={{marginBottom:0}}>How OKRs Work</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        {[
          {tag:'O',color:'var(--accent)',title:'Objective — What you want to achieve',
           desc:'Qualitative, ambitious, inspiring. Not a number. Answers: "What are we trying to accomplish this quarter?"',
           tip:'If you can measure it directly, it\'s probably a Key Result, not an Objective.'},
          {tag:'KR',color:'var(--green)',title:'Key Result — How you know you got there',
           desc:'2–5 measurable outcomes per objective. Specific numbers with a deadline. You log your progress every week.',
           tip:'An objective only reaches 100% when ALL its Key Results hit their goal. One KR on target ≠ objective complete.'},
          {tag:'I',color:'var(--amber)',title:'Initiative — What you\'ll do to get there',
           desc:'Specific projects and actions that drive the Key Results. Created inside each KR.',
           tip:'Initiatives must all be completed for the objective to count as truly done.'},
        ].map(item=>(
          <div key={item.tag} style={{marginBottom:16,padding:'14px 16px',background:'var(--bg)',borderRadius:'var(--radius-lg)',borderLeft:`4px solid ${item.color}`}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:item.color,background:`${item.color}15`,padding:'2px 8px',borderRadius:100,fontWeight:600}}>{item.tag}</span>
              <strong style={{fontSize:13,fontFamily:'var(--font-display)',color:'var(--text-primary)'}}>{item.title}</strong>
            </div>
            <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:6}}>{item.desc}</p>
            <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>💡 {item.tip}</p>
          </div>
        ))}
        <div style={{padding:'12px 14px',background:'var(--accent-dim)',border:'1px solid var(--accent)',borderRadius:'var(--radius-lg)'}}>
          <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>
            <strong style={{color:'var(--accent)'}}>Progress rules:</strong> OKR progress uses the latest value logged (not just this week). An objective shows 100% only when every KR is at or above its goal AND all initiatives are completed. One person logging one KR will never make the whole objective complete.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── MAIN PAGE ──────────────────────────────────────────────────
export default function OKRs() {
  const { profile, isCEO, isManagement } = useAuth()
  const [objectives,setObjectives]=useState([])
  const [keyResults,setKeyResults]=useState([])
  const [members,setMembers]=useState([]) // members visible per objective
  const [allMembers,setAllMembers]=useState([]) // all members for picker/display
  const [krValues,setKrValues]=useState({})
  const [milestones,setMilestones]=useState([])
  const [loading,setLoading]=useState(true)
  const [roleFilter,setRoleFilter]=useState('all')
  const [personFilter,setPersonFilter]=useState('all')
  const [quarterFilter,setQuarterFilter]=useState(currentQuarter())
  const [showAddObj,setShowAddObj]=useState(false)
  const [editObj,setEditObj]=useState(null)
  const [addKRFor,setAddKRFor]=useState(null)
  const [editKR,setEditKR]=useState(null)
  const [logTarget,setLogTarget]=useState(null)
  const [showGuide,setShowGuide]=useState(false)

  useEffect(()=>{load()},[profile,roleFilter,personFilter,quarterFilter])

  async function load() {
    if (!profile) return; setLoading(true)

    // Always load all members for pickers and name display
    const {data:allMemberData}=await supabase.from('profiles').select('id,full_name,position,avatar_url,role').order('full_name')
    setAllMembers(allMemberData||[])

    // Load objectives
    let objQ = supabase.from('objectives').select('*').eq('is_active',true).order('role_type')
    if (roleFilter!=='all') objQ=objQ.eq('role_type',roleFilter)
    if (quarterFilter!=='all') objQ=objQ.eq('quarter',quarterFilter)

    // Athletes: only see objectives where they are in assignee_ids
    // (Management sees all)
    const {data:objData}=await objQ

    let filteredObjs = objData||[]
    if (!isManagement) {
      // Filter to objectives where profile.id is in assignee_ids
      filteredObjs = filteredObjs.filter(o=>{
        const ids = parseAssignees(o.assignee_ids)
        return ids.length===0 ? (o.role_type===profile.position) : ids.includes(profile.id)
      })
    }
    setObjectives(filteredObjs)

    if (!filteredObjs.length) { setLoading(false); return }

    const {data:krData}=await supabase.from('key_results').select('*')
      .in('objective_id',filteredObjs.map(o=>o.id)).eq('is_active',true)

    // Filter KRs for athletes: must be assigned to them
    let filteredKRs = krData||[]
    if (!isManagement) {
      filteredKRs = filteredKRs.filter(kr=>{
        const ids = parseAssignees(kr.assignee_ids)
        return ids.length===0 ? true : ids.includes(profile.id)
      })
    }
    setKeyResults(filteredKRs)

    // Members for KR logging display
    let memberQ = supabase.from('profiles').select('id,full_name,position,avatar_url,role').order('full_name')
    if (!isManagement) memberQ=memberQ.eq('id',profile.id)
    else if (personFilter!=='all') memberQ=memberQ.eq('id',personFilter)
    const {data:memberData}=await memberQ
    setMembers(memberData||[])

    // Initiatives
    if (filteredKRs.length) {
      const {data:msData}=await supabase.from('milestones').select('*')
        .in('key_result_id',filteredKRs.map(k=>k.id))
        .eq('is_active',true).order('system_name')
      let filteredMs = msData||[]
      if (!isManagement) {
        filteredMs = filteredMs.filter(ms=>{
          const ids = parseAssignees(ms.assignee_ids)
          return ids.length===0 ? true : ids.includes(profile.id)
        })
      }
      setMilestones(filteredMs)
    }

    // KR values
    if (filteredKRs.length && memberData?.length) {
      const {data:valData}=await supabase.from('kr_values').select('*')
        .in('key_result_id',filteredKRs.map(k=>k.id))
        .in('user_id',memberData.map(m=>m.id))
        .order('week_start',{ascending:false})
      const map={}
      valData?.forEach(v=>{const key=`${v.user_id}_${v.key_result_id}`;if(!map[key])map[key]=[];map[key].push(v)})
      setKrValues(map)
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
  const byRole = objectives.reduce((acc,o)=>{
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
            <p className="page-subtitle">
              {quarterFilter==='all'?'All quarters':quarterFilter}
              {quarterFilter===currentQuarter()&&` · ${daysLeft>0?`${daysLeft} days left`:'Quarter ended'}`}
            </p>
          </div>
          <div className="flex gap-2" style={{flexWrap:'wrap'}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowGuide(true)}><BookOpen size={14}/> How OKRs Work</button>
            {isManagement&&<button className="btn btn-primary btn-sm" onClick={()=>setShowAddObj(true)}><Plus size={14}/> Add Objective</button>}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Quarter countdown bar */}
        {quarterFilter===currentQuarter()&&(
          <div className="card mb-4" style={{padding:'12px 16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:6}}>
              <span>{currentQuarter()} — Quarter Timeline</span>
              <span style={{color:daysLeft<14?'var(--red)':daysLeft<30?'var(--amber)':'var(--text-secondary)'}}>
                {daysLeft>0?`${daysLeft} days remaining`:'Quarter ended'}
              </span>
            </div>
            <div style={{height:8,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
              <div style={{width:`${qp}%`,height:'100%',background:`linear-gradient(90deg, var(--accent), var(--green))`,borderRadius:4,transition:'width 0.5s ease'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginTop:4}}>
              <span>Start of quarter</span><span>{qp}% elapsed</span><span>End of quarter</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:20,alignItems:'center'}}>
          <div className="tabs" style={{border:'none',marginBottom:0,flexWrap:'wrap'}}>
            <button className={`tab ${roleFilter==='all'?'active':''}`} onClick={()=>setRoleFilter('all')}>All Roles</button>
            {availableRoles.map(r=>(
              <button key={r} className={`tab ${roleFilter===r?'active':''}`} onClick={()=>setRoleFilter(r)}
                style={{color:roleFilter===r?ROLE_COLORS[r]:undefined}}>
                {ROLE_LABELS[r]||r}
              </button>
            ))}
          </div>
          {isManagement&&(
            <select value={personFilter} onChange={e=>setPersonFilter(e.target.value)} style={{width:'auto',fontSize:12}}>
              <option value="all">All Team Members</option>
              {allMembers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          <select value={quarterFilter} onChange={e=>setQuarterFilter(e.target.value)} style={{width:'auto',fontSize:12,marginLeft:'auto'}}>
            {[...new Set(['all',currentQuarter(),...objectives.map(o=>o.quarter)])].map(q=><option key={q} value={q}>{q==='all'?'All Quarters':q}</option>)}
          </select>
        </div>

        {loading?(
          <div className="loading-screen" style={{minHeight:200,background:'transparent'}}><div className="spinner"/></div>
        ):objectives.length===0?(
          <div className="empty-state">
            <p>{isManagement?'No objectives yet. Add your first to get started.':'No objectives assigned to you yet. Management will assign you to objectives.'}</p>
            {isManagement&&<button className="btn btn-primary btn-sm" style={{marginTop:12}} onClick={()=>setShowAddObj(true)}>Add First Objective</button>}
            <button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>setShowGuide(true)}><BookOpen size={13}/> Learn how OKRs work</button>
          </div>
        ):(
          Object.entries(byRole).map(([role,objs])=>(
            <div key={role} style={{marginBottom:32}}>
              <div className="flex items-center gap-3 mb-3">
                <div style={{width:10,height:10,borderRadius:'50%',background:ROLE_COLORS[role]||'var(--accent)',flexShrink:0}}/>
                <h2 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,letterSpacing:'-0.02em',color:'var(--text-primary)'}}>
                  {ROLE_LABELS[role]||role}
                </h2>
                <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>{objs.length} objective{objs.length!==1?'s':''}</span>
              </div>
              {objs.map(obj=>{
                const objKRs = keyResults.filter(kr=>kr.objective_id===obj.id)
                // Members for this objective: either assigned members or role-matched
                const objAssignees = parseAssignees(obj.assignee_ids)
                const objMembers = isManagement
                  ? (personFilter!=='all' ? members : members.filter(m=>objAssignees.length===0||objAssignees.includes(m.id)))
                  : members
                return (
                  <ObjectiveCard key={obj.id} objective={obj}
                    keyResults={objKRs}
                    members={objMembers}
                    krValues={krValues}
                    milestones={milestones}
                    allMembers={allMembers}
                    onAddKR={id=>setAddKRFor(id)}
                    onEditKR={kr=>setEditKR(kr)}
                    onDeleteKR={deleteKR}
                    onEditObj={o=>setEditObj(o)}
                    onDeleteObj={deleteObjective}
                    onLog={(kr,m)=>setLogTarget({kr,member:m})}
                    onInitiativeChange={load}
                    isManagement={isManagement}
                    isCEO={isCEO}
                    profileId={profile?.id}
                  />
                )
              })}
            </div>
          ))
        )}
      </div>

      {showGuide&&<OKRGuide onClose={()=>setShowGuide(false)}/>}
      {showAddObj&&<ObjectiveModal allMembers={allMembers} onClose={()=>setShowAddObj(false)} onSave={load}/>}
      {editObj&&<ObjectiveModal existing={editObj} allMembers={allMembers} onClose={()=>setEditObj(null)} onSave={load}/>}
      {addKRFor&&<KRModal objectiveId={addKRFor} allMembers={allMembers} onClose={()=>setAddKRFor(null)} onSave={load}/>}
      {editKR&&<KRModal existing={editKR} objectiveId={editKR.objective_id} allMembers={allMembers} onClose={()=>setEditKR(null)} onSave={load}/>}
      {logTarget&&<LogKRModal kr={logTarget.kr} member={logTarget.member} onClose={()=>setLogTarget(null)} onSave={load}/>}
    </>
  )
}
