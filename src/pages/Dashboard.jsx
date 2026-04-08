import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { today, getMondayStr, getMonday, addDays, parseLocal, fmtDisplay, DAYS } from '../lib/dates'

function getStatus(kpi) {
  if (!kpi.goal_value) return 'gray'
  const r = kpi.goal_direction==='min' ? kpi.goal_value/Math.max(kpi.current_value,0.01) : kpi.current_value/Math.max(kpi.goal_value,0.01)
  return r>=0.9?'green':r>=0.7?'amber':'red'
}
function getProgress(kpi) {
  if (!kpi.goal_value) return 0
  return Math.min(100, kpi.goal_direction==='min' ? (kpi.goal_value/Math.max(kpi.current_value,0.01))*100 : (kpi.current_value/Math.max(kpi.goal_value,0.01))*100)
}
function getSpendStatus(pct) {
  if (pct>=50) return {label:'Excellent',color:'var(--green)',bg:'var(--green-dim)'}
  if (pct>=20) return {label:'Healthy',color:'var(--amber)',bg:'var(--amber-dim)'}
  return {label:'At Risk',color:'var(--red)',bg:'var(--red-dim)'}
}
function fmtMoney(n) {
  if (!n) return '—'
  if (n>=1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n>=1000) return `$${(n/1000).toFixed(1)}K`
  return `$${Number(n).toLocaleString()}`
}

function getGreeting() {
  const h=new Date().getHours()
  return h<12?'Morning':h<17?'Afternoon':'Evening'
}
function formatPosition(pos) {
  const map={creative_strategist:'Creative Strategist',media_buyer:'Media Buyer',editor:'Editor',designer:'Designer',ugc_manager:'UGC Manager',email_marketer:'Email Marketer',ops_manager:'Operations Manager',ops_assistant:'Operations Assistant',hr_manager:'HR Manager',marketing:'Marketing',management:'Management'}
  return map[pos]||pos
}

export default function Dashboard() {
  const { profile, isCEO, isManagement } = useAuth()
  const [kpis, setKpis] = useState([])
  const [milestones, setMilestones] = useState([])
  const [weekOutcome, setWeekOutcome] = useState(null)
  const [dayEntries, setDayEntries] = useState({})
  const [spendData, setSpendData] = useState({ totalDDU:0, totalAll:0, avgPct:null, atRisk:0, logged:0, total:0 })
  const [loading, setLoading] = useState(true)

  const todayStr = today()
  const weekStartStr = getMondayStr()
  const weekStart = getMonday()
  const weekDays = DAYS.map((_,i)=>addDays(weekStart,i))

  useEffect(()=>{loadData()},[profile])

  async function loadData() {
    if (!profile) return
    setLoading(true)

    let kpiQ = supabase.from('kpis').select('*').eq('is_active',true)
    if (!isCEO&&!isManagement) kpiQ=kpiQ.eq('visibility','team')
    else if (!isCEO) kpiQ=kpiQ.in('visibility',['team','management'])
    if (profile.role==='athlete'&&profile.position) kpiQ=kpiQ.eq('role_type',profile.position)
    const {data:kpiData}=await kpiQ.limit(6)
    setKpis(kpiData||[])

    let msQ=supabase.from('milestones').select('*').eq('is_active',true).neq('status','completed')
    if (profile.role==='athlete'&&profile.position) msQ=msQ.eq('role_type',profile.position)
    const {data:msData}=await msQ.limit(5)
    setMilestones(msData||[])

    const {data:wo}=await supabase.from('week_outcomes').select('*').eq('user_id',profile.id).eq('week_start',weekStartStr).single()
    setWeekOutcome(wo)

    const {data:days}=await supabase.from('day_entries').select('*').eq('user_id',profile.id)
      .gte('entry_date',weekStartStr).lte('entry_date',today())
    const map={}; days?.forEach(d=>{map[d.entry_date]=d}); setDayEntries(map)

    // Spend data
    const {data:clients}=await supabase.from('clients').select('id').eq('is_active',true)
    if (clients?.length) {
      const {data:entries}=await supabase.from('spend_entries').select('*')
        .in('client_id',clients.map(c=>c.id)).eq('week_start',weekStartStr)
      const e=entries||[]
      const totalDDU=e.reduce((s,x)=>s+(x.ddu_spend||0),0)
      const totalAll=e.reduce((s,x)=>s+(x.total_spend||0),0)
      const withData=e.filter(x=>x.total_spend>0)
      const avgPct=withData.length?(withData.reduce((s,x)=>s+(x.ddu_spend/x.total_spend)*100,0)/withData.length).toFixed(1):null
      const atRisk=withData.filter(x=>(x.ddu_spend/x.total_spend)<0.2).length
      setSpendData({totalDDU,totalAll,avgPct,atRisk,logged:e.length,total:clients.length})
    }
    setLoading(false)
  }

  async function toggleTaskDone(dateStr,entry) {
    const updated={...entry,day_outcome_done:!entry.day_outcome_done,updated_at:new Date().toISOString()}
    await supabase.from('day_entries').upsert({user_id:profile.id,entry_date:dateStr,...updated},{onConflict:'user_id,entry_date'})
    setDayEntries(prev=>({...prev,[dateStr]:updated}))
  }
  async function toggleOutcomeDone(i) {
    if (!weekOutcome) return
    const done=weekOutcome.outcomes_done||[]
    const updated=done.includes(i)?done.filter(x=>x!==i):[...done,i]
    await supabase.from('week_outcomes').update({outcomes_done:updated}).eq('id',weekOutcome.id)
    setWeekOutcome(prev=>({...prev,outcomes_done:updated}))
  }

  const onTarget=kpis.filter(k=>getStatus(k)==='green').length
  const offTarget=kpis.filter(k=>getStatus(k)==='red').length
  const statusLabel={not_started:'Not Started',started:'Started',half:'50%',three_quarters:'75%',completed:'Done'}

  if (loading) return <div className="loading-screen"><div className="spinner"/></div>

  const spendStatus = spendData.avgPct!==null ? getSpendStatus(parseFloat(spendData.avgPct)) : null

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          <div>
            <h1 className="page-title">{getGreeting()}, {profile?.full_name?.split(' ')[0]}.</h1>
            <p className="page-subtitle">
              {parseLocal(todayStr).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
              {profile?.position&&<> · <span className="text-accent">{formatPosition(profile.position)}</span></>}
            </p>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">KPIs On Target</div><div className="stat-box-value text-green">{onTarget}</div></div>
          <div className="stat-box"><div className="stat-box-label">KPIs Off Target</div><div className="stat-box-value text-red">{offTarget}</div></div>
          <div className="stat-box"><div className="stat-box-label">Open Milestones</div><div className="stat-box-value text-accent">{milestones.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Week Outcome</div><div className="stat-box-value" style={{fontSize:18,paddingTop:4}}>{weekOutcome?.outcomes?.length>0?<span className="text-green">Set ✓</span>:<span className="text-muted">—</span>}</div></div>
        </div>

        {/* Weekly to-do grid */}
        <div className="section-header">
          <span className="section-title">This Week</span>
          <Link to="/calendar" className="btn btn-ghost btn-sm">Calendar <ArrowRight size={13}/></Link>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:24}}>
          {weekDays.map((day,i)=>{
            const dateStr=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
            const entry=dayEntries[dateStr], isToday=dateStr===todayStr, isPast=dateStr<todayStr
            return (
              <div key={i} className="card" style={{padding:12,borderColor:isToday?'var(--accent)':'var(--border)',background:isToday?'rgba(59,130,246,0.04)':'var(--bg-card)'}}>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:600,color:isToday?'var(--accent)':'var(--text-secondary)'}}>{DAYS[i].slice(0,3)}</div>
                  <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{fmtDisplay(day)}</div>
                </div>
                {entry?.day_outcome?(
                  <div className="checkbox-item" onClick={()=>toggleTaskDone(dateStr,entry)}>
                    {entry.day_outcome_done?<CheckCircle2 size={14} color="var(--green)"/>:<Circle size={14} color="var(--text-muted)"/>}
                    <span className={`text-sm ${entry.day_outcome_done?'strikethrough':''}`} style={{lineHeight:1.3}}>{entry.day_outcome}</span>
                  </div>
                ):(
                  <Link to="/calendar" style={{textDecoration:'none'}}>
                    <span style={{fontSize:11,color:'var(--text-muted)'}}>{isToday?'Log today →':isPast?'No entry':'Plan →'}</span>
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:20}}>
          <div>
            <div className="section-header">
              <span className="section-title">KPI Snapshot</span>
              <Link to="/kpis" className="btn btn-ghost btn-sm">All <ArrowRight size={13}/></Link>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {kpis.length===0?<div className="card empty-state"><p>No KPIs assigned.</p></div>:kpis.map(kpi=>{
                const status=getStatus(kpi),progress=getProgress(kpi)
                return (
                  <div key={kpi.id} className={`kpi-card ${status}`}>
                    <div className="flex items-center justify-between" style={{gap:8}}>
                      <span style={{fontSize:12,color:'var(--text-secondary)',flex:1,lineHeight:1.3}}>{kpi.metric_name}</span>
                      <div className="flex items-center gap-2" style={{flexShrink:0}}>
                        <span style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:700,letterSpacing:'-0.03em'}} className={status!=='gray'?`text-${status}`:'text-secondary'}>
                          {kpi.unit==='$'?'$':''}{kpi.current_value}{kpi.unit!=='$'?kpi.unit:''}
                        </span>
                        <span className={`badge ${status}`} style={{fontSize:9}}>{kpi.goal_direction==='min'?'≤':'≥'}{kpi.unit==='$'?'$':''}{kpi.goal_value}{kpi.unit!=='$'?kpi.unit:''}</span>
                      </div>
                    </div>
                    <div className="progress-bar-wrap" style={{marginTop:8}}>
                      <div className={`progress-bar-fill ${status}`} style={{width:`${progress}%`}}/>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Spend Tracker Summary */}
            <div className="section-header mt-6">
              <span className="section-title">Spend — This Week</span>
              <Link to="/spend" className="btn btn-ghost btn-sm">Details <ArrowRight size={13}/></Link>
            </div>
            <div className="card" style={{borderLeft:`3px solid ${spendStatus?.color||'var(--border)'}`}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:spendData.avgPct?12:0}}>
                <div>
                  <div className="card-label">DDU Spend</div>
                  <div style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:700,letterSpacing:'-0.03em',color:'var(--accent)'}}>{fmtMoney(spendData.totalDDU)}</div>
                </div>
                <div>
                  <div className="card-label">Total Spend</div>
                  <div style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:700,letterSpacing:'-0.03em'}}>{fmtMoney(spendData.totalAll)}</div>
                </div>
                <div>
                  <div className="card-label">Avg DDU %</div>
                  <div style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:700,letterSpacing:'-0.03em',color:spendStatus?.color||'var(--text-muted)'}}>
                    {spendData.avgPct!==null?`${spendData.avgPct}%`:'—'}
                  </div>
                </div>
              </div>
              {spendData.avgPct && (
                <div style={{height:6,background:'var(--border)',borderRadius:3,overflow:'hidden',position:'relative'}}>
                  <div style={{position:'absolute',left:'20%',top:0,bottom:0,width:1,background:'rgba(245,158,11,0.4)'}}/>
                  <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'rgba(34,197,94,0.4)'}}/>
                  <div style={{width:`${Math.min(100,spendData.avgPct)}%`,height:'100%',background:spendStatus?.color,borderRadius:3}}/>
                </div>
              )}
              <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>
                <span>{spendData.logged}/{spendData.total} logged</span>
                {spendData.atRisk>0&&<span style={{color:'var(--red)'}}>{spendData.atRisk} at risk</span>}
                {spendStatus&&<span style={{color:spendStatus.color}}>{spendStatus.label}</span>}
              </div>
            </div>
          </div>

          <div>
            <div className="section-header">
              <span className="section-title">Week Outcomes</span>
              <Link to="/calendar" className="btn btn-ghost btn-sm">Update <ArrowRight size={13}/></Link>
            </div>
            <div className="card mb-4">
              {weekOutcome?.outcomes?.length>0?(
                weekOutcome.outcomes.map((o,i)=>{
                  const done=weekOutcome.outcomes_done?.includes(i)
                  return (
                    <div key={i} className="checkbox-item" style={{borderBottom:'1px solid var(--border)',paddingBottom:8,marginBottom:4}} onClick={()=>toggleOutcomeDone(i)}>
                      {done?<CheckCircle2 size={14} color="var(--green)"/>:<Circle size={14} color="var(--text-muted)"/>}
                      <span className={`text-sm ${done?'strikethrough':''}`}>{o}</span>
                    </div>
                  )
                })
              ):(
                <div className="empty-state" style={{padding:'16px 0'}}>
                  <p>No week outcome set.</p>
                  <Link to="/calendar" className="btn btn-primary btn-sm" style={{marginTop:10}}>Set Week Outcome</Link>
                </div>
              )}
            </div>

            <div className="section-header">
              <span className="section-title">Open Milestones</span>
              <Link to="/milestones" className="btn btn-ghost btn-sm">All <ArrowRight size={13}/></Link>
            </div>
            <div className="card">
              {milestones.length===0?<p className="text-muted text-sm">No open milestones.</p>:milestones.map(ms=>(
                <div key={ms.id} className="flex items-center gap-3" style={{padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
                  <div className={`ms-dot ${ms.status}`}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:500}}>{ms.milestone_name}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{ms.system_name}</div>
                  </div>
                  <span className={`badge ${ms.status==='completed'?'green':ms.status==='not_started'?'gray':'amber'}`}>{statusLabel[ms.status]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
