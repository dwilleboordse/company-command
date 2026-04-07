import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ChevronRight, Plus, X, Save, CheckCircle2, Circle } from 'lucide-react'

function getMonday(date=new Date()) {
  const d=new Date(date),day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1)
  d.setDate(diff);d.setHours(0,0,0,0);return d
}
function addDays(date,n) { const d=new Date(date);d.setDate(d.getDate()+n);return d }
function fmt(date) { return date instanceof Date?date.toISOString().split('T')[0]:date }
function fmtDisplay(date) { return date.toLocaleDateString('en-US',{month:'short',day:'numeric'}) }
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday']

function WeekOutcomePanel({ userId, weekStart, isOwn }) {
  const [outcomes, setOutcomes] = useState([])
  const [outcomesDone, setOutcomesDone] = useState([])
  const [newItem, setNewItem] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { load() }, [weekStart, userId])

  async function load() {
    const { data } = await supabase.from('week_outcomes').select('*').eq('user_id',userId).eq('week_start',weekStart).single()
    setOutcomes(data?.outcomes||[])
    setOutcomesDone(data?.outcomes_done||[])
    setLoaded(true)
  }

  async function save(o, od) {
    await supabase.from('week_outcomes').upsert({ user_id:userId, week_start:weekStart, outcomes:o, outcomes_done:od, updated_at:new Date().toISOString() }, { onConflict:'user_id,week_start' })
  }

  function addOutcome() {
    if (!newItem.trim()) return
    const o=[...outcomes, newItem.trim()]
    setOutcomes(o); save(o, outcomesDone); setNewItem('')
  }

  function removeOutcome(i) {
    const o=outcomes.filter((_,idx)=>idx!==i), od=outcomesDone.filter(x=>x!==i).map(x=>x>i?x-1:x)
    setOutcomes(o); setOutcomesDone(od); save(o,od)
  }

  function toggleDone(i) {
    const od=outcomesDone.includes(i)?outcomesDone.filter(x=>x!==i):[...outcomesDone,i]
    setOutcomesDone(od); save(outcomes,od)
  }

  if (!loaded) return null

  return (
    <div>
      <div className="card-label">Week Outcomes</div>
      {outcomes.map((o,i) => {
        const done=outcomesDone.includes(i)
        return (
          <div key={i} className="checkbox-item" style={{ padding:'5px 0', borderBottom:'1px solid var(--border)' }} onClick={()=>toggleDone(i)}>
            {done?<CheckCircle2 size={14} color="var(--green)"/>:<Circle size={14} color="var(--text-muted)"/>}
            <span className={`text-sm ${done?'strikethrough':''}`} style={{ flex:1 }}>{o}</span>
            {isOwn && <button onClick={e=>{e.stopPropagation();removeOutcome(i)}} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex' }}><X size={11}/></button>}
          </div>
        )
      })}
      {isOwn && (
        <div className="flex gap-2" style={{ marginTop:8 }}>
          <input value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addOutcome()} placeholder="Add outcome..." style={{ fontSize:12,padding:'5px 8px' }}/>
          <button className="btn btn-primary btn-sm btn-icon" onClick={addOutcome}><Plus size={13}/></button>
        </div>
      )}
    </div>
  )
}

function DayCell({ userId, date, isOwn }) {
  const [entry, setEntry] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ goals:'', plan:'', workload:'', day_outcome:'' })
  const [saving, setSaving] = useState(false)
  const dateStr=fmt(date), isToday=fmt(new Date())===dateStr

  useEffect(() => { load() }, [date, userId])

  async function load() {
    const { data } = await supabase.from('day_entries').select('*').eq('user_id',userId).eq('entry_date',dateStr).single()
    setEntry(data)
    if (data) setForm({ goals:data.goals||'', plan:data.plan||'', workload:data.workload||'', day_outcome:data.day_outcome||'' })
  }

  async function save() {
    setSaving(true)
    await supabase.from('day_entries').upsert({ user_id:userId, entry_date:dateStr, ...form, day_outcome_done:false, updated_at:new Date().toISOString() }, { onConflict:'user_id,entry_date' })
    setSaving(false); setEditing(false); load()
  }

  async function toggleDone() {
    if (!entry) return
    const updated={ ...entry, day_outcome_done:!entry.day_outcome_done }
    await supabase.from('day_entries').upsert({ user_id:userId, entry_date:dateStr, ...updated }, { onConflict:'user_id,entry_date' })
    setEntry(updated)
  }

  return (
    <div style={{ padding:12, minHeight:160, background:isToday?'rgba(59,130,246,0.04)':'transparent', borderLeft:isToday?'2px solid var(--accent)':'2px solid transparent' }}>
      {isOwn && !editing ? (
        <div onClick={()=>setEditing(true)} style={{ cursor:'pointer', height:'100%' }}>
          {entry?.day_outcome ? (
            <div>
              <div className="checkbox-item" onClick={e=>{e.stopPropagation();toggleDone()}} style={{ marginBottom:6 }}>
                {entry.day_outcome_done?<CheckCircle2 size={14} color="var(--green)"/>:<Circle size={14} color="var(--text-muted)"/>}
                <span className={`text-sm ${entry.day_outcome_done?'strikethrough':''}`} style={{ lineHeight:1.3 }}>{entry.day_outcome}</span>
              </div>
              {entry.goals&&<p style={{ fontSize:10,color:'var(--text-muted)',marginTop:4 }}>{entry.goals}</p>}
            </div>
          ) : (
            <div style={{ height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:11 }}>
              {isToday?'Click to log today':'No entry'}
            </div>
          )}
        </div>
      ) : isOwn && editing ? (
        <div>
          <textarea placeholder="Goals..." value={form.goals} onChange={e=>setForm({...form,goals:e.target.value})} rows={2} style={{ fontSize:11,marginBottom:5,resize:'none' }}/>
          <textarea placeholder="Plan..." value={form.plan} onChange={e=>setForm({...form,plan:e.target.value})} rows={2} style={{ fontSize:11,marginBottom:5,resize:'none' }}/>
          <textarea placeholder="Day outcome..." value={form.day_outcome} onChange={e=>setForm({...form,day_outcome:e.target.value})} rows={2} style={{ fontSize:11,marginBottom:5,resize:'none' }}/>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}><Save size={11}/></button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)}><X size={11}/></button>
          </div>
        </div>
      ) : (
        <div>
          {entry?.day_outcome ? (
            <div>
              <div className="card-label" style={{ fontSize:9 }}>Day Outcome</div>
              <p style={{ fontSize:11,lineHeight:1.4 }}>{entry.day_outcome}</p>
            </div>
          ) : <span style={{ fontSize:11,color:'var(--text-muted)' }}>No entry</span>}
        </div>
      )}
    </div>
  )
}

function MonthView({ userId, month, year, isOwn }) {
  const [entries, setEntries] = useState({})
  const [outcomes, setOutcomes] = useState({})

  useEffect(() => { loadMonth() }, [userId, month, year])

  async function loadMonth() {
    const firstDay = new Date(year, month, 1), lastDay = new Date(year, month+1, 0)
    const { data } = await supabase.from('day_entries').select('entry_date,day_outcome,day_outcome_done').eq('user_id',userId).gte('entry_date',fmt(firstDay)).lte('entry_date',fmt(lastDay))
    const map={}; data?.forEach(d=>{map[d.entry_date]=d}); setEntries(map)
    const { data: wo } = await supabase.from('week_outcomes').select('week_start,outcomes,outcomes_done').eq('user_id',userId).gte('week_start',fmt(firstDay)).lte('week_start',fmt(lastDay))
    const woMap={}; wo?.forEach(w=>{woMap[w.week_start]=w}); setOutcomes(woMap)
  }

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month+1, 0)
  const startDay = (firstDayOfMonth.getDay()+6)%7 // Mon=0
  const totalCells = Math.ceil((startDay+lastDayOfMonth.getDate())/7)*7
  const todayStr = fmt(new Date())

  const cells = []
  for (let i=0; i<totalCells; i++) {
    const dayNum = i-startDay+1
    if (dayNum<1 || dayNum>lastDayOfMonth.getDate()) { cells.push(null); continue }
    const d = new Date(year, month, dayNum)
    cells.push({ date:d, dateStr:fmt(d) })
  }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1, background:'var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>(
          <div key={d} style={{ background:'var(--bg)', padding:'8px 10px', fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1 }}>{d}</div>
        ))}
        {cells.map((cell,i) => {
          if (!cell) return <div key={i} style={{ background:'var(--bg)', minHeight:80 }}/>
          const entry=entries[cell.dateStr], isToday=cell.dateStr===todayStr
          const dayOfWeek=(cell.date.getDay()+6)%7
          const isWeekend=dayOfWeek>=5
          return (
            <div key={i} style={{ background:isToday?'rgba(59,130,246,0.06)':isWeekend?'rgba(255,255,255,0.01)':'var(--bg-card)', padding:8, minHeight:80, borderLeft:isToday?'2px solid var(--accent)':'none' }}>
              <div style={{ fontSize:11, fontWeight:600, color:isToday?'var(--accent)':isWeekend?'var(--text-muted)':'var(--text-secondary)', marginBottom:4 }}>{dayOfWeek<5?cell.date.getDate():''}</div>
              {!isWeekend && entry?.day_outcome && (
                <div style={{ fontSize:10, color:entry.day_outcome_done?'var(--green)':'var(--text-secondary)', lineHeight:1.3, display:'flex', alignItems:'flex-start', gap:4 }}>
                  {entry.day_outcome_done?'✓':'·'} {entry.day_outcome.slice(0,40)}{entry.day_outcome.length>40?'…':''}
                </div>
              )}
              {isWeekend && <div style={{ fontSize:10, color:'var(--text-muted)' }}>{cell.date.getDate()}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Calendar() {
  const { profile, isManagement, isCEO } = useAuth()
  const [weekStart, setWeekStart] = useState(getMonday())
  const [members, setMembers] = useState([])
  const [viewMode, setViewMode] = useState('own')
  const [calView, setCalView] = useState('week') // 'week' or 'month'
  const [monthDate, setMonthDate] = useState(new Date())

  useEffect(() => {
    if (isManagement) loadTeam()
    else if (profile) setMembers([profile])
  }, [isManagement, profile])

  async function loadTeam() {
    const { data } = await supabase.from('profiles').select('id,full_name,role,position').order('full_name')
    // CEO: filter out other CEO's data for privacy — only show athletes and management
    // Actually CEO can see all in team view — but athletes cannot see CEO's data
    setMembers(data||[])
  }

  const weekDays = DAYS.map((_,i) => addDays(weekStart,i))
  const weekLabel = `${fmtDisplay(weekStart)} — ${fmtDisplay(weekDays[4])}`

  // Privacy: non-CEO athletes cannot see CEO's calendar entries
  const displayMembers = viewMode==='own'||!isManagement
    ? [profile]
    : members.filter(m => {
        // don't show CEO entries to non-CEO management unless it's themselves
        if (m.role==='ceo' && !isCEO && m.id!==profile?.id) return false
        return true
      })

  const monthName = monthDate.toLocaleDateString('en-US',{month:'long',year:'numeric'})

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1 className="page-title">Calendar</h1><p className="page-subtitle">Weekly outcomes, daily planning, task tracking</p></div>
          <div className="flex items-center gap-3">
            {/* Week / Month toggle */}
            <div className="tabs" style={{ border:'none', marginBottom:0 }}>
              <button className={`tab ${calView==='week'?'active':''}`} onClick={()=>setCalView('week')}>Week</button>
              <button className={`tab ${calView==='month'?'active':''}`} onClick={()=>setCalView('month')}>Month</button>
            </div>
            {isManagement && calView==='week' && (
              <div className="tabs" style={{ border:'none', marginBottom:0 }}>
                <button className={`tab ${viewMode==='own'?'active':''}`} onClick={()=>setViewMode('own')}>My View</button>
                <button className={`tab ${viewMode==='team'?'active':''}`} onClick={()=>setViewMode('team')}>Team</button>
              </div>
            )}
            {calView==='week' ? (
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setWeekStart(getMonday(addDays(weekStart,-7)))}><ChevronLeft size={15}/></button>
                <span style={{ fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text-secondary)',whiteSpace:'nowrap' }}>{weekLabel}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setWeekStart(getMonday(addDays(weekStart,7)))}><ChevronRight size={15}/></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setMonthDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1))}><ChevronLeft size={15}/></button>
                <span style={{ fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text-secondary)',whiteSpace:'nowrap' }}>{monthName}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setMonthDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1))}><ChevronRight size={15}/></button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="page-body" style={{ padding:'24px 24px' }}>
        {calView==='month' ? (
          <MonthView userId={profile?.id} month={monthDate.getMonth()} year={monthDate.getFullYear()} isOwn={true} />
        ) : (
          displayMembers.filter(Boolean).map(member => (
            <div key={member.id} style={{ marginBottom:32 }}>
              {viewMode==='team' && (
                <div className="flex items-center gap-3" style={{ marginBottom:12 }}>
                  <div className="user-avatar" style={{ width:28,height:28,fontSize:10 }}>
                    {member.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                  </div>
                  <span style={{ fontFamily:'var(--font-display)',fontWeight:600,fontSize:14 }}>{member.full_name}</span>
                  {member.position&&<span className="badge blue" style={{ fontSize:9 }}>{member.position}</span>}
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'180px repeat(5,1fr)', gap:1, background:'var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', border:'1px solid var(--border)' }}>
                <div style={{ background:'var(--bg)',padding:'10px 12px',display:'flex',alignItems:'center' }}>
                  <span style={{ fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1 }}>Outcomes</span>
                </div>
                {DAYS.map((day,i) => (
                  <div key={day} style={{ background:'var(--bg)',padding:'10px 12px',borderLeft:'1px solid var(--border)' }}>
                    <div style={{ fontSize:12,fontWeight:600,color:fmt(weekDays[i])===fmt(new Date())?'var(--accent)':'var(--text-primary)' }}>{day}</div>
                    <div style={{ fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>{fmtDisplay(weekDays[i])}</div>
                  </div>
                ))}
                <div style={{ background:'var(--bg-card)',padding:12 }}>
                  <WeekOutcomePanel userId={member.id} weekStart={fmt(weekStart)} isOwn={member.id===profile?.id}/>
                </div>
                {weekDays.map((day,i) => (
                  <div key={i} style={{ background:'var(--bg-card)',borderLeft:'1px solid var(--border)' }}>
                    <DayCell userId={member.id} date={day} isOwn={member.id===profile?.id}/>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
