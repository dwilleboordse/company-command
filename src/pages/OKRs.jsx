import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, Info, BookOpen } from 'lucide-react'
import { getMondayStr, today } from '../lib/dates'

const ROLE_LABELS = {
  company_wide:'Company Wide', marketing:'Marketing', media_buyer:'Media Buyer',
  creative_strategist:'Creative Strategist', editor:'Editor', designer:'Designer',
  ugc_manager:'UGC Manager', email_marketer:'Email Marketer', ops_manager:'Operations Manager',
  ops_assistant:'Operations Assistant', hr_manager:'HR Manager', management:'Management',
}
const ROLE_COLORS = {
  creative_strategist:'#22c55e', media_buyer:'#3b82f6', editor:'#8b5cf6',
  designer:'#f43f5e', ugc_manager:'#06b6d4', email_marketer:'#f59e0b',
  ops_manager:'#3b82f6', ops_assistant:'#06b6d4', hr_manager:'#a78bfa',
  marketing:'#eab308', management:'#a78bfa', company_wide:'#f59e0b',
}

function currentQuarter() {
  const m=new Date().getMonth()+1, y=new Date().getFullYear()
  return `Q${m<=3?1:m<=6?2:m<=9?3:4}-${y}`
}

function quarterEndDate(q) {
  // q = "Q2-2026"
  const [qpart, year] = q.split('-')
  const num = parseInt(qpart.replace('Q',''))
  const endMonth = num * 3 // Q1=3, Q2=6, Q3=9, Q4=12
  return new Date(parseInt(year), endMonth, 0) // last day of that month
}

function daysUntilEnd(q) {
  const end = quarterEndDate(q)
  const now = new Date()
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
  return diff
}

function quarterProgress(q) {
  const [qpart, year] = q.split('-')
  const num = parseInt(qpart.replace('Q',''))
  const startMonth = (num-1) * 3
  const start = new Date(parseInt(year), startMonth, 1)
  const end = quarterEndDate(q)
  const now = new Date()
  const total = end - start
  const elapsed = now - start
  return Math.min(100, Math.max(0, Math.round((elapsed/total)*100)))
}

function getProgress(current, goal, direction) {
  if (!goal) return 0
  return Math.min(100, direction==='min'?(goal/Math.max(current,0.01))*100:(current/Math.max(goal,0.01))*100)
}
function getStatus(current, goal, direction) {
  if (goal==null || current==null) return 'gray'
  const r = direction==='min'?goal/Math.max(current,0.01):current/Math.max(goal,0.01)
  return r>=0.9?'green':r>=0.7?'amber':'red'
}

// ── MODALS ───────────────────────────────────────────────────

function LogKRModal({ kr, member, onClose, onSave }) {
  const weekStart = getMondayStr()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (value==='') return
    setSaving(true)
    await supabase.from('kr_values').upsert({
      key_result_id:kr.id, user_id:member.id,
      week_start:weekStart, value:parseFloat(value)
    }, { onConflict:'key_result_id,user_id,week_start' })
    onSave(); setSaving(false); onClose()
  }

  const status = value!=='' ? getStatus(parseFloat(value), kr.goal_value, kr.goal_direction) : 'gray'
  const statusColor = status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'

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

function ObjectiveModal({ existing, onClose, onSave }) {
  const quarter = currentQuarter()
  const [form, setForm] = useState({
    title:existing?.title||'', description:existing?.description||'',
    department:existing?.department||'delivery', role_type:existing?.role_type||'creative_strategist',
    quarter:existing?.quarter||quarter,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.title) return; setSaving(true)
    if (existing) await supabase.from('objectives').update({...form,updated_at:new Date().toISOString()}).eq('id',existing.id)
    else await supabase.from('objectives').insert({...form,status:'active'})
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit':'New'} Objective</h2>
        <div className="card mb-4" style={{padding:'10px 14px',borderLeft:'3px solid var(--accent)',background:'rgba(59,130,246,0.04)'}}>
          <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6}}>
            <strong style={{color:'var(--accent)'}}>Objective</strong> = What you want to achieve. Make it qualitative, ambitious, and inspiring. Not a number — that's what Key Results are for.
          </p>
        </div>
        <div className="form-group"><label>Objective Title <span style={{color:'var(--red)'}}>*</span></label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Deliver exceptional creative output for every client"/>
        </div>
        <div className="form-group"><label>Why does this matter?</label>
          <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={2} placeholder="What's the impact if this is achieved?" style={{resize:'vertical'}}/>
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
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':existing?'Save':'Add Objective'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function KRModal({ objectiveId, existing, onClose, onSave }) {
  const [form, setForm] = useState({
    title:existing?.title||'', metric_name:existing?.metric_name||'',
    goal_value:existing?.goal_value||'', current_value:existing?.current_value||0,
    goal_direction:existing?.goal_direction||'max', unit:existing?.unit||'%', visibility:existing?.visibility||'team',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.metric_name||!form.goal_value) return; setSaving(true)
    if (existing) await supabase.from('key_results').update({...form,goal_value:parseFloat(form.goal_value),updated_at:new Date().toISOString()}).eq('id',existing.id)
    else await supabase.from('key_results').insert({...form,objective_id:objectiveId,goal_value:parseFloat(form.goal_value)})
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit':'Add'} Key Result</h2>
        <div className="card mb-4" style={{padding:'10px 14px',borderLeft:'3px solid var(--green)',background:'rgba(34,197,94,0.04)'}}>
          <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6}}>
            <strong style={{color:'var(--green)'}}>Key Result</strong> = A specific, measurable number that tells you the objective is achieved. "90% first pass approval rate" — not "improve quality."
          </p>
        </div>
        <div className="form-group"><label>What does achieving this KR prove?</label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Clients approve work faster with less rework"/>
        </div>
        <div className="form-group"><label>Metric Name <span style={{color:'var(--red)'}}>*</span></label>
          <input value={form.metric_name} onChange={e=>setForm({...form,metric_name:e.target.value})} placeholder="e.g. First Pass Approval Rate"/>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Goal Value <span style={{color:'var(--red)'}}>*</span></label>
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
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':existing?'Save':'Add KR'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── MEMBER KR ROW — extracted to own component to fix hooks bug ──
function MemberKRRow({ member, kr, krValues, weekStart, onLog }) {
  const [showChart, setShowChart] = useState(false)
  const vals = krValues[`${member.id}_${kr.id}`] || []
  const thisWeek = vals.find(v=>v.week_start===weekStart)
  const current = thisWeek?.value ?? null
  const status = current!==null ? getStatus(current, kr.goal_value, kr.goal_direction) : 'gray'
  const progress = current!==null ? getProgress(current, kr.goal_value, kr.goal_direction) : 0
  const history = vals.slice().reverse().map(v=>({week:v.week_start?.slice(5),value:v.value}))
  const chartColor = status==='green'?'#22c55e':status==='red'?'#ef4444':'#f59e0b'

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
        <div style={{minWidth:56,textAlign:'right',flexShrink:0}}>
          {current!==null
            ?<span style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:700,color:status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'}}>{current}{kr.unit}</span>
            :<span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>—</span>}
        </div>
        <span className={`badge ${status}`} style={{fontSize:9,minWidth:55,textAlign:'center',flexShrink:0}}>
          {status==='green'?'On track':status==='red'?'Behind':status==='amber'?'Close':'No data'}
        </span>
        <div className="flex gap-1" style={{flexShrink:0}}>
          <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={()=>onLog(kr,member)}>
            {thisWeek?<><Edit2 size={11}/> Update</>:'+ Log'}
          </button>
          {history.length>1&&(
            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setShowChart(!showChart)}>
              {showChart?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
            </button>
          )}
        </div>
      </div>
      {showChart&&history.length>1&&(
        <div style={{padding:'0 14px 10px',background:'var(--bg)'}}>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={history} margin={{top:4,right:8,bottom:0,left:-20}}>
              <XAxis dataKey="week" tick={{fill:'#3d526e',fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'#3d526e',fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:'#0e1420',border:'1px solid #1e2d47',borderRadius:8,fontSize:11}}
                formatter={v=>[`${v}${kr.unit}`,member.full_name]}/>
              <ReferenceLine y={kr.goal_value} stroke={chartColor} strokeDasharray="4 4" strokeOpacity={0.5}/>
              <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} dot={{fill:chartColor,r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── KR ROW ───────────────────────────────────────────────────
function KRRow({ kr, members, krValues, milestones, onLog, onEdit, onDelete, isManagement, isCEO }) {
  const [expanded, setExpanded] = useState(false)
  const weekStart = getMondayStr()

  const thisWeekVals = members
    .map(m=>(krValues[`${m.id}_${kr.id}`]||[]).find(v=>v.week_start===weekStart))
    .filter(Boolean).map(v=>v.value)

  const teamAvg = thisWeekVals.length?(thisWeekVals.reduce((s,v)=>s+v,0)/thisWeekVals.length).toFixed(1):null
  const status = teamAvg!==null?getStatus(parseFloat(teamAvg),kr.goal_value,kr.goal_direction):'gray'
  const progress = teamAvg!==null?getProgress(parseFloat(teamAvg),kr.goal_value,kr.goal_direction):0
  const onTrack = thisWeekVals.filter(v=>getStatus(v,kr.goal_value,kr.goal_direction)==='green').length
  const behind = thisWeekVals.filter(v=>getStatus(v,kr.goal_value,kr.goal_direction)==='red').length

  // Initiatives = milestones linked to this KR
  const initiatives = milestones.filter(m=>m.key_result_id===kr.id)
  const doneInit = initiatives.filter(m=>m.status==='completed').length

  return (
    <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:8}}>
      <div style={{padding:'12px 14px',cursor:'pointer',background:'var(--bg-card)'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--accent)',background:'var(--accent-dim)',padding:'1px 7px',borderRadius:100,flexShrink:0}}>KR</span>
              <span style={{fontSize:13,fontWeight:600}}>{kr.metric_name}</span>
              {initiatives.length>0&&(
                <span style={{fontSize:10,color:'var(--amber)',fontFamily:'var(--font-mono)',background:'var(--amber-dim)',padding:'1px 6px',borderRadius:100}}>
                  {doneInit}/{initiatives.length} initiatives
                </span>
              )}
            </div>
            {kr.title&&<p style={{fontSize:11,color:'var(--text-muted)',marginTop:2,marginLeft:34}}>{kr.title}</p>}
            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginTop:3,marginLeft:34}}>
              Goal: {kr.goal_direction==='min'?'≤':'≥'}{kr.goal_value}{kr.unit}
              {members.length>0&&<span style={{marginLeft:10}}>
                {thisWeekVals.length}/{members.length} logged
                {onTrack>0&&<span style={{color:'var(--green)',marginLeft:8}}>✓{onTrack}</span>}
                {behind>0&&<span style={{color:'var(--red)',marginLeft:6}}>✗{behind}</span>}
              </span>}
            </div>
          </div>
          <div className="flex items-center gap-2" style={{flexShrink:0}}>
            {teamAvg!==null&&(
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:700,letterSpacing:'-0.03em',color:status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'}}>{teamAvg}{kr.unit}</div>
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
          {/* Member rows — each is its own component (fixes hooks bug) */}
          <div style={{borderBottom:initiatives.length>0?'1px solid var(--border)':undefined}}>
            {members.map(m=>(
              <MemberKRRow key={m.id} member={m} kr={kr} krValues={krValues} weekStart={weekStart} onLog={onLog}/>
            ))}
            {members.length===0&&(
              <div style={{padding:'16px 14px',color:'var(--text-muted)',fontSize:12}}>
                No team members with this role. Assign positions in Admin.
              </div>
            )}
          </div>

          {/* Initiatives linked to this KR */}
          {initiatives.length>0&&(
            <div style={{padding:'12px 14px'}}>
              <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--amber)',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Initiatives supporting this KR</div>
              {initiatives.map(ms=>(
                <div key={ms.id} className="flex items-center gap-2" style={{padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
                  <div className={`ms-dot ${ms.status}`}/>
                  <span style={{fontSize:12,flex:1}}>{ms.milestone_name}</span>
                  <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{ms.system_name}</span>
                  <span className={`badge ${ms.status==='completed'?'green':ms.status==='not_started'?'gray':'amber'}`} style={{fontSize:9}}>
                    {ms.status==='completed'?'Done':ms.status==='not_started'?'Not Started':ms.status==='half'?'50%':ms.status==='three_quarters'?'75%':'Started'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── OBJECTIVE CARD ────────────────────────────────────────────
function ObjectiveCard({ objective, keyResults, members, krValues, milestones, onAddKR, onEditKR, onDeleteKR, onEditObj, onDeleteObj, onLog, isManagement, isCEO }) {
  const [expanded, setExpanded] = useState(true) // open by default
  const color = ROLE_COLORS[objective.role_type] || 'var(--accent)'
  const weekStart = getMondayStr()

  const krProgressArr = keyResults.map(kr=>{
    const vals = members.map(m=>(krValues[`${m.id}_${kr.id}`]||[]).find(v=>v.week_start===weekStart)).filter(Boolean)
    if (!vals.length) return null
    const avg = vals.reduce((s,v)=>s+v.value,0)/vals.length
    return getProgress(avg,kr.goal_value,kr.goal_direction)
  }).filter(v=>v!==null)

  const overallProgress = krProgressArr.length?Math.round(krProgressArr.reduce((s,p)=>s+p,0)/krProgressArr.length):0

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
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color,background:`${color}18`,padding:'2px 8px',borderRadius:100,textTransform:'uppercase',letterSpacing:1}}>Objective</span>
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',background:'var(--bg)',padding:'2px 8px',borderRadius:100}}>{objective.quarter}</span>
              {objective.role_type&&<span style={{fontSize:9,color,fontFamily:'var(--font-mono)',background:`${color}12`,padding:'2px 7px',borderRadius:100}}>{ROLE_LABELS[objective.role_type]||objective.role_type}</span>}
              {/* Quarter countdown */}
              <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:daysLeft<14?'var(--red)':daysLeft<30?'var(--amber)':'var(--text-muted)',background:'var(--bg)',padding:'2px 8px',borderRadius:100}}>
                {daysLeft>0?`${daysLeft}d left`:daysLeft===0?'Ends today':'Quarter ended'}
              </span>
            </div>
            <h3 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,letterSpacing:'-0.02em',marginBottom:4}}>{objective.title}</h3>
            {objective.description&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5}}>{objective.description}</p>}
          </div>
          <div className="flex items-center gap-3" style={{flexShrink:0}}>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:800,letterSpacing:'-0.04em',color}}>{overallProgress}%</div>
              <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>complete</div>
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

        {/* Dual progress bars: OKR progress + quarter time */}
        <div style={{marginTop:12}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:3}}>
            <span>OKR progress</span><span>{overallProgress}%</span>
          </div>
          <div style={{height:6,background:'var(--border)',borderRadius:3,overflow:'hidden',marginBottom:4}}>
            <div style={{width:`${overallProgress}%`,height:'100%',background:color,borderRadius:3,transition:'width 0.5s ease'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:3}}>
            <span>Quarter elapsed</span><span>{qProg}%</span>
          </div>
          <div style={{height:3,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
            <div style={{width:`${qProg}%`,height:'100%',background:'var(--text-muted)',borderRadius:2}}/>
          </div>
          {overallProgress < qProg - 10 && (
            <p style={{fontSize:10,color:'var(--red)',marginTop:4,fontFamily:'var(--font-mono)'}}>⚠ Behind quarter pace — {qProg - overallProgress}% gap</p>
          )}
        </div>
      </div>

      {expanded&&(
        <div style={{padding:'16px 18px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
          <div className="flex items-center justify-between mb-3">
            <h4 style={{fontSize:13,fontWeight:600}}>Key Results</h4>
            {isManagement&&<button className="btn btn-ghost btn-sm" onClick={()=>onAddKR(objective.id)}><Plus size={13}/> Add KR</button>}
          </div>
          {visibleKRs.length===0?(
            <div className="empty-state" style={{padding:'20px 0'}}>
              <p>No key results yet.</p>
              {isManagement&&<button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={()=>onAddKR(objective.id)}>Add First KR</button>}
            </div>
          ):visibleKRs.map(kr=>(
            <KRRow key={kr.id} kr={kr} members={members} krValues={krValues}
              milestones={milestones} onLog={onLog} onEdit={onEditKR} onDelete={onDeleteKR}
              isManagement={isManagement} isCEO={isCEO}/>
          ))}
        </div>
      )}
    </div>
  )
}

// ── OKR GUIDE PANEL ──────────────────────────────────────────
function OKRGuide({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title" style={{marginBottom:0}}>How OKRs Work</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        {[
          { tag:'O', color:'var(--accent)', title:'Objective — What you want to achieve',
            desc:'Qualitative, ambitious, and inspiring. Not a number. A direction. It answers: "What are we trying to accomplish this quarter?" Example: "Deliver exceptional creative output that moves clients\' results."',
            tip:'If you can measure it directly, it\'s probably a Key Result, not an Objective.' },
          { tag:'KR', color:'var(--green)', title:'Key Result — How you know you got there',
            desc:'2–5 measurable outcomes per objective. Specific numbers with a deadline (the quarter). Example: "First Pass Approval Rate ≥ 90%" or "Briefs Executed ≥ 20/week."',
            tip:'You log your progress here every week. The system tracks your trend and tells you if you\'re on track, close, or behind.' },
          { tag:'I', color:'var(--amber)', title:'Initiative — What you\'ll do to get there',
            desc:'The specific projects, systems, and actions that drive your Key Results. These are your Milestones — link them to a KR in the Milestones tab. Example: "Build standardized brief template → supports First Pass Approval Rate KR."',
            tip:'Milestones are your initiatives. Link them to a Key Result and they show up under that KR here.' },
        ].map(item=>(
          <div key={item.tag} style={{marginBottom:20,padding:'14px 16px',background:'var(--bg)',borderRadius:'var(--radius-lg)',borderLeft:`4px solid ${item.color}`}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:item.color,background:`${item.color}18`,padding:'2px 8px',borderRadius:100}}>{item.tag}</span>
              <strong style={{fontSize:13,fontFamily:'var(--font-display)'}}>{item.title}</strong>
            </div>
            <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:8}}>{item.desc}</p>
            <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>💡 {item.tip}</p>
          </div>
        ))}

        <div style={{padding:'12px 14px',background:'var(--accent-dim)',border:'1px solid var(--accent)',borderRadius:'var(--radius-lg)',marginBottom:16}}>
          <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>
            <strong style={{color:'var(--accent)'}}>How to benefit:</strong> When you log your KR value each week, you build a track record. The system calculates whether you're on pace for the quarter, rewards consistency with badges, and shows you on the leaderboard. The goal isn't perfection — it's visibility. No one can improve what they can't see.
          </p>
        </div>

        <div style={{padding:'12px 14px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)'}}>
          <p style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Scoring guide</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {[
              {label:'On Track',color:'var(--green)',desc:'≥90% of goal'},
              {label:'Close',color:'var(--amber)',desc:'70–89% of goal'},
              {label:'Behind',color:'var(--red)',desc:'<70% of goal'},
            ].map(s=>(
              <div key={s.label} style={{textAlign:'center',padding:'8px',background:'var(--bg-card)',borderRadius:'var(--radius)',border:`1px solid ${s.color}40`}}>
                <div style={{fontSize:11,fontWeight:600,color:s.color,marginBottom:2}}>{s.label}</div>
                <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function OKRs() {
  const { profile, isCEO, isManagement } = useAuth()
  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [members, setMembers] = useState([])
  const [krValues, setKrValues] = useState({})
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('all')
  const [personFilter, setPersonFilter] = useState('all')
  const [quarterFilter, setQuarterFilter] = useState(currentQuarter())
  const [showAddObj, setShowAddObj] = useState(false)
  const [editObj, setEditObj] = useState(null)
  const [addKRFor, setAddKRFor] = useState(null)
  const [editKR, setEditKR] = useState(null)
  const [logTarget, setLogTarget] = useState(null)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(()=>{load()},[profile, roleFilter, personFilter, quarterFilter])

  async function load() {
    if (!profile) return; setLoading(true)

    let objQ = supabase.from('objectives').select('*').eq('is_active',true).order('role_type')
    if (roleFilter!=='all') objQ=objQ.eq('role_type',roleFilter)
    if (quarterFilter!=='all') objQ=objQ.eq('quarter',quarterFilter)
    // Athletes only see their own role's objectives
    if (!isManagement&&profile.position) objQ=objQ.eq('role_type',profile.position)
    const {data:objData}=await objQ; setObjectives(objData||[])

    if (objData?.length) {
      const {data:krData}=await supabase.from('key_results').select('*').in('objective_id',objData.map(o=>o.id)).eq('is_active',true)
      setKeyResults(krData||[])

      // Load members (management sees all, athletes see only themselves)
      let memberQ = supabase.from('profiles').select('id,full_name,position,avatar_url,role').order('full_name')
      if (!isManagement) memberQ=memberQ.eq('id',profile.id)
      else if (personFilter!=='all') memberQ=memberQ.eq('id',personFilter)
      const {data:memberData}=await memberQ; setMembers(memberData||[])

      // Load milestones that are linked to KRs
      if (krData?.length) {
        const {data:msData}=await supabase.from('milestones').select('*').in('key_result_id',krData.map(k=>k.id)).eq('is_active',true)
        setMilestones(msData||[])
      }

      // Load KR values
      if (krData?.length && memberData?.length) {
        const {data:valData}=await supabase.from('kr_values').select('*')
          .in('key_result_id',krData.map(k=>k.id))
          .in('user_id',memberData.map(m=>m.id))
          .order('week_start',{ascending:false})
        const map={}
        valData?.forEach(v=>{const key=`${v.user_id}_${v.key_result_id}`;if(!map[key])map[key]=[];map[key].push(v)})
        setKrValues(map)
      }
    }
    setLoading(false)
  }

  async function deleteObjective(id) {
    if (!confirm('Delete this objective and all its key results?')) return
    await supabase.from('objectives').update({is_active:false}).eq('id',id)
    load()
  }
  async function deleteKR(id) {
    if (!confirm('Delete this key result?')) return
    await supabase.from('key_results').update({is_active:false}).eq('id',id)
    load()
  }

  // All unique roles from objectives for filter
  const availableRoles = [...new Set(objectives.map(o=>o.role_type).filter(Boolean))]
  const availableQuarters = [...new Set(['all',currentQuarter(),...objectives.map(o=>o.quarter)])]
  const allMembers = isManagement ? members : []

  // Group objectives by role_type
  const byRole = objectives.reduce((acc,o)=>{
    const key = o.role_type||'other'
    if (!acc[key]) acc[key]=[]
    acc[key].push(o); return acc
  },{})

  const daysLeft = daysUntilEnd(currentQuarter())
  const qp = quarterProgress(currentQuarter())

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">OKRs</h1>
            <p className="page-subtitle">
              {quarterFilter==='all'?'All quarters':quarterFilter}
              {quarterFilter===currentQuarter()&&` · ${daysLeft > 0 ? `${daysLeft} days left` : 'Quarter ended'}`}
            </p>
          </div>
          <div className="flex gap-2" style={{flexWrap:'wrap'}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowGuide(true)}>
              <BookOpen size={14}/> How OKRs Work
            </button>
            {isManagement&&<button className="btn btn-primary btn-sm" onClick={()=>setShowAddObj(true)}>
              <Plus size={14}/> Add Objective
            </button>}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Quarter progress bar */}
        {quarterFilter===currentQuarter()&&(
          <div className="card mb-4" style={{padding:'12px 16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:6}}>
              <span>{currentQuarter()} — Quarter Timeline</span>
              <span style={{color:daysLeft<14?'var(--red)':daysLeft<30?'var(--amber)':'var(--text-secondary)'}}>
                {daysLeft > 0 ? `${daysLeft} days remaining` : 'Quarter ended'}
              </span>
            </div>
            <div style={{height:8,background:'var(--border)',borderRadius:4,overflow:'hidden',position:'relative'}}>
              <div style={{width:`${qp}%`,height:'100%',background:`linear-gradient(90deg, var(--accent), var(--green))`,borderRadius:4,transition:'width 0.5s ease'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginTop:4}}>
              <span>Start of quarter</span>
              <span>{qp}% elapsed</span>
              <span>End of quarter</span>
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
              {members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          <select value={quarterFilter} onChange={e=>setQuarterFilter(e.target.value)} style={{width:'auto',fontSize:12,marginLeft:'auto'}}>
            {availableQuarters.map(q=><option key={q} value={q}>{q==='all'?'All Quarters':q}</option>)}
          </select>
        </div>

        {loading?(
          <div className="loading-screen" style={{minHeight:200}}><div className="spinner"/></div>
        ):objectives.length===0?(
          <div className="empty-state">
            <p>{isManagement?'No objectives yet. Add your first to get started.':'No objectives set for your role yet. Check back soon.'}</p>
            {isManagement&&<button className="btn btn-primary btn-sm" style={{marginTop:12}} onClick={()=>setShowAddObj(true)}>Add First Objective</button>}
            <button className="btn btn-ghost btn-sm" style={{marginTop:8,marginLeft:8}} onClick={()=>setShowGuide(true)}>
              <BookOpen size={13}/> Learn how OKRs work
            </button>
          </div>
        ):(
          Object.entries(byRole).map(([role,objs])=>(
            <div key={role} style={{marginBottom:32}}>
              <div className="flex items-center gap-3 mb-3">
                <div style={{width:10,height:10,borderRadius:'50%',background:ROLE_COLORS[role]||'var(--accent)',flexShrink:0}}/>
                <h2 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,letterSpacing:'-0.02em'}}>
                  {ROLE_LABELS[role]||role}
                </h2>
                <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>{objs.length} objective{objs.length!==1?'s':''}</span>
              </div>
              {objs.map(obj=>(
                <ObjectiveCard key={obj.id} objective={obj}
                  keyResults={keyResults.filter(kr=>kr.objective_id===obj.id)}
                  members={members.filter(m=>!obj.role_type||m.position===obj.role_type||isManagement)}
                  krValues={krValues}
                  milestones={milestones}
                  onAddKR={id=>setAddKRFor(id)}
                  onEditKR={kr=>setEditKR(kr)}
                  onDeleteKR={deleteKR}
                  onEditObj={o=>setEditObj(o)}
                  onDeleteObj={deleteObjective}
                  onLog={(kr,m)=>setLogTarget({kr,member:m})}
                  isManagement={isManagement}
                  isCEO={isCEO}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {showGuide&&<OKRGuide onClose={()=>setShowGuide(false)}/>}
      {showAddObj&&<ObjectiveModal onClose={()=>setShowAddObj(false)} onSave={load}/>}
      {editObj&&<ObjectiveModal existing={editObj} onClose={()=>setEditObj(null)} onSave={load}/>}
      {addKRFor&&<KRModal objectiveId={addKRFor} onClose={()=>setAddKRFor(null)} onSave={load}/>}
      {editKR&&<KRModal existing={editKR} objectiveId={editKR.objective_id} onClose={()=>setEditKR(null)} onSave={load}/>}
      {logTarget&&<LogKRModal kr={logTarget.kr} member={logTarget.member} onClose={()=>setLogTarget(null)} onSave={load}/>}
    </>
  )
}
