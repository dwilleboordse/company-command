import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Circle, AlertCircle } from 'lucide-react'
import { today, getMondayStr, getMonday, addDays, parseLocal, fmtDisplay, DAYS, local } from '../lib/dates'

function getKRStatus(current, goal, direction) {
  if (goal==null||current==null) return 'gray'
  const r=direction==='min'?goal/Math.max(current,0.01):current/Math.max(goal,0.01)
  return r>=0.9?'green':r>=0.7?'amber':'red'
}
function getKRProgress(current, goal, direction) {
  if (!goal) return 0
  return Math.min(100,direction==='min'?(goal/Math.max(current,0.01))*100:(current/Math.max(goal,0.01))*100)
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
function currentQuarter() {
  const m=new Date().getMonth()+1,y=new Date().getFullYear()
  return `Q${m<=3?1:m<=6?2:m<=9?3:4}-${y}`
}

export default function Dashboard() {
  const { profile, isCEO, isManagement } = useAuth()
  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [krValues, setKrValues] = useState([])
  const [weekOutcome, setWeekOutcome] = useState(null)
  const [dayEntries, setDayEntries] = useState({})
  const [myClients, setMyClients] = useState([])
  const [spendEntries, setSpendEntries] = useState({})
  const [spendSummary, setSpendSummary] = useState({ totalDDU:0, totalAll:0, avgPct:null, atRisk:0, logged:0, total:0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Safety guard - should not happen with AuthContext but prevents blank screen
  const todayStr = today()
  const weekStartStr = getMondayStr()
  const weekStart = getMonday()
  const weekDays = DAYS.map((_,i)=>addDays(weekStart,i))

  useEffect(()=>{ if (profile?.id) loadData() },[profile?.id])

  async function loadData() {
    if (!profile?.id) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      // OKRs — catch individually so a missing table doesn't kill the whole dashboard
      try {
        const objQ = supabase.from('objectives').select('*').eq('is_active',true).eq('quarter',currentQuarter())
        const {data:objData} = profile.position && !isManagement
          ? await objQ.eq('role_type',profile.position)
          : await objQ
        setObjectives(objData||[])

        if (objData?.length) {
          const {data:krData}=await supabase.from('key_results').select('*').in('objective_id',objData.map(o=>o.id)).eq('is_active',true)
          setKeyResults(krData||[])
          if (krData?.length) {
            const {data:vals}=await supabase.from('kr_values').select('*')
              .in('key_result_id',krData.map(k=>k.id))
              .eq('user_id',profile.id)
              .order('week_start',{ascending:false})
            setKrValues(vals||[])
          }
        }
      } catch(e) {
        console.warn('OKR tables not ready:', e.message)
        setObjectives([]); setKeyResults([]); setKrValues([])
      }

      // Week outcome
      try {
        const {data:wo}=await supabase.from('week_outcomes').select('*').eq('user_id',profile.id).eq('week_start',weekStartStr).single()
        setWeekOutcome(wo)
      } catch(e) { setWeekOutcome(null) }

      // Day entries
      try {
        const {data:days}=await supabase.from('day_entries').select('*').eq('user_id',profile.id)
          .gte('entry_date',weekStartStr).lte('entry_date',todayStr)
        const map={}; days?.forEach(d=>{map[d.entry_date]=d}); setDayEntries(map)
      } catch(e) { setDayEntries({}) }

      // Spend
      try {
        let clientQ = supabase.from('clients').select('id,name,cs_ids,mb_ids,editor_ids,designer_ids,ugc_ids,assigned_cs_id')
          .eq('is_active',true).eq('is_archived',false).order('name')
        if (!isManagement && profile?.id) {
          clientQ = clientQ.contains('cs_ids', [profile.id])
        }
        const {data:allClients}=await clientQ
        // Server already filtered by assignment — just use what came back
      const relevantClients = allClients||[]
        setMyClients(relevantClients)

        if (relevantClients.length) {
          const {data:spendData}=await supabase.from('spend_entries').select('*')
            .in('client_id',relevantClients.map(c=>c.id))
            .eq('week_start',weekStartStr)
          const map2={}; spendData?.forEach(e=>{map2[e.client_id]=e})
          setSpendEntries(map2)
          const withData=(spendData||[]).filter(e=>e.total_spend>0)
          setSpendSummary({
            totalDDU:(spendData||[]).reduce((s,e)=>s+(e.ddu_spend||0),0),
            totalAll:(spendData||[]).reduce((s,e)=>s+(e.total_spend||0),0),
            avgPct:withData.length?(withData.reduce((s,e)=>s+(e.ddu_spend/e.total_spend)*100,0)/withData.length).toFixed(1):null,
            atRisk:withData.filter(e=>(e.ddu_spend/e.total_spend)<0.2).length,
            logged:spendData?.length||0, total:relevantClients.length
          })
        }
      } catch(e) { console.warn('Spend load failed:', e.message) }

    } catch(e) {
      console.error('Dashboard load error:', e)
      setError('Something went wrong loading your dashboard. Refresh to try again.')
    } finally {
      setLoading(false)
    }
  }

  async function toggleTaskDone(dateStr,entry) {
    try {
      const updated={...entry,day_outcome_done:!entry.day_outcome_done,updated_at:new Date().toISOString()}
      await supabase.from('day_entries').upsert({user_id:profile.id,entry_date:dateStr,...updated},{onConflict:'user_id,entry_date'})
      setDayEntries(prev=>({...prev,[dateStr]:updated}))
    } catch(e) { console.error(e) }
  }
  async function toggleOutcomeDone(i) {
    if (!weekOutcome) return
    try {
      const done=weekOutcome.outcomes_done||[]
      const updated=done.includes(i)?done.filter(x=>x!==i):[...done,i]
      await supabase.from('week_outcomes').update({outcomes_done:updated}).eq('id',weekOutcome.id)
      setWeekOutcome(prev=>({...prev,outcomes_done:updated}))
    } catch(e) { console.error(e) }
  }

  const myKRs = keyResults.map(kr=>{
    const vals=krValues.filter(v=>v.key_result_id===kr.id)
    const thisWeek=vals.find(v=>v.week_start===weekStartStr)
    const current=thisWeek?.value??null
    const obj=objectives.find(o=>o.id===kr.objective_id)
    return {...kr,current,objective_title:obj?.title}
  })

  const onTrack=myKRs.filter(k=>getKRStatus(k.current,k.goal_value,k.goal_direction)==='green').length
  const behind=myKRs.filter(k=>getKRStatus(k.current,k.goal_value,k.goal_direction)==='red').length
  const spendStatus=spendSummary.avgPct!==null?getSpendStatus(parseFloat(spendSummary.avgPct)):null

  if (loading) return <div className="loading-screen"><div className="spinner"/></div>

  if (error) return (
    <div className="page-body" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'60vh',gap:16}}>
      <AlertCircle size={40} color="var(--red)"/>
      <p style={{color:'var(--text-secondary)',fontSize:14}}>{error}</p>
      <button className="btn btn-primary" onClick={loadData}>Retry</button>
    </div>
  )

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
          <div className="stat-box"><div className="stat-box-label">KRs On Track</div><div className="stat-box-value text-green">{onTrack}</div></div>
          <div className="stat-box"><div className="stat-box-label">KRs Behind</div><div className="stat-box-value text-red">{behind}</div></div>
          <div className="stat-box"><div className="stat-box-label">Total KRs</div><div className="stat-box-value text-accent">{myKRs.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Week Outcome</div><div className="stat-box-value" style={{fontSize:18,paddingTop:4}}>{weekOutcome?.outcomes?.length>0?<span className="text-green">Set ✓</span>:<span className="text-muted">—</span>}</div></div>
        </div>

        {/* Weekly to-do grid */}
        <div className="section-header">
          <span className="section-title">This Week</span>
          <Link to="/calendar" className="btn btn-ghost btn-sm">Calendar <ArrowRight size={13}/></Link>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:24}}>
          {weekDays.map((day,i)=>{
            const dateStr=local(day)
            const entry=dayEntries[dateStr],isToday=dateStr===todayStr,isPast=dateStr<todayStr
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
            {/* OKR Snapshot */}
            <div className="section-header">
              <span className="section-title">My OKRs — {currentQuarter()}</span>
              <Link to="/okrs" className="btn btn-ghost btn-sm">All OKRs <ArrowRight size={13}/></Link>
            </div>
            {myKRs.length===0?(
              <div className="card mb-4" style={{padding:16}}>
                <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>No key results assigned yet for {currentQuarter()}.</p>
                <Link to="/okrs" className="btn btn-ghost btn-sm">Go to OKRs →</Link>
              </div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
                {myKRs.map(kr=>{
                  const status=getKRStatus(kr.current,kr.goal_value,kr.goal_direction)
                  const progress=getKRProgress(kr.current,kr.goal_value,kr.goal_direction)
                  return (
                    <div key={kr.id} className={`kpi-card ${status}`}>
                      <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{kr.objective_title}</div>
                      <div className="flex items-center justify-between" style={{gap:8}}>
                        <span style={{fontSize:12,color:'var(--text-secondary)',flex:1,lineHeight:1.3}}>{kr.metric_name}</span>
                        <div className="flex items-center gap-2" style={{flexShrink:0}}>
                          <span style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:700,letterSpacing:'-0.03em',color:status==='green'?'var(--green)':status==='red'?'var(--red)':status==='amber'?'var(--amber)':'var(--text-muted)'}}>
                            {kr.current!==null?`${kr.current}${kr.unit}`:'—'}
                          </span>
                          <span className={`badge ${status}`} style={{fontSize:9}}>
                            {kr.goal_direction==='min'?'≤':'≥'}{kr.goal_value}{kr.unit}
                          </span>
                        </div>
                      </div>
                      <div className="progress-bar-wrap" style={{marginTop:8}}>
                        <div className={`progress-bar-fill ${status}`} style={{width:`${progress}%`}}/>
                      </div>
                      {kr.current===null&&(
                        <Link to="/okrs" style={{fontSize:11,color:'var(--accent)',textDecoration:'none',display:'block',marginTop:6}}>
                          + Log this week →
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Spend Tracker */}
            {myClients.length>0&&(
              <>
                <div className="section-header">
                  <span className="section-title">{profile.position==='creative_strategist'?'My Client Spend':'Spend — This Week'}</span>
                  <Link to="/spend" className="btn btn-ghost btn-sm">Details <ArrowRight size={13}/></Link>
                </div>
                <div className="card mb-3" style={{borderLeft:`3px solid ${spendStatus?.color||'var(--border)'}`,padding:'12px 16px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:spendSummary.avgPct?10:0}}>
                    <div><div className="card-label">DDU Spend</div><div style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:700,color:'var(--accent)'}}>{fmtMoney(spendSummary.totalDDU)}</div></div>
                    <div><div className="card-label">Total Spend</div><div style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:700}}>{fmtMoney(spendSummary.totalAll)}</div></div>
                    <div><div className="card-label">Avg DDU %</div><div style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:700,color:spendStatus?.color||'var(--text-muted)'}}>{spendSummary.avgPct!==null?`${spendSummary.avgPct}%`:'—'}</div></div>
                  </div>
                  {spendSummary.avgPct&&(
                    <div style={{height:5,background:'var(--border)',borderRadius:3,overflow:'hidden',position:'relative'}}>
                      <div style={{position:'absolute',left:'20%',top:0,bottom:0,width:1,background:'rgba(245,158,11,0.4)'}}/>
                      <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'rgba(34,197,94,0.4)'}}/>
                      <div style={{width:`${Math.min(100,spendSummary.avgPct)}%`,height:'100%',background:spendStatus?.color,borderRadius:3}}/>
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:5,fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>
                    <span>{spendSummary.logged}/{spendSummary.total} logged</span>
                    {spendSummary.atRisk>0&&<span style={{color:'var(--red)'}}>{spendSummary.atRisk} at risk</span>}
                    {spendStatus&&<span style={{color:spendStatus.color}}>{spendStatus.label}</span>}
                  </div>
                </div>
                <div className="card" style={{padding:0,overflow:'hidden'}}>
                  {myClients.slice(0,8).map((client,i)=>{
                    const e=spendEntries[client.id]
                    const pct=e?.total_spend>0?((e.ddu_spend/e.total_spend)*100).toFixed(1):null
                    const s=pct!==null?getSpendStatus(parseFloat(pct)):null
                    return (
                      <div key={client.id} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 14px',borderBottom:i<Math.min(myClients.length,8)-1?'1px solid var(--border)':'none'}}>
                        <span style={{fontSize:13,flex:1,fontWeight:500}}>{client.name}</span>
                        {e?(
                          <>
                            <div style={{flex:1,minWidth:60}}>
                              <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden',position:'relative'}}>
                                <div style={{position:'absolute',left:'20%',top:0,bottom:0,width:1,background:'rgba(245,158,11,0.3)'}}/>
                                <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'rgba(34,197,94,0.3)'}}/>
                                <div style={{width:`${Math.min(100,parseFloat(pct)||0)}%`,height:'100%',background:s?.color,borderRadius:2}}/>
                              </div>
                            </div>
                            <span style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:700,color:s?.color,minWidth:44,textAlign:'right'}}>{pct}%</span>
                            <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:s?.color,background:s?.bg,padding:'1px 6px',borderRadius:100,flexShrink:0}}>{s?.label}</span>
                          </>
                        ):(
                          <span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>Not logged</span>
                        )}
                      </div>
                    )
                  })}
                  {myClients.length>8&&(
                    <div style={{padding:'9px 14px',borderTop:'1px solid var(--border)'}}>
                      <Link to="/spend" style={{fontSize:11,color:'var(--accent)',textDecoration:'none'}}>View all {myClients.length} clients →</Link>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right column */}
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
              <span className="section-title">Quick Links</span>
            </div>
            <div className="card" style={{display:'flex',flexDirection:'column',gap:8}}>
              {[
                {to:'/okrs', label:'OKRs & Key Results'},
                {to:'/spend', label:'Spend Tracker'},
                {to:'/changelog', label:'Change Log'},
                {to:'/meetings', label:'Meetings'},
                {to:'/rewards', label:'Rewards & Badges'},
              ].map(l=>(
                <Link key={l.to} to={l.to} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',textDecoration:'none',color:'var(--text-primary)',fontSize:13}}>
                  {l.label} <ArrowRight size={13} color="var(--text-muted)"/>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
