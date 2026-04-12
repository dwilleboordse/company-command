import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { Plus, ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus } from 'lucide-react'

const REVIEW_FIELDS = [
  { key:'output_quality',       label:'Output Quality & Speed',         short:'Output',     desc:'Are they delivering results consistently and fast?' },
  { key:'client_relationship',  label:'Client Relationship',            short:'Client',     desc:'How do clients perceive them? Any friction?' },
  { key:'responsiveness',       label:'Responsiveness & Communication', short:'Response',   desc:'How quickly do they respond and execute?' },
  { key:'cooperation',          label:'Team Cooperation',               short:'Team',       desc:'Do they collaborate well with others?' },
  { key:'initiative',           label:'Initiative & Problem Solving',   short:'Initiative', desc:'Do they take ownership and solve problems proactively?' },
  { key:'consistency',          label:'Consistency & Reliability',      short:'Reliability',desc:'Do they show up and perform at a high level week after week?' },
]

const RISK_COLORS = { Low:'var(--green)', Medium:'var(--amber)', High:'var(--red)', Critical:'#7c3aed' }
const RISK_BG = { Low:'var(--green-dim)', Medium:'var(--amber-dim)', High:'var(--red-dim)', Critical:'rgba(124,58,237,0.12)' }

function getMonday() {
  const d=new Date(),day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1)
  const m=new Date(d);m.setDate(diff);return m.toISOString().split('T')[0]
}
function avg(entry) {
  if (!entry) return 0
  const vals=REVIEW_FIELDS.map(f=>parseFloat(entry[f.key])||0).filter(v=>v>0)
  return vals.length?(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1):0
}
function initials(name) { return name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?' }
function formatPosition(pos) {
  const map={creative_strategist:'Creative Strategist',media_buyer:'Media Buyer',editor:'Editor',designer:'Designer',ugc_manager:'UGC Manager',email_marketer:'Email Marketer',ops_manager:'Ops Manager',ops_assistant:'Ops Assistant',hr_manager:'HR Manager',marketing:'Marketing',management:'Management'}
  return map[pos]||pos||'—'
}

function ReviewModal({ member, existing, onClose, onSave }) {
  const { profile } = useAuth()
  const ws = getMonday()
  const [form, setForm] = useState({
    output_quality:existing?.output_quality||0,
    client_relationship:existing?.client_relationship||0,
    responsiveness:existing?.responsiveness||0,
    cooperation:existing?.cooperation||0,
    initiative:existing?.initiative||0,
    consistency:existing?.consistency||0,
    performance_risk:existing?.performance_risk||'Low',
    notes:existing?.notes||'',
    actions:existing?.actions||'',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('team_reviews').upsert({
      reviewee_id:member.id, week_start:ws, ...form,
      reviewed_by:profile?.id, updated_at:new Date().toISOString()
    }, { onConflict:'reviewee_id,week_start' })
    onSave(); setSaving(false); onClose()
  }

  const score = avg(form)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:540}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="modal-title" style={{marginBottom:2}}>{member.full_name}</h2>
            <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{formatPosition(member.position)} · Week of {ws}</p>
          </div>
          {score>0&&<div style={{textAlign:'right'}}>
            <div style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:700,letterSpacing:'-0.03em',color:score>=4?'var(--green)':score>=3?'var(--amber)':'var(--red)'}}>{score}</div>
            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>avg score</div>
          </div>}
        </div>

        <div style={{marginBottom:20}}>
          {REVIEW_FIELDS.map(f=>(
            <div key={f.key} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <label style={{margin:0}}>{f.label}</label>
                <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{f.desc}</span>
              </div>
              <div style={{display:'flex',gap:8}}>
                {[1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>setForm({...form,[f.key]:n})}
                    style={{flex:1,padding:'9px 0',borderRadius:'var(--radius)',border:`2px solid ${form[f.key]===n?'var(--accent)':'var(--border)'}`,background:form[f.key]===n?'var(--accent-dim)':'var(--bg-input)',color:form[f.key]===n?'var(--accent)':'var(--text-secondary)',fontFamily:'var(--font-display)',fontWeight:700,fontSize:14,cursor:'pointer',transition:'all 0.15s'}}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label>Performance Risk</label>
          <div style={{display:'flex',gap:8}}>
            {['Low','Medium','High','Critical'].map(r=>(
              <button key={r} onClick={()=>setForm({...form,performance_risk:r})}
                style={{flex:1,padding:'8px 4px',borderRadius:'var(--radius)',border:`2px solid ${form.performance_risk===r?RISK_COLORS[r]:'var(--border)'}`,background:form.performance_risk===r?RISK_BG[r]:'var(--bg-input)',color:form.performance_risk===r?RISK_COLORS[r]:'var(--text-secondary)',fontSize:11,fontWeight:600,cursor:'pointer',transition:'all 0.15s',fontFamily:'var(--font-mono)'}}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Observations & Notes</label>
          <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2} placeholder="What's going well? What needs attention?" style={{resize:'vertical'}}/>
        </div>

        <div className="form-group">
          <label>Actions / Next Steps</label>
          <textarea value={form.actions} onChange={e=>setForm({...form,actions:e.target.value})} rows={2} placeholder="What will you do about it this week?" style={{resize:'vertical'}}/>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':'Save Review'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function MemberCard({ member, latestReview, history }) {
  const [expanded, setExpanded] = useState(false)
  const [editReview, setEditReview] = useState(false)
  const [reviews, setReviews] = useState(history||[])
  const score = parseFloat(avg(latestReview))
  const prevScore = parseFloat(avg(history?.[1]))
  const trend = history?.length>1 ? score-prevScore : null
  const risk = latestReview?.performance_risk||null
  const chartData = reviews.slice().reverse().map(r=>({week:r.week_start?.slice(5),score:parseFloat(avg(r))}))
  const radarData = REVIEW_FIELDS.map(f=>({subject:f.short,value:parseFloat(latestReview?.[f.key])||0,fullMark:5}))

  async function afterSave() {
    const {data}=await supabase.from('team_reviews').select('*').eq('reviewee_id',member.id).order('week_start',{ascending:false})
    setReviews(data||[])
    setEditReview(false)
  }

  return (
    <div className="card" style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'14px 16px',borderLeft:`4px solid ${risk?RISK_COLORS[risk]:'var(--border)'}`,cursor:'pointer'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          <div className="flex items-center gap-3">
            <div className="user-avatar" style={{width:36,height:36,fontSize:13}}>
              {member.avatar_url?<img src={member.avatar_url} alt=""/>:initials(member.full_name)}
            </div>
            <div>
              <div style={{fontFamily:'var(--font-display)',fontWeight:600,fontSize:14}}>{member.full_name}</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>{formatPosition(member.position)}</div>
            </div>
          </div>
          <div className="flex items-center gap-3" style={{flexShrink:0}}>
            {risk&&<span style={{padding:'3px 10px',borderRadius:100,fontSize:11,fontWeight:600,background:RISK_BG[risk],color:RISK_COLORS[risk],fontFamily:'var(--font-mono)'}}>{risk}</span>}
            {latestReview?(
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:22,fontWeight:700,letterSpacing:'-0.03em',color:score>=4?'var(--green)':score>=3?'var(--amber)':'var(--red)'}}>{score}</div>
                {trend!==null&&<div style={{fontSize:10,color:trend>0?'var(--green)':trend<0?'var(--red)':'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:2}}>
                  {trend>0?<TrendingUp size={10}/>:trend<0?<TrendingDown size={10}/>:<Minus size={10}/>}
                  {trend>0?'+':''}{trend.toFixed(1)}
                </div>}
              </div>
            ):<span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>No review</span>}
            <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();setEditReview(true)}}>
              {latestReview?.week_start===getMonday()?'Update':'Review'}
            </button>
            {expanded?<ChevronUp size={15} color="var(--text-muted)"/>:<ChevronDown size={15} color="var(--text-muted)"/>}
          </div>
        </div>
        {latestReview&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,marginTop:12}}>
            {REVIEW_FIELDS.map(f=>(
              <div key={f.key}>
                <div style={{fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:4,textTransform:'uppercase',letterSpacing:0.5}}>{f.short}</div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{flex:1,height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
                    <div style={{width:`${((parseFloat(latestReview[f.key])||0)/5)*100}%`,height:'100%',background:latestReview[f.key]>=4?'var(--green)':latestReview[f.key]>=3?'var(--amber)':'var(--red)',borderRadius:2}}/>
                  </div>
                  <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-secondary)'}}>{latestReview[f.key]||'—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {expanded&&latestReview&&(
        <div style={{padding:'16px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:16,marginBottom:14}}>
            <div>
              <div className="card-label mb-2">Performance Trend</div>
              {chartData?.length>1?(
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="week" tick={{fill:'#3d526e',fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis domain={[0,5]} tick={{fill:'#3d526e',fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:'#0e1420',border:'1px solid #1e2d47',borderRadius:8,fontSize:11}}/>
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{fill:'#3b82f6',r:3}}/>
                  </LineChart>
                </ResponsiveContainer>
              ):<p className="text-muted text-sm">Review weekly to see trend.</p>}
            </div>
            <div>
              <div className="card-label mb-2">Breakdown</div>
              <ResponsiveContainer width="100%" height={120}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)"/>
                  <PolarAngleAxis dataKey="subject" tick={{fill:'#7a8ba8',fontSize:9}}/>
                  <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {latestReview.notes&&<div style={{marginBottom:10}}><div className="card-label mb-1">Notes</div><p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5}}>{latestReview.notes}</p></div>}
          {latestReview.actions&&<div><div className="card-label mb-1">Actions</div><p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5}}>{latestReview.actions}</p></div>}
        </div>
      )}

      {editReview&&<ReviewModal member={member} existing={reviews[0]?.week_start===getMonday()?reviews[0]:null} onClose={()=>setEditReview(false)} onSave={afterSave}/>}
    </div>
  )
}

export default function TeamHealth() {
  const { isManagement } = useAuth()
  const [members, setMembers] = useState([])
  const [reviews, setReviews] = useState({})
  const [loading, setLoading] = useState(true)
  const [riskFilter, setRiskFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')

  useEffect(()=>{load()},[])

  async function load() {
    setLoading(true)
    const {data:memberData}=await supabase.from('profiles').select('*').eq('role','athlete').order('full_name')
    setMembers(memberData||[])
    if (memberData?.length) {
      const {data:reviewData}=await supabase.from('team_reviews').select('*').in('reviewee_id',memberData.map(m=>m.id)).order('week_start',{ascending:false})
      const map={}; reviewData?.forEach(r=>{if(!map[r.reviewee_id])map[r.reviewee_id]=[];map[r.reviewee_id].push(r)})
      setReviews(map)
    }
    setLoading(false)
  }

  if (!isManagement) return <div className="page-body" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}><p className="text-muted">Management access only.</p></div>

  const withReviews=members.filter(m=>reviews[m.id]?.length>0)
  const highRisk=withReviews.filter(m=>['High','Critical'].includes(reviews[m.id]?.[0]?.performance_risk)).length
  const avgScore=withReviews.length?(withReviews.reduce((s,m)=>s+parseFloat(avg(reviews[m.id]?.[0])),0)/withReviews.length).toFixed(1):'—'

  const RISK_ORDER={Critical:0,High:1,Medium:2,Low:3}
  let filtered=members.filter(m=>{
    if (riskFilter!=='all'&&(reviews[m.id]?.[0]?.performance_risk||'Low')!==riskFilter) return false
    if (deptFilter!=='all'&&m.department!==deptFilter) return false
    return true
  }).sort((a,b)=>{
    const ra=RISK_ORDER[reviews[a.id]?.[0]?.performance_risk]??3
    const rb=RISK_ORDER[reviews[b.id]?.[0]?.performance_risk]??3
    return ra-rb
  })

  const depts=[...new Set(members.map(m=>m.department).filter(Boolean))]

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Team Health</h1><p className="page-subtitle">Weekly performance reviews — management only</p></div>
      </div>
      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">Team Members</div><div className="stat-box-value">{members.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Avg Score</div><div className="stat-box-value text-accent">{avgScore}</div></div>
          <div className="stat-box"><div className="stat-box-label">High Risk</div><div className="stat-box-value text-red">{highRisk}</div></div>
          <div className="stat-box"><div className="stat-box-label">Reviewed</div><div className="stat-box-value">{withReviews.length}/{members.length}</div></div>
        </div>

        <div className="flex gap-3 mb-4" style={{flexWrap:'wrap'}}>
          <div className="tabs" style={{border:'none',marginBottom:0}}>
            {['all','Low','Medium','High','Critical'].map(r=>(
              <button key={r} className={`tab ${riskFilter===r?'active':''}`} onClick={()=>setRiskFilter(r)}
                style={{color:riskFilter===r&&r!=='all'?RISK_COLORS[r]:undefined}}>{r==='all'?'All Risk':r}</button>
            ))}
          </div>
          {depts.length>1&&(
            <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} style={{width:'auto',marginLeft:'auto',fontSize:12}}>
              <option value="all">All Departments</option>
              {depts.map(d=><option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
            </select>
          )}
        </div>

        {loading?<div className="loading-screen" style={{minHeight:200}}><div className="spinner"/></div>:(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {filtered.map(member=>(
              <MemberCard key={member.id} member={member} latestReview={reviews[member.id]?.[0]} history={reviews[member.id]}/>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
