import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { TrendingUp, TrendingDown, Users, DollarSign, Target, AlertTriangle, Activity, Download } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from 'recharts'

// ── helpers ──
function fmtMoney(n) {
  if (!n && n!==0) return '$0'
  if (n>=1000000) return '$'+(n/1000000).toFixed(1)+'M'
  if (n>=1000) return '$'+(n/1000).toFixed(1)+'k'
  return '$'+Math.round(n)
}
function pct(num,den) { return den>0 ? Math.round((num/den)*100) : 0 }
function weekStartStr(d=new Date()) {
  const x=new Date(d); const day=x.getDay(); const diff=day===0?-6:1-day
  x.setDate(x.getDate()+diff); return x.toISOString().split('T')[0]
}
function lastNWeeks(n) {
  const weeks=[]; const now=new Date()
  for (let i=n-1;i>=0;i--) {
    const d=new Date(now); d.setDate(d.getDate()-i*7)
    weeks.push(weekStartStr(d))
  }
  return weeks
}
const PLATFORM_COLORS = {
  meta:'#1877f2', tiktok:'#f43f5e', applovin:'#8b5cf6', google:'#34a853', other:'#64748b'
}
const RISK_COLORS = { Low:'#16a34a', Medium:'#d97706', High:'#dc2626', Critical:'#7c1d1d' }

// ── mini metric card with sparkline ──
function MetricCard({ label, value, sub, trend, trendData, color='var(--text-primary)', icon }) {
  const trendUp = trend && trend>0
  return (
    <div className="card" style={{padding:'16px 18px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {icon && <span style={{color:'var(--text-muted)'}}>{icon}</span>}
          <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>{label}</span>
        </div>
        {trend!=null && (
          <span style={{fontSize:10,fontWeight:700,fontFamily:'var(--font-mono)',color:trendUp?'var(--green)':'var(--red)',display:'flex',alignItems:'center',gap:2}}>
            {trendUp?<TrendingUp size={10}/>:<TrendingDown size={10}/>}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:10}}>
        <div>
          <div style={{fontFamily:'var(--font-display)',fontSize:26,fontWeight:800,letterSpacing:'-0.03em',color,lineHeight:1}}>{value}</div>
          {sub && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,fontFamily:'var(--font-mono)'}}>{sub}</div>}
        </div>
        {trendData && trendData.length>1 && (
          <div style={{width:70,height:32,opacity:0.9}}>
            <ResponsiveContainer>
              <LineChart data={trendData}>
                <Line type="monotone" dataKey="v" stroke={trendUp?'var(--green)':trend<0?'var(--red)':'var(--accent)'} strokeWidth={1.8} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

// ── section wrapper ──
function Section({ title, subtitle, action, children }) {
  return (
    <div style={{marginBottom:28}}>
      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div>
          <h3 style={{fontSize:14,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>{title}</h3>
          {subtitle && <p style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── MAIN ──
export default function Analytics() {
  const { profile, isManagement } = useAuth()
  const [loading,setLoading]=useState(true)
  const [range,setRange]=useState('4w')  // 4w, 12w, q

  // raw data
  const [clients,setClients]=useState([])
  const [spendEntries,setSpendEntries]=useState([])
  const [healthEntries,setHealthEntries]=useState([])
  const [teamReviews,setTeamReviews]=useState([])
  const [profiles,setProfiles]=useState([])
  const [changeLog,setChangeLog]=useState([])
  const [onboardingItems,setOnboardingItems]=useState([])
  const [objectives,setObjectives]=useState([])
  const [keyResults,setKeyResults]=useState([])
  const [milestones,setMilestones]=useState([])

  useEffect(()=>{ load() },[range])

  async function load() {
    setLoading(true)
    const weeks = range==='4w'?4:range==='12w'?12:13
    const weekList = lastNWeeks(weeks)
    const earliestWeek = weekList[0]

    const [c,s,h,t,p,cl,ob,oj,kr,ms]=await Promise.all([
      supabase.from('clients').select('*').eq('is_active',true),
      supabase.from('spend_entries').select('*').gte('week_start',earliestWeek),
      supabase.from('client_health_entries').select('*').gte('week_start',earliestWeek),
      supabase.from('team_reviews').select('*').gte('week_start',earliestWeek),
      supabase.from('profiles').select('id,full_name,role,position').order('full_name'),
      supabase.from('change_log').select('*').gte('week_start',earliestWeek),
      supabase.from('onboarding_checklists').select('*'),
      supabase.from('objectives').select('*').eq('is_active',true),
      supabase.from('key_results').select('*').eq('is_active',true),
      supabase.from('milestones').select('*').eq('is_active',true),
    ])
    setClients(c.data||[])
    setSpendEntries(s.data||[])
    setHealthEntries(h.data||[])
    setTeamReviews(t.data||[])
    setProfiles(p.data||[])
    setChangeLog(cl.data||[])
    setOnboardingItems(ob.data||[])
    setObjectives(oj.data||[])
    setKeyResults(kr.data||[])
    setMilestones(ms.data||[])
    setLoading(false)
  }

  // ── REVENUE & SPEND METRICS ──
  const spendMetrics = useMemo(()=>{
    const weeks = lastNWeeks(range==='4w'?4:range==='12w'?12:13)
    // total spend + DDU spend per week
    const perWeek = weeks.map(w=>{
      const entries = spendEntries.filter(e=>e.week_start===w)
      return {
        week: w.slice(5),
        total: entries.reduce((s,e)=>s+(parseFloat(e.total_spend)||0),0),
        ddu: entries.reduce((s,e)=>s+(parseFloat(e.ddu_spend)||0),0),
      }
    })
    const currTotal = perWeek[perWeek.length-1]?.total||0
    const prevTotal = perWeek[perWeek.length-2]?.total||0
    const currDDU = perWeek[perWeek.length-1]?.ddu||0
    const prevDDU = perWeek[perWeek.length-2]?.ddu||0
    const allTimeTotal = perWeek.reduce((s,w)=>s+w.total,0)
    const allTimeDDU = perWeek.reduce((s,w)=>s+w.ddu,0)
    const avgShare = allTimeTotal>0 ? (allTimeDDU/allTimeTotal)*100 : 0
    return {
      perWeek,
      currTotal, prevTotal,
      currDDU, prevDDU,
      totalTrend: prevTotal>0 ? ((currTotal-prevTotal)/prevTotal)*100 : 0,
      dduTrend: prevDDU>0 ? ((currDDU-prevDDU)/prevDDU)*100 : 0,
      allTimeTotal, allTimeDDU,
      avgShare,
    }
  },[spendEntries, range])

  // ── platform distribution (latest week) ──
  const platformMix = useMemo(()=>{
    const latestWeek = spendMetrics.perWeek[spendMetrics.perWeek.length-1]?.week
    if (!latestWeek) return []
    const full = `2026-${latestWeek}`
    const entries = spendEntries.filter(e=>e.week_start===full || e.week_start.endsWith(latestWeek))
    return [
      {name:'Meta',    value:entries.reduce((s,e)=>s+(e.meta_total_spend||0),0),    color:PLATFORM_COLORS.meta},
      {name:'TikTok',  value:entries.reduce((s,e)=>s+(e.tiktok_total_spend||0),0),  color:PLATFORM_COLORS.tiktok},
      {name:'Google',  value:entries.reduce((s,e)=>s+(e.google_total_spend||0),0),  color:PLATFORM_COLORS.google},
      {name:'AppLovin',value:entries.reduce((s,e)=>s+(e.applovin_total_spend||0),0),color:PLATFORM_COLORS.applovin},
    ].filter(x=>x.value>0)
  },[spendEntries, spendMetrics])

  // ── CLIENT HEALTH ──
  const healthMetrics = useMemo(()=>{
    const latestByClient = {}
    const prevByClient = {}
    // Group health entries by client, sort desc by week
    const byClient = {}
    healthEntries.forEach(e=>{
      if (!byClient[e.client_id]) byClient[e.client_id]=[]
      byClient[e.client_id].push(e)
    })
    Object.entries(byClient).forEach(([cid,arr])=>{
      arr.sort((a,b)=>b.week_start.localeCompare(a.week_start))
      latestByClient[cid]=arr[0]
      prevByClient[cid]=arr[1]
    })
    const scoreOf = (e) => {
      if (!e) return null
      const keys = ['communication','output_quality','strategic_value','trust','growth','responsiveness']
      const vals = keys.map(k=>e[k]).filter(v=>v>0)
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null
    }
    const allScores = clients.map(c=>({
      id:c.id, name:c.name,
      score: scoreOf(latestByClient[c.id]),
      prevScore: scoreOf(prevByClient[c.id]),
      hasData: !!latestByClient[c.id]
    }))
    const withScores = allScores.filter(c=>c.score!==null)
    const avgScore = withScores.length ? withScores.reduce((s,c)=>s+c.score,0)/withScores.length : 0
    const atRisk = withScores.filter(c=>c.score<3).sort((a,b)=>a.score-b.score)
    const trending = withScores
      .filter(c=>c.prevScore!==null)
      .map(c=>({...c,delta:c.score-c.prevScore}))
      .filter(c=>Math.abs(c.delta)>=0.3)
      .sort((a,b)=>a.delta-b.delta)
    return { allScores, avgScore, atRisk, trending, totalTracked: withScores.length, totalClients: clients.length }
  },[clients, healthEntries])

  // ── TEAM HEALTH ──
  const teamMetrics = useMemo(()=>{
    const latestByUser = {}
    const reviewsByUser = {}
    teamReviews.forEach(r=>{
      if (!reviewsByUser[r.user_id]) reviewsByUser[r.user_id]=[]
      reviewsByUser[r.user_id].push(r)
    })
    Object.entries(reviewsByUser).forEach(([uid,arr])=>{
      arr.sort((a,b)=>b.week_start.localeCompare(a.week_start))
      latestByUser[uid]=arr[0]
    })
    const scoreOf = (r) => {
      if (!r) return null
      const keys = ['output_quality','client_relationship','responsiveness','cooperation','initiative','consistency']
      const vals = keys.map(k=>r[k]).filter(v=>v>0)
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null
    }
    const athletes = profiles.filter(p=>p.role==='athlete')
    const scored = athletes.map(a=>({
      ...a,
      score: scoreOf(latestByUser[a.id]),
      risk: latestByUser[a.id]?.performance_risk||'Low',
      hasReview: !!latestByUser[a.id]
    }))
    const withScore = scored.filter(a=>a.score!==null)
    const avg = withScore.length ? withScore.reduce((s,a)=>s+a.score,0)/withScore.length : 0
    const highRisk = scored.filter(a=>['High','Critical'].includes(a.risk))
    const topPerformers = withScore.slice().sort((a,b)=>b.score-a.score).slice(0,5)
    return { scored, avg, highRisk, topPerformers, reviewed: withScore.length, total: athletes.length }
  },[teamReviews, profiles])

  // ── OKR PROGRESS ──
  const okrMetrics = useMemo(()=>{
    const companyObjs = objectives.filter(o=>o.role_type==='company_wide')
    const teamObjs = objectives.filter(o=>o.role_type!=='company_wide')
    const krProgress = (kr) => {
      const inits = milestones.filter(m=>m.key_result_id===kr.id)
      if (!inits.length) return 0
      return (inits.filter(m=>m.status==='completed').length/inits.length)*100
    }
    const objProgress = (obj) => {
      const krs = keyResults.filter(kr=>kr.objective_id===obj.id)
      if (!krs.length) return 0
      return krs.reduce((s,kr)=>s+krProgress(kr),0)/krs.length
    }
    const companyWithProgress = companyObjs.map(o=>({...o, progress:Math.round(objProgress(o))}))
    const byTeam = {}
    teamObjs.forEach(o=>{
      const key = o.role_type||'other'
      if (!byTeam[key]) byTeam[key]={ role:key, objs:[], avgProgress:0 }
      byTeam[key].objs.push({...o, progress:Math.round(objProgress(o))})
    })
    Object.values(byTeam).forEach(t=>{
      t.avgProgress = Math.round(t.objs.reduce((s,o)=>s+o.progress,0)/t.objs.length)
    })
    const overallOKR = companyWithProgress.length
      ? Math.round(companyWithProgress.reduce((s,o)=>s+o.progress,0)/companyWithProgress.length)
      : 0
    return { company:companyWithProgress, byTeam:Object.values(byTeam), overallOKR, totalKRs:keyResults.length, totalInits:milestones.length, doneInits:milestones.filter(m=>m.status==='completed').length }
  },[objectives, keyResults, milestones])

  // ── ACTIVITY VOLUME (change log per week) ──
  const activityByWeek = useMemo(()=>{
    const weeks = lastNWeeks(range==='4w'?4:range==='12w'?12:13)
    return weeks.map(w=>({
      week: w.slice(5),
      entries: changeLog.filter(c=>c.week_start===w).length
    }))
  },[changeLog, range])

  // ── ONBOARDING COMPLETION ──
  const onboardingMetrics = useMemo(()=>{
    const byClient = {}
    onboardingItems.forEach(i=>{
      if (!byClient[i.client_id]) byClient[i.client_id]={total:0,done:0}
      byClient[i.client_id].total++
      if (i.is_done) byClient[i.client_id].done++
    })
    const perClient = clients.map(c=>({
      id:c.id, name:c.name,
      total:byClient[c.id]?.total||0,
      done:byClient[c.id]?.done||0,
      pct: byClient[c.id]?.total ? Math.round((byClient[c.id].done/byClient[c.id].total)*100) : 0
    })).filter(c=>c.total>0)
    const avgCompletion = perClient.length ? perClient.reduce((s,c)=>s+c.pct,0)/perClient.length : 0
    const stuck = perClient.filter(c=>c.pct<50 && c.total>5).sort((a,b)=>a.pct-b.pct)
    return { perClient, avgCompletion, stuck }
  },[onboardingItems, clients])

  if (!isManagement) {
    return <div className="page-body"><div className="empty-state"><p>Analytics is available to management only.</p></div></div>
  }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-subtitle">Real signals from across the agency — updated live</p>
          </div>
          <div style={{display:'flex',border:'1.5px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
            {[{k:'4w',l:'4 weeks'},{k:'12w',l:'12 weeks'},{k:'q',l:'Quarter'}].map(r=>(
              <button key={r.k} onClick={()=>setRange(r.k)}
                style={{padding:'7px 14px',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
                  background:range===r.k?'var(--accent)':'transparent',
                  color:range===r.k?'#fff':'var(--text-secondary)',transition:'all 0.12s'}}>
                {r.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="page-body">
        {loading?(
          <div className="loading-screen" style={{minHeight:300,background:'transparent'}}><div className="spinner"/></div>
        ):(
          <>
            {/* ═══ TOP METRICS ROW ═══ */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,marginBottom:24}}>
              <MetricCard
                label="Total Ad Spend (last week)"
                icon={<DollarSign size={12}/>}
                value={fmtMoney(spendMetrics.currTotal)}
                sub={`${fmtMoney(spendMetrics.allTimeTotal)} across range`}
                trend={spendMetrics.totalTrend}
                trendData={spendMetrics.perWeek.map(w=>({v:w.total}))}
              />
              <MetricCard
                label="DDU Creative Spend"
                icon={<DollarSign size={12}/>}
                value={fmtMoney(spendMetrics.currDDU)}
                sub={`${spendMetrics.avgShare.toFixed(0)}% avg share of total`}
                trend={spendMetrics.dduTrend}
                trendData={spendMetrics.perWeek.map(w=>({v:w.ddu}))}
                color="var(--accent)"
              />
              <MetricCard
                label="Client Health (avg)"
                icon={<Users size={12}/>}
                value={healthMetrics.avgScore.toFixed(1)}
                sub={`${healthMetrics.totalTracked}/${healthMetrics.totalClients} clients reviewed`}
                color={healthMetrics.avgScore>=4?'var(--green)':healthMetrics.avgScore>=3?'var(--amber)':'var(--red)'}
              />
              <MetricCard
                label="Team Health (avg)"
                icon={<Activity size={12}/>}
                value={teamMetrics.avg.toFixed(1)}
                sub={`${teamMetrics.reviewed}/${teamMetrics.total} athletes reviewed`}
                color={teamMetrics.avg>=4?'var(--green)':teamMetrics.avg>=3?'var(--amber)':'var(--red)'}
              />
              <MetricCard
                label="OKR Progress (company)"
                icon={<Target size={12}/>}
                value={`${okrMetrics.overallOKR}%`}
                sub={`${okrMetrics.doneInits}/${okrMetrics.totalInits} initiatives done`}
                color={okrMetrics.overallOKR>=60?'var(--green)':okrMetrics.overallOKR>=30?'var(--amber)':'var(--red)'}
              />
              <MetricCard
                label="Clients At Risk"
                icon={<AlertTriangle size={12}/>}
                value={healthMetrics.atRisk.length}
                sub={healthMetrics.atRisk.length>0?'Needs attention this week':'All clients healthy'}
                color={healthMetrics.atRisk.length>0?'var(--red)':'var(--green)'}
              />
            </div>

            {/* ═══ SPEND TRENDS ═══ */}
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:24}}>
              <div className="card" style={{padding:'16px 18px'}}>
                <Section title="Spend Trend" subtitle="Total ad spend and DDU creative spend over time">
                  <div style={{height:220}}>
                    <ResponsiveContainer>
                      <BarChart data={spendMetrics.perWeek} margin={{top:5,right:5,bottom:0,left:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                        <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={10} tickLine={false}/>
                        <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v=>fmtMoney(v)}/>
                        <Tooltip
                          contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:11}}
                          formatter={v=>fmtMoney(v)}
                        />
                        <Bar dataKey="total" fill="var(--border)" name="Total Spend" radius={[3,3,0,0]}/>
                        <Bar dataKey="ddu" fill="var(--accent)" name="DDU Creative" radius={[3,3,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              </div>
              <div className="card" style={{padding:'16px 18px'}}>
                <Section title="Platform Mix" subtitle="Last week's spend by platform">
                  {platformMix.length===0 ? (
                    <div style={{padding:'40px 0',textAlign:'center',fontSize:12,color:'var(--text-muted)'}}>No spend data logged yet</div>
                  ) : (
                    <div style={{height:220,display:'flex',alignItems:'center'}}>
                      <div style={{flex:1,height:'100%'}}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={platformMix} dataKey="value" innerRadius={45} outerRadius={75} paddingAngle={2}>
                              {platformMix.map((e,i)=><Cell key={i} fill={e.color}/>)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                        {platformMix.map(p=>(
                          <div key={p.name} style={{display:'flex',alignItems:'center',gap:8,fontSize:11}}>
                            <div style={{width:8,height:8,borderRadius:2,background:p.color}}/>
                            <span style={{color:'var(--text-secondary)'}}>{p.name}</span>
                            <span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontWeight:600,color:'var(--text-primary)'}}>{fmtMoney(p.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              </div>
            </div>

            {/* ═══ CLIENT HEALTH ═══ */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>
              <div className="card" style={{padding:'16px 18px'}}>
                <Section title="Clients at Risk" subtitle={`${healthMetrics.atRisk.length} clients scoring below 3.0`}>
                  {healthMetrics.atRisk.length===0 ? (
                    <div style={{padding:'30px 0',textAlign:'center',fontSize:12,color:'var(--green)'}}>All clients healthy — keep it up</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:240,overflowY:'auto'}}>
                      {healthMetrics.atRisk.map(c=>(
                        <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--radius)',borderLeft:`3px solid ${c.score<2?'var(--red)':'var(--amber)'}`}}>
                          <span style={{fontSize:12,fontWeight:500}}>{c.name}</span>
                          <span style={{fontSize:13,fontWeight:700,fontFamily:'var(--font-mono)',color:c.score<2?'var(--red)':'var(--amber)'}}>{c.score.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
              <div className="card" style={{padding:'16px 18px'}}>
                <Section title="Biggest Movers" subtitle="Score changes vs previous review">
                  {healthMetrics.trending.length===0 ? (
                    <div style={{padding:'30px 0',textAlign:'center',fontSize:12,color:'var(--text-muted)'}}>No significant score changes this period</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:240,overflowY:'auto'}}>
                      {healthMetrics.trending.slice(0,8).map(c=>(
                        <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--radius)'}}>
                          <span style={{fontSize:12,fontWeight:500}}>{c.name}</span>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>{c.score.toFixed(1)}</span>
                            <span style={{fontSize:12,fontWeight:700,fontFamily:'var(--font-mono)',color:c.delta>0?'var(--green)':'var(--red)',display:'flex',alignItems:'center',gap:2}}>
                              {c.delta>0?<TrendingUp size={11}/>:<TrendingDown size={11}/>}
                              {c.delta>0?'+':''}{c.delta.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </div>

            {/* ═══ TEAM PERFORMANCE ═══ */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>
              <div className="card" style={{padding:'16px 18px'}}>
                <Section title="Flight Risk" subtitle={`${teamMetrics.highRisk.length} athletes flagged High or Critical`}>
                  {teamMetrics.highRisk.length===0 ? (
                    <div style={{padding:'30px 0',textAlign:'center',fontSize:12,color:'var(--green)'}}>No flight risks flagged</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:240,overflowY:'auto'}}>
                      {teamMetrics.highRisk.map(a=>(
                        <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--radius)',borderLeft:`3px solid ${RISK_COLORS[a.risk]}`}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:500}}>{a.full_name}</div>
                            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{a.position||'—'}</div>
                          </div>
                          <span style={{fontSize:10,fontWeight:700,fontFamily:'var(--font-mono)',color:RISK_COLORS[a.risk],background:`${RISK_COLORS[a.risk]}15`,padding:'3px 8px',borderRadius:100}}>{a.risk}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
              <div className="card" style={{padding:'16px 18px'}}>
                <Section title="Top Performers" subtitle="Highest-rated athletes by latest review">
                  {teamMetrics.topPerformers.length===0 ? (
                    <div style={{padding:'30px 0',textAlign:'center',fontSize:12,color:'var(--text-muted)'}}>No reviews logged yet</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:240,overflowY:'auto'}}>
                      {teamMetrics.topPerformers.map((a,i)=>(
                        <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--radius)'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',width:14}}>#{i+1}</span>
                            <div>
                              <div style={{fontSize:12,fontWeight:500}}>{a.full_name}</div>
                              <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{a.position||'—'}</div>
                            </div>
                          </div>
                          <span style={{fontSize:13,fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--green)'}}>{a.score.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </div>

            {/* ═══ OKR PROGRESS ═══ */}
            <div className="card" style={{padding:'16px 18px',marginBottom:24}}>
              <Section title="OKR Progress by Team" subtitle="Average initiative completion per team">
                {okrMetrics.byTeam.length===0 ? (
                  <div style={{padding:'30px 0',textAlign:'center',fontSize:12,color:'var(--text-muted)'}}>No team objectives this quarter</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {okrMetrics.byTeam.sort((a,b)=>b.avgProgress-a.avgProgress).map(t=>{
                      const color = t.avgProgress>=60?'var(--green)':t.avgProgress>=30?'var(--amber)':'var(--red)'
                      const label = {creative_strategist:'Creative Strategy',media_buyer:'Media Buying',editor:'Video Editing',designer:'Design',ugc_manager:'UGC',ops_manager:'Operations',management:'Management'}[t.role]||t.role
                      return (
                        <div key={t.role}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                            <span style={{fontWeight:500}}>{label}</span>
                            <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color}}>{t.avgProgress}%</span>
                          </div>
                          <div style={{height:6,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                            <div style={{width:`${t.avgProgress}%`,height:'100%',background:color,transition:'width 0.5s'}}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>
            </div>

            {/* ═══ ONBOARDING HEALTH ═══ */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:16,marginBottom:24}}>
              <div className="card" style={{padding:'16px 18px'}}>
                <Section title="Onboarding Completion" subtitle="Active clients with checklists">
                  <div style={{textAlign:'center',padding:'20px 0'}}>
                    <div style={{fontFamily:'var(--font-display)',fontSize:42,fontWeight:800,letterSpacing:'-0.04em',color:onboardingMetrics.avgCompletion>=70?'var(--green)':onboardingMetrics.avgCompletion>=40?'var(--amber)':'var(--red)'}}>
                      {Math.round(onboardingMetrics.avgCompletion)}%
                    </div>
                    <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1,marginTop:4}}>Avg completion</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>{onboardingMetrics.perClient.length} clients tracked</div>
                  </div>
                </Section>
              </div>
              <div className="card" style={{padding:'16px 18px'}}>
                <Section title="Stuck Onboardings" subtitle="Clients below 50% with 5+ items">
                  {onboardingMetrics.stuck.length===0 ? (
                    <div style={{padding:'30px 0',textAlign:'center',fontSize:12,color:'var(--green)'}}>No stuck onboardings</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflowY:'auto'}}>
                      {onboardingMetrics.stuck.slice(0,6).map(c=>(
                        <div key={c.id} style={{padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--radius)'}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:12}}>
                            <span style={{fontWeight:500}}>{c.name}</span>
                            <span style={{fontFamily:'var(--font-mono)',color:c.pct<30?'var(--red)':'var(--amber)',fontWeight:700}}>{c.done}/{c.total} · {c.pct}%</span>
                          </div>
                          <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
                            <div style={{width:`${c.pct}%`,height:'100%',background:c.pct<30?'var(--red)':'var(--amber)'}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </div>

            {/* ═══ ACTIVITY VOLUME ═══ */}
            <div className="card" style={{padding:'16px 18px',marginBottom:24}}>
              <Section title="Team Activity" subtitle="Change log entries per week — operational rhythm">
                <div style={{height:140}}>
                  <ResponsiveContainer>
                    <BarChart data={activityByWeek}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={10} tickLine={false}/>
                      <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false}/>
                      <Tooltip contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:11}}/>
                      <Bar dataKey="entries" fill="var(--accent)" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>
          </>
        )}
      </div>
    </>
  )
}
