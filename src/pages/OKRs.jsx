import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, Target, Check, X } from 'lucide-react'
import { getMondayStr } from '../lib/dates'

const DEPT_COLORS = { delivery:'var(--green)', marketing:'#eab308', operations:'var(--accent)', management:'#a78bfa', company:'var(--amber)' }
const ROLE_LABELS = { company_wide:'Company Wide', marketing:'Marketing', media_buyer:'Media Buyer', creative_strategist:'Creative Strategist', editor:'Editor', designer:'Designer', ugc_manager:'UGC Manager', email_marketer:'Email Marketer', ops_manager:'Operations Manager', ops_assistant:'Operations Assistant', hr_manager:'HR Manager', management:'Management' }

function currentQuarter() {
  const m=new Date().getMonth()+1, y=new Date().getFullYear()
  return `Q${m<=3?1:m<=6?2:m<=9?3:4}-${y}`
}

function getProgress(current, goal, direction) {
  if (!goal) return 0
  return Math.min(100, direction==='min' ? (goal/Math.max(current,0.01))*100 : (current/Math.max(goal,0.01))*100)
}
function getStatus(current, goal, direction) {
  if (!goal && current==null) return 'gray'
  const r = direction==='min' ? goal/Math.max(current,0.01) : current/Math.max(goal,0.01)
  return r>=0.9?'green':r>=0.7?'amber':'red'
}

// ── LOG KR VALUE MODAL ───────────────────────────────────────
function LogKRModal({ kr, member, onClose, onSave }) {
  const weekStart = getMondayStr()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (value==='') return
    setSaving(true)
    await supabase.from('kr_values').upsert({
      key_result_id:kr.id, user_id:member.id, week_start:weekStart,
      value:parseFloat(value)
    }, { onConflict:'key_result_id,user_id,week_start' })
    onSave(); setSaving(false); onClose()
  }

  const status = value!=='' ? getStatus(parseFloat(value), kr.goal_value, kr.goal_direction) : 'gray'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title" style={{marginBottom:6}}>Log Key Result</h2>
        <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4}}>{kr.metric_name}</p>
        <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:18}}>
          For: <strong style={{color:'var(--text-primary)'}}>{member.full_name}</strong> · {weekStart}
        </p>
        <div className="form-group">
          <label>Current Value ({kr.unit})</label>
          <input type="number" value={value} onChange={e=>setValue(e.target.value)}
            placeholder={`Goal: ${kr.goal_direction==='min'?'≤':'≥'}${kr.goal_value}${kr.unit}`} autoFocus/>
        </div>
        {value!==''&&(
          <div style={{padding:'10px 14px',borderRadius:'var(--radius)',marginBottom:14,
            background:status==='green'?'var(--green-dim)':status==='red'?'var(--red-dim)':'var(--amber-dim)',
            border:`1px solid ${status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'}`,
            display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,color:status==='green'?'var(--green)':status==='red'?'var(--red)':'var(--amber)'}}>
              {parseFloat(value)}{kr.unit} vs goal {kr.goal_direction==='min'?'≤':'≥'}{kr.goal_value}{kr.unit}
            </span>
            <span className={`badge ${status}`}>{status==='green'?'On track':status==='red'?'Behind':'Close'}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||value===''}>Save</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── ADD/EDIT OBJECTIVE MODAL ─────────────────────────────────
function ObjectiveModal({ existing, onClose, onSave }) {
  const quarter = currentQuarter()
  const [form, setForm] = useState({
    title: existing?.title||'',
    description: existing?.description||'',
    department: existing?.department||'delivery',
    role_type: existing?.role_type||'creative_strategist',
    quarter: existing?.quarter||quarter,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.title) return; setSaving(true)
    if (existing) {
      await supabase.from('objectives').update({...form,updated_at:new Date().toISOString()}).eq('id',existing.id)
    } else {
      await supabase.from('objectives').insert({...form,status:'active'})
    }
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit':'New'} Objective</h2>
        <div className="form-group"><label>Objective Title <span style={{color:'var(--red)'}}>*</span></label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What do you want to achieve this quarter?"/>
        </div>
        <div className="form-group"><label>Description</label>
          <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={2} placeholder="Why does this matter?" style={{resize:'vertical'}}/>
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':existing?'Save Changes':'Add Objective'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── ADD/EDIT KEY RESULT MODAL ────────────────────────────────
function KRModal({ objectiveId, existing, onClose, onSave }) {
  const [form, setForm] = useState({
    title: existing?.title||'',
    metric_name: existing?.metric_name||'',
    goal_value: existing?.goal_value||'',
    current_value: existing?.current_value||0,
    goal_direction: existing?.goal_direction||'max',
    unit: existing?.unit||'%',
    visibility: existing?.visibility||'team',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.metric_name||!form.goal_value) return; setSaving(true)
    if (existing) {
      await supabase.from('key_results').update({...form,goal_value:parseFloat(form.goal_value),updated_at:new Date().toISOString()}).eq('id',existing.id)
    } else {
      await supabase.from('key_results').insert({...form,objective_id:objectiveId,goal_value:parseFloat(form.goal_value)})
    }
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{existing?'Edit':'Add'} Key Result</h2>
        <div className="form-group"><label>KR Title (what it achieves)</label>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Improve first pass quality"/>
        </div>
        <div className="form-group"><label>Metric Name (how it's measured) <span style={{color:'var(--red)'}}>*</span></label>
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

// ── KEY RESULT ROW ───────────────────────────────────────────
function KRRow({ kr, members, krValues, onLog, onEdit, onDelete, isManagement }) {
  const [expanded, setExpanded] = useState(false)
  const weekStart = getMondayStr()

  // Team aggregated — avg of all member values this week
  const thisWeekVals = members
    .map(m => (krValues[`${m.id}_${kr.id}`]||[]).find(v=>v.week_start===weekStart))
    .filter(Boolean).map(v=>v.value)

  const teamAvg = thisWeekVals.length ? (thisWeekVals.reduce((s,v)=>s+v,0)/thisWeekVals.length).toFixed(1) : null
  const status = teamAvg!==null ? getStatus(parseFloat(teamAvg), kr.goal_value, kr.goal_direction) : 'gray'
  const progress = teamAvg!==null ? getProgress(parseFloat(teamAvg), kr.goal_value, kr.goal_direction) : 0
  const onTrack = thisWeekVals.filter(v=>getStatus(v,kr.goal_value,kr.goal_direction)==='green').length
  const behind = thisWeekVals.filter(v=>getStatus(v,kr.goal_value,kr.goal_direction)==='red').length
  const chartColor = status==='green'?'#22c55e':status==='red'?'#ef4444':'#f59e0b'

  return (
    <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:8}}>
      <div style={{padding:'12px 14px',cursor:'pointer',background:'var(--bg-card)'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--accent)',background:'var(--accent-dim)',padding:'1px 6px',borderRadius:100,flexShrink:0}}>KR</span>
              <span style={{fontSize:13,fontWeight:600}}>{kr.metric_name}</span>
            </div>
            {kr.title&&<p style={{fontSize:11,color:'var(--text-muted)',marginTop:2,marginLeft:32}}>{kr.title}</p>}
            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginTop:3,marginLeft:32}}>
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
                <div style={{fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>team avg</div>
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
          {members.map(m=>{
            const vals = krValues[`${m.id}_${kr.id}`]||[]
            const thisWeek = vals.find(v=>v.week_start===weekStart)
            const current = thisWeek?.value??null
            const mStatus = current!==null?getStatus(current,kr.goal_value,kr.goal_direction):'gray'
            const mProgress = current!==null?getProgress(current,kr.goal_value,kr.goal_direction):0
            const history = vals.slice().reverse().map(v=>({week:v.week_start?.slice(5),value:v.value}))
            const [showChart, setShowChart] = useState(false)
            return (
              <div key={m.id} style={{borderBottom:'1px solid var(--border)'}}>
                <div className="flex items-center gap-3" style={{padding:'9px 14px',flexWrap:'wrap',gap:8}}>
                  <div className="user-avatar" style={{width:26,height:26,fontSize:9,flexShrink:0}}>
                    {m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                  </div>
                  <span style={{fontSize:12,fontWeight:500,flex:1,minWidth:100}}>{m.full_name}</span>
                  <div style={{flex:2,minWidth:80}}>
                    <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{width:`${mProgress}%`,height:'100%',borderRadius:2,transition:'width 0.4s ease',
                        background:mStatus==='green'?'var(--green)':mStatus==='red'?'var(--red)':'var(--amber)'}}/>
                    </div>
                  </div>
                  <div style={{minWidth:60,textAlign:'right',flexShrink:0}}>
                    {current!==null?(
                      <span style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,letterSpacing:'-0.02em',
                        color:mStatus==='green'?'var(--green)':mStatus==='red'?'var(--red)':'var(--amber)'}}>
                        {current}{kr.unit}
                      </span>
                    ):<span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>—</span>}
                  </div>
                  <span className={`badge ${mStatus}`} style={{fontSize:9,minWidth:55,textAlign:'center',flexShrink:0}}>
                    {mStatus==='green'?'On track':mStatus==='red'?'Behind':mStatus==='amber'?'Close':'No data'}
                  </span>
                  <div className="flex gap-1" style={{flexShrink:0}}>
                    <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={()=>onLog(kr,m)}>
                      {thisWeek?<><Edit2 size={11}/>Update</>:'+ Log'}
                    </button>
                    {history.length>1&&<button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setShowChart(!showChart)}>
                      {showChart?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
                    </button>}
                  </div>
                </div>
                {showChart&&history.length>1&&(
                  <div style={{padding:'0 14px 12px 14px',background:'var(--bg)'}}>
                    <ResponsiveContainer width="100%" height={80}>
                      <LineChart data={history} margin={{top:4,right:8,bottom:0,left:-20}}>
                        <XAxis dataKey="week" tick={{fill:'#3d526e',fontSize:9}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:'#3d526e',fontSize:9}} axisLine={false} tickLine={false}/>
                        <Tooltip contentStyle={{background:'#0e1420',border:'1px solid #1e2d47',borderRadius:8,fontSize:11}}/>
                        <ReferenceLine y={kr.goal_value} stroke={chartColor} strokeDasharray="4 4" strokeOpacity={0.5}/>
                        <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} dot={{fill:chartColor,r:3}}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── OBJECTIVE CARD ───────────────────────────────────────────
function ObjectiveCard({ objective, keyResults, members, krValues, onAddKR, onEditKR, onDeleteKR, onEditObj, onDeleteObj, onLog, isManagement, isCEO }) {
  const [expanded, setExpanded] = useState(false)
  const color = DEPT_COLORS[objective.department]||'var(--accent)'

  // Compute overall objective progress = avg progress of all KRs
  const krProgressArr = keyResults.map(kr=>{
    const weekStart = getMondayStr()
    const vals = members.map(m=>(krValues[`${m.id}_${kr.id}`]||[]).find(v=>v.week_start===weekStart)).filter(Boolean)
    if (!vals.length) return null
    const avg = vals.reduce((s,v)=>s+v.value,0)/vals.length
    return getProgress(avg,kr.goal_value,kr.goal_direction)
  }).filter(v=>v!==null)

  const overallProgress = krProgressArr.length ? Math.round(krProgressArr.reduce((s,p)=>s+p,0)/krProgressArr.length) : 0

  // Visible KRs based on role
  const visibleKRs = keyResults.filter(kr=>{
    if (kr.visibility==='ceo') return isCEO
    if (kr.visibility==='management') return isManagement
    return true
  })

  return (
    <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
      {/* Objective header */}
      <div style={{padding:'16px 18px',borderLeft:`5px solid ${color}`,cursor:'pointer'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontSize:10,fontFamily:'var(--font-mono)',color,background:`${color}18`,padding:'2px 8px',borderRadius:100,letterSpacing:1,textTransform:'uppercase'}}>
                Objective · {objective.quarter}
              </span>
              <span className={`dept-tag ${objective.department}`}>{objective.department}</span>
              {objective.role_type&&<span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{ROLE_LABELS[objective.role_type]||objective.role_type}</span>}
            </div>
            <h3 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,marginTop:8,letterSpacing:'-0.02em'}}>{objective.title}</h3>
            {objective.description&&<p style={{fontSize:12,color:'var(--text-secondary)',marginTop:4,lineHeight:1.5}}>{objective.description}</p>}
            <div style={{marginTop:12}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:4}}>
                <span>{visibleKRs.length} Key Result{visibleKRs.length!==1?'s':''}</span>
                <span style={{color}}>{overallProgress}% complete</span>
              </div>
              <div style={{height:8,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
                <div style={{width:`${overallProgress}%`,height:'100%',background:`linear-gradient(90deg, ${color}, ${color}cc)`,borderRadius:4,transition:'width 0.5s ease'}}/>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{flexShrink:0}}>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:800,letterSpacing:'-0.04em',color}}>{overallProgress}%</div>
              <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>of objective</div>
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
      </div>

      {expanded&&(
        <div style={{padding:'16px 18px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
          <div className="flex items-center justify-between mb-3">
            <h4 style={{fontSize:13,fontWeight:600,fontFamily:'var(--font-display)'}}>Key Results</h4>
            {isManagement&&<button className="btn btn-ghost btn-sm" onClick={()=>onAddKR(objective.id)}><Plus size={13}/> Add KR</button>}
          </div>
          {visibleKRs.length===0?(
            <div className="empty-state" style={{padding:'20px 0'}}>
              <p>No key results yet. Add KRs to define how you'll measure this objective.</p>
              {isManagement&&<button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={()=>onAddKR(objective.id)}>Add First KR</button>}
            </div>
          ):visibleKRs.map(kr=>(
            <KRRow key={kr.id} kr={kr} members={members} krValues={krValues}
              onLog={onLog} onEdit={onEditKR} onDelete={onDeleteKR} isManagement={isManagement}/>
          ))}
        </div>
      )}
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
  const [loading, setLoading] = useState(true)
  const [deptFilter, setDeptFilter] = useState('all')
  const [quarterFilter, setQuarterFilter] = useState(currentQuarter())
  const [showAddObj, setShowAddObj] = useState(false)
  const [editObj, setEditObj] = useState(null)
  const [addKRFor, setAddKRFor] = useState(null)
  const [editKR, setEditKR] = useState(null)
  const [logTarget, setLogTarget] = useState(null)

  useEffect(()=>{load()},[profile,deptFilter,quarterFilter])

  async function load() {
    if (!profile) return; setLoading(true)

    let objQ = supabase.from('objectives').select('*').eq('is_active',true).order('department')
    if (deptFilter!=='all') objQ=objQ.eq('department',deptFilter)
    if (quarterFilter!=='all') objQ=objQ.eq('quarter',quarterFilter)
    const {data:objData}=await objQ; setObjectives(objData||[])

    if (objData?.length) {
      const {data:krData}=await supabase.from('key_results').select('*').in('objective_id',objData.map(o=>o.id)).eq('is_active',true)
      setKeyResults(krData||[])

      // Members
      let memberQ=supabase.from('profiles').select('id,full_name,position,avatar_url,role').order('full_name')
      if (!isManagement) memberQ=memberQ.eq('id',profile.id)
      const {data:memberData}=await memberQ; setMembers(memberData||[])

      // KR values
      if (krData?.length && memberData?.length) {
        const {data:valData}=await supabase.from('kr_values').select('*')
          .in('key_result_id',krData.map(k=>k.id))
          .in('user_id',memberData.map(m=>m.id))
          .order('week_start',{ascending:false})
        const map={}; valData?.forEach(v=>{const key=`${v.user_id}_${v.key_result_id}`;if(!map[key])map[key]=[];map[key].push(v)})
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

  const quarters=['all',currentQuarter(),...['Q1','Q2','Q3','Q4'].map(q=>`${q}-${new Date().getFullYear()}`).filter(q=>q!==currentQuarter())]
  const depts=['all','delivery','marketing','operations','management','company']

  // Group objectives by department
  const totalKRs = keyResults.length
  const weekStart = getMondayStr()
  const loggedKRs = Object.keys(krValues).filter(k=>krValues[k].some(v=>v.week_start===weekStart)).length

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">OKRs</h1>
            <p className="page-subtitle">Objectives, Key Results, and Initiatives — {quarterFilter==='all'?'all quarters':quarterFilter}</p>
          </div>
          {isManagement&&<button className="btn btn-primary" onClick={()=>setShowAddObj(true)}><Plus size={15}/> Add Objective</button>}
        </div>
      </div>
      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">Objectives</div><div className="stat-box-value">{objectives.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Key Results</div><div className="stat-box-value text-accent">{totalKRs}</div></div>
          <div className="stat-box"><div className="stat-box-label">Logged This Week</div><div className="stat-box-value text-green">{loggedKRs}</div></div>
        </div>

        {/* OKR Framework explainer — first time only */}
        <div className="card mb-6" style={{padding:'14px 18px',borderLeft:'4px solid var(--accent)'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
            {[
              {label:'Objective',color:'var(--accent)',desc:'Qualitative. What do you want to achieve? Ambitious, inspirational, time-bound.'},
              {label:'Key Results',color:'var(--green)',desc:'Measurable. How do you know you got there? 2–5 per objective with specific numbers.'},
              {label:'Initiatives',color:'var(--amber)',desc:'Actions. What will you do to hit the key results? These live in Milestones, linked here.'},
            ].map(i=>(
              <div key={i.label}>
                <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:i.color,textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{i.label}</div>
                <p style={{fontSize:11,color:'var(--text-muted)',lineHeight:1.5}}>{i.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6" style={{flexWrap:'wrap'}}>
          <div className="tabs" style={{border:'none',marginBottom:0}}>
            {depts.map(d=><button key={d} className={`tab ${deptFilter===d?'active':''}`} onClick={()=>setDeptFilter(d)}>{d==='all'?'All Depts':d.charAt(0).toUpperCase()+d.slice(1)}</button>)}
          </div>
          <select value={quarterFilter} onChange={e=>setQuarterFilter(e.target.value)} style={{width:'auto',marginLeft:'auto',fontSize:12}}>
            <option value="all">All Quarters</option>
            {[...new Set([currentQuarter(),...objectives.map(o=>o.quarter)])].map(q=><option key={q} value={q}>{q}</option>)}
          </select>
        </div>

        {loading?<div className="loading-screen" style={{minHeight:200}}><div className="spinner"/></div>
          :objectives.length===0?<div className="empty-state"><p>No objectives yet. {isManagement?'Add your first objective to get started.':'Ask management to add objectives for your team.'}</p>{isManagement&&<button className="btn btn-primary btn-sm" style={{marginTop:12}} onClick={()=>setShowAddObj(true)}>Add First Objective</button>}</div>
          :objectives.map(obj=>(
            <ObjectiveCard key={obj.id} objective={obj}
              keyResults={keyResults.filter(kr=>kr.objective_id===obj.id)}
              members={members.filter(m=>!obj.role_type||m.position===obj.role_type||isManagement)}
              krValues={krValues}
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

      {showAddObj&&<ObjectiveModal onClose={()=>setShowAddObj(false)} onSave={load}/>}
      {editObj&&<ObjectiveModal existing={editObj} onClose={()=>setEditObj(null)} onSave={load}/>}
      {addKRFor&&<KRModal objectiveId={addKRFor} onClose={()=>setAddKRFor(null)} onSave={load}/>}
      {editKR&&<KRModal existing={editKR} objectiveId={editKR.objective_id} onClose={()=>setEditKR(null)} onSave={load}/>}
      {logTarget&&<LogKRModal kr={logTarget.kr} member={logTarget.member} onClose={()=>setLogTarget(null)} onSave={load}/>}
    </>
  )
}
