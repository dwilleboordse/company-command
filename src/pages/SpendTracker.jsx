import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Edit2, Check } from 'lucide-react'
import { weekLabel, weekNum, parseLocal } from '../lib/dates'

const PLATFORMS = [
  {key:'meta_spend',     totalKey:'meta_total_spend',     label:'Meta',     color:'#1877f2'},
  {key:'tiktok_spend',   totalKey:'tiktok_total_spend',   label:'TikTok',   color:'#f43f5e'},
  {key:'applovin_spend', totalKey:'applovin_total_spend', label:'AppLovin', color:'#8b5cf6'},
  {key:'google_spend',   totalKey:'google_total_spend',   label:'Google',   color:'#34a853'},
  {key:'other_spend',    totalKey:'other_spend',          label:'Other',    color:'#6b7280'},
]

function getStatus(pct) {
  if (pct>=50) return {label:'Excellent', color:'var(--green)', bg:'var(--green-dim)'}
  if (pct>=20) return {label:'Healthy',   color:'var(--amber)', bg:'var(--amber-dim)'}
  return           {label:'At Risk',    color:'var(--red)',   bg:'var(--red-dim)'}
}
function fmtMoney(n) {
  if (!n) return '—'
  if (n>=1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n>=1000)    return `$${(n/1000).toFixed(1)}K`
  return `$${Number(n).toLocaleString()}`
}

// Month helpers
function getMonthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function getMonthEnd(d) {
  return new Date(d.getFullYear(), d.getMonth()+1, 0)
}
function monthLabel(d) {
  return d.toLocaleString('default',{month:'long',year:'numeric'})
}
function addMonths(d,n) {
  const r=new Date(d.getFullYear(), d.getMonth()+n, 1)
  return r
}

// Get the Monday of last week (default target week)
function getLastMonday() {
  const d = new Date()
  const day = d.getDay() // 0=Sun,1=Mon...
  const diff = day === 0 ? 13 : day + 6 // go back to last Monday
  d.setDate(d.getDate() - diff)
  d.setHours(0,0,0,0)
  return d
}
function getMondayOfWeek(d) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(m.getDate() + diff)
  m.setHours(0,0,0,0)
  return m
}
function addWeeks(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n*7)
  return r
}
function toDateStr(d) {
  return d.toISOString().split('T')[0]
}
function isCurrentWeek(dateStr) {
  const now = new Date()
  const monday = getMondayOfWeek(now)
  return dateStr === toDateStr(monday)
}
function isFutureWeek(dateStr) {
  const now = new Date()
  const monday = getMondayOfWeek(now)
  return dateStr > toDateStr(monday)
}

// ── LOG MODAL ────────────────────────────────────────────────
function LogModal({ client, existing, weekStart, onClose, onSave }) {
  const { profile } = useAuth()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    total_spend:          existing?.total_spend          || '',
    meta_spend:           existing?.meta_spend           || '',
    meta_total_spend:     existing?.meta_total_spend     || '',
    tiktok_spend:         existing?.tiktok_spend         || '',
    tiktok_total_spend:   existing?.tiktok_total_spend   || '',
    applovin_spend:       existing?.applovin_spend       || '',
    applovin_total_spend: existing?.applovin_total_spend || '',
    google_spend:         existing?.google_spend         || '',
    google_total_spend:   existing?.google_total_spend   || '',
    other_spend:          existing?.other_spend          || '',
    notes:                existing?.notes                || '',
  })
  const [saving, setSaving] = useState(false)

  const dduPlatformSum = PLATFORMS.reduce((s,p) => s + (parseFloat(form[p.key])||0), 0)
  const totalPlatformSum = PLATFORMS.reduce((s,p) => s + (parseFloat(form[p.totalKey])||0), 0)
  const effectiveTotal = totalPlatformSum > 0 ? totalPlatformSum : (parseFloat(form.total_spend)||0)
  const pct = effectiveTotal > 0 ? ((dduPlatformSum / effectiveTotal)*100).toFixed(1) : null
  const status = pct !== null ? getStatus(parseFloat(pct)) : null

  async function handleSave() {
    if (!effectiveTotal) return
    setSaving(true)
    await supabase.from('spend_entries').upsert({
      client_id: client.id, week_start: weekStart,
      ddu_spend: dduPlatformSum || 0,
      total_spend: effectiveTotal,
      meta_spend:           parseFloat(form.meta_spend)||0,
      meta_total_spend:     parseFloat(form.meta_total_spend)||0,
      tiktok_spend:         parseFloat(form.tiktok_spend)||0,
      tiktok_total_spend:   parseFloat(form.tiktok_total_spend)||0,
      applovin_spend:       parseFloat(form.applovin_spend)||0,
      applovin_total_spend: parseFloat(form.applovin_total_spend)||0,
      google_spend:         parseFloat(form.google_spend)||0,
      google_total_spend:   parseFloat(form.google_total_spend)||0,
      other_spend:          parseFloat(form.other_spend)||0,
      notes: form.notes,
      entered_by: profile?.id,
    }, { onConflict:'client_id,week_start' })
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="modal-title" style={{marginBottom:2}}>{client.name}</h2>
            <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
              {isEdit ? '✎ Editing' : '+ Logging'} W{weekNum(weekStart)} · {weekLabel(weekStart)}
            </p>
          </div>
          {pct !== null && (
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:800,letterSpacing:'-0.04em',color:status.color}}>{pct}%</div>
              <div style={{fontSize:10,color:status.color,fontFamily:'var(--font-mono)'}}>{status.label}</div>
            </div>
          )}
        </div>

        <div className="card-label" style={{marginTop:16,marginBottom:10}}>Spend Per Platform</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10,marginBottom:14}}>
          {PLATFORMS.map(p => (
            <div key={p.key} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:10}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{p.label}</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                <div>
                  <label style={{textTransform:'none',letterSpacing:0,fontSize:10,color:'var(--text-muted)'}}>DDU Spend</label>
                  <input type="number" value={form[p.key]}
                    onChange={e=>setForm({...form,[p.key]:e.target.value})}
                    placeholder="0" style={{padding:'5px 8px',fontSize:12}}/>
                </div>
                <div>
                  <label style={{textTransform:'none',letterSpacing:0,fontSize:10,color:'var(--text-muted)'}}>Total Spend</label>
                  <input type="number" value={form[p.totalKey]}
                    onChange={e=>setForm({...form,[p.totalKey]:e.target.value})}
                    placeholder="0" style={{padding:'5px 8px',fontSize:12}}/>
                </div>
              </div>
            </div>
          ))}
        </div>

        {(dduPlatformSum>0||totalPlatformSum>0)&&(
          <div style={{marginBottom:14,padding:'8px 12px',background:'var(--bg)',borderRadius:'var(--radius)',border:'1px solid var(--border)',fontSize:12,display:'flex',justifyContent:'space-between',gap:16}}>
            <span style={{color:'var(--accent)'}}>DDU Total: <strong>{fmtMoney(dduPlatformSum)}</strong></span>
            <span style={{color:'var(--text-secondary)'}}>Total Spend: <strong>{fmtMoney(totalPlatformSum||parseFloat(form.total_spend)||0)}</strong></span>
          </div>
        )}

        {totalPlatformSum===0&&(
          <div className="form-group">
            <label>Total Spend All Channels ($) <span style={{color:'var(--red)'}}>*</span></label>
            <input type="number" value={form.total_spend} onChange={e=>setForm({...form,total_spend:e.target.value})} placeholder="0 — or fill platform totals above"/>
          </div>
        )}

        {pct !== null && (
          <div style={{padding:'10px 14px',borderRadius:'var(--radius)',background:status.bg,border:`1px solid ${status.color}`,marginBottom:14}}>
            <div className="flex items-center justify-between">
              <span style={{fontSize:12,color:status.color}}>DDU share: <strong>{pct}%</strong></span>
              <span style={{padding:'2px 10px',borderRadius:100,background:status.bg,color:status.color,fontSize:11,fontWeight:600,fontFamily:'var(--font-mono)',border:`1px solid ${status.color}`}}>{status.label}</span>
            </div>
            <div style={{marginTop:8,height:6,background:'rgba(128,128,128,0.15)',borderRadius:3,overflow:'hidden',position:'relative'}}>
              <div style={{position:'absolute',left:'20%',top:0,bottom:0,width:1,background:'var(--amber)',opacity:0.4}}/>
              <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'var(--green)',opacity:0.4}}/>
              <div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:status.color,borderRadius:3,transition:'width 0.3s ease'}}/>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}
            rows={2} style={{resize:'vertical'}} placeholder="Context, platform breakdown details..."/>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!effectiveTotal}>
            {saving ? 'Saving...' : isEdit ? 'Update Entry' : 'Log Spend'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── CLIENT ROW ───────────────────────────────────────────────
function ClientRow({ client, entries, selectedWeek, onLog }) {
  const [expanded, setExpanded] = useState(false)
  const thisEntry = entries?.find(e => e.week_start === selectedWeek)
  const isLogged = !!(thisEntry?.total_spend > 0)
  const pct = isLogged ? ((thisEntry.ddu_spend / thisEntry.total_spend)*100).toFixed(1) : null
  const status = pct !== null ? getStatus(parseFloat(pct)) : null
  const locked = isFutureWeek(selectedWeek)

  // Chart: last 8 weeks of entries
  const chartData = entries?.slice(0,8).slice().reverse().map(e => ({
    week: `W${weekNum(e.week_start)}`,
    pct: e.total_spend > 0 ? parseFloat(((e.ddu_spend/e.total_spend)*100).toFixed(1)) : 0,
    ddu: e.ddu_spend,
    total: e.total_spend,
  }))

  return (
    <div className="card" style={{padding:0,overflow:'hidden'}}>
      <div style={{
        padding:'12px 16px',
        borderLeft:`4px solid ${isLogged ? status.color : 'var(--border)'}`,
        cursor:'pointer',
        background: isLogged ? `${status.color}04` : 'var(--bg-card)',
      }} onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          {/* Left: name + spend info */}
          <div style={{flex:1,minWidth:0}}>
            <div className="flex items-center gap-2" style={{flexWrap:'wrap',marginBottom:4}}>
              <span style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>{client.name}</span>
              {isLogged
                ? <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,fontFamily:'var(--font-mono)',fontWeight:600,color:status.color,background:status.bg,padding:'2px 8px',borderRadius:100}}>
                    <Check size={9}/> Logged
                  </span>
                : <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',background:'var(--bg)',padding:'2px 8px',borderRadius:100,border:'1px solid var(--border)'}}>
                    Not logged
                  </span>
              }
            </div>
            {isLogged && (
              <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
                DDU {fmtMoney(thisEntry.ddu_spend)} · Total {fmtMoney(thisEntry.total_spend)}
                {PLATFORMS.filter(p=>thisEntry[p.key]>0).map(p=>(
                  <span key={p.key} style={{color:p.color,marginLeft:8}}>{p.label} {fmtMoney(thisEntry[p.key])}</span>
                ))}
              </div>
            )}
          </div>

          {/* Right: pct + actions */}
          <div className="flex items-center gap-3" style={{flexShrink:0}}>
            {pct !== null
              ? <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:'var(--font-display)',fontSize:22,fontWeight:700,letterSpacing:'-0.03em',color:status.color}}>{pct}%</div>
                  <div style={{fontSize:9,color:status.color,fontFamily:'var(--font-mono)'}}>{status.label}</div>
                </div>
              : <span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>—</span>
            }
            {!locked && (
              <button className={`btn btn-sm ${isLogged ? 'btn-ghost' : 'btn-primary'}`}
                style={{fontSize:11,gap:4,flexShrink:0}}
                onClick={e=>{e.stopPropagation(); onLog(client, thisEntry||null)}}>
                {isLogged ? <><Edit2 size={11}/> Edit</> : '+ Log'}
              </button>
            )}
            {locked && <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>Future</span>}
            {expanded ? <ChevronUp size={15} color="var(--text-muted)"/> : <ChevronDown size={15} color="var(--text-muted)"/>}
          </div>
        </div>

        {/* Progress bar */}
        {pct !== null && (
          <div style={{marginTop:8,height:4,background:'var(--border)',borderRadius:2,overflow:'hidden',position:'relative'}}>
            <div style={{position:'absolute',left:'20%',top:0,bottom:0,width:1,background:'var(--amber)',opacity:0.5}}/>
            <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'var(--green)',opacity:0.5}}/>
            <div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:status.color,borderRadius:2,transition:'width 0.4s ease'}}/>
          </div>
        )}
      </div>

      {/* Expanded: history chart */}
      {expanded && (
        <div style={{padding:'14px 16px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
          {/* This week platform breakdown */}
          {isLogged && PLATFORMS.some(p=>thisEntry[p.key]>0) && (
            <div style={{marginBottom:14}}>
              <div className="card-label mb-2">This Entry — Platforms</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {PLATFORMS.filter(p=>thisEntry[p.key]>0).map(p=>(
                  <div key={p.key} style={{padding:'7px 12px',borderRadius:'var(--radius)',background:'var(--bg-card)',border:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:p.color}}/>
                    <span style={{fontSize:12,color:'var(--text-secondary)'}}>{p.label}</span>
                    <span style={{fontSize:13,fontWeight:600,fontFamily:'var(--font-mono)'}}>{fmtMoney(thisEntry[p.key])}</span>
                  </div>
                ))}
              </div>
              {thisEntry.notes && <p style={{fontSize:11,color:'var(--text-muted)',marginTop:8,fontStyle:'italic'}}>"{thisEntry.notes}"</p>}
            </div>
          )}

          {/* History chart */}
          {chartData?.length > 0 ? (
            <>
              <div className="card-label mb-2">DDU % History</div>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={chartData} margin={{top:4,right:4,bottom:0,left:-20}}>
                  <XAxis dataKey="week" tick={{fill:'var(--text-muted)',fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis domain={[0,100]} tick={{fill:'var(--text-muted)',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
                  <Tooltip contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:11}}
                    formatter={(v,n,p)=>[`${v}% (DDU ${fmtMoney(p.payload.ddu)} / Total ${fmtMoney(p.payload.total)})`,'DDU Share']}/>
                  <ReferenceLine y={20} stroke="var(--amber)" strokeDasharray="4 4" strokeOpacity={0.5}/>
                  <ReferenceLine y={50} stroke="var(--green)" strokeDasharray="4 4" strokeOpacity={0.5}/>
                  <Bar dataKey="pct" radius={[3,3,0,0]}>
                    {chartData.map((e,i)=><Cell key={i} fill={getStatus(e.pct).color} fillOpacity={0.8}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <p style={{fontSize:12,color:'var(--text-muted)'}}>No history yet. Log 2+ weeks to see trend.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function SpendTracker() {
  const { profile, isManagement } = useAuth()
  const [clients, setClients]   = useState([])
  const [members, setMembers]   = useState([])
  const [entries, setEntries]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [logClient, setLogClient] = useState(null)
  const [logExisting, setLogExisting] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [csFilter, setCsFilter] = useState('all')
  const [search, setSearch]     = useState('')

  const [viewMode, setViewMode] = useState('weekly') // 'weekly' | 'monthly'
  const [showArchived, setShowArchived] = useState(false)
  // Default to last Monday — the standard logging day
  const [selectedWeek, setSelectedWeek] = useState(() => toDateStr(getLastMonday()))
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthStart(new Date()))

  useEffect(() => { if (profile?.id) load() }, [profile?.id])

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const [{ data:clientData }, { data:memberData }] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('id,full_name,position').order('full_name'),
    ])
    const allClients = clientData||[]
    setClients(allClients) // keep all for archived tab
    setMembers(memberData||[])
    if (clientData?.length) {
      const { data:entryData } = await supabase.from('spend_entries').select('*')
        .in('client_id', clientData.map(c=>c.id))
        .order('week_start', {ascending:false})
      const map = {}
      entryData?.forEach(e => { if(!map[e.client_id]) map[e.client_id]=[]; map[e.client_id].push(e) })
      setEntries(map)
    }
    setLoading(false)
  }

  // Week navigation
  function prevWeek() { setSelectedWeek(w => toDateStr(addWeeks(new Date(w), -1))) }
  function nextWeek() {
    const next = toDateStr(addWeeks(new Date(selectedWeek), 1))
    if (!isFutureWeek(next)) setSelectedWeek(next)
  }
  const canGoNext = !isFutureWeek(toDateStr(addWeeks(new Date(selectedWeek), 1)))
  function prevMonth() { setSelectedMonth(m=>addMonths(m,-1)) }
  function nextMonth() {
    const next=addMonths(selectedMonth,1)
    if (next<=new Date()) setSelectedMonth(next)
  }
  const canGoNextMonth = addMonths(selectedMonth,1) <= new Date()
  const isLastWeek = selectedWeek === toDateStr(getLastMonday())
  const isThisWeek = isCurrentWeek(selectedWeek)

  const activeClients = clients.filter(c => !c.is_archived)
  const archivedClients = clients.filter(c => c.is_archived)
  const csMap = Object.fromEntries(members.map(m=>[m.id,m]))
  const csMembers = members.filter(m => m.position==='creative_strategist')

  // Monthly stats — sum all entries whose week_start falls in selectedMonth
  const monthStart = toDateStr(getMonthStart(selectedMonth))
  const monthEnd   = toDateStr(getMonthEnd(selectedMonth))
  const monthEntries = (showArchived ? clients : activeClients).flatMap(cl =>
    (entries[cl.id]||[]).filter(e => e.week_start >= monthStart && e.week_start <= monthEnd && e.total_spend > 0)
      .map(e => ({...e, clientName: cl.name}))
  )
  const monthDDU   = monthEntries.reduce((s,e)=>s+(e.ddu_spend||0),0)
  const monthTotal = monthEntries.reduce((s,e)=>s+(e.total_spend||0),0)
  const monthAvgPct = monthTotal>0 ? ((monthDDU/monthTotal)*100).toFixed(1) : null
  const monthAtRisk = (showArchived ? clients : activeClients).filter(cl=>{
    const clEntries=(entries[cl.id]||[]).filter(e=>e.week_start>=monthStart&&e.week_start<=monthEnd&&e.total_spend>0)
    if (!clEntries.length) return false
    const tot=clEntries.reduce((s,e)=>s+e.total_spend,0)
    const ddu=clEntries.reduce((s,e)=>s+e.ddu_spend,0)
    return (ddu/tot)<0.2
  }).length

  // Stats for selected week
  const weekEntries = (showArchived ? clients : activeClients).map(c => entries[c.id]?.find(e=>e.week_start===selectedWeek)).filter(e=>e?.total_spend>0)
  const totalDDU   = weekEntries.reduce((s,e) => s+(e.ddu_spend||0), 0)
  const totalAll   = weekEntries.reduce((s,e) => s+(e.total_spend||0), 0)
  const avgPct     = weekEntries.length ? (weekEntries.reduce((s,e) => s+(e.ddu_spend/e.total_spend)*100, 0)/weekEntries.length).toFixed(1) : null
  const atRisk     = weekEntries.filter(e => (e.ddu_spend/e.total_spend)<0.2).length
  const loggedCount = weekEntries.length
  const spendStatus = avgPct !== null ? getStatus(parseFloat(avgPct)) : null

  // Filter + sort
  const displayClients = showArchived ? archivedClients : activeClients
  const filtered = displayClients.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    // CS filter
    if (csFilter !== 'all') {
      const ids = Array.isArray(c.cs_ids) ? c.cs_ids : (c.cs_ids ? (() => { try { return JSON.parse(c.cs_ids) } catch { return [] } })() : [])
      if (!ids.includes(csFilter)) return false
    }
    const e = entries[c.id]?.find(x=>x.week_start===selectedWeek)
    const p = e?.total_spend>0 ? (e.ddu_spend/e.total_spend)*100 : null
    if (statusFilter==='atrisk')   return p!==null && p<20
    if (statusFilter==='healthy')  return p!==null && p>=20 && p<50
    if (statusFilter==='excellent')return p!==null && p>=50
    if (statusFilter==='unlogged') return !e || !e.total_spend
    return true
  }).sort((a,b) => {
    const ea = entries[a.id]?.find(e=>e.week_start===selectedWeek)
    const eb = entries[b.id]?.find(e=>e.week_start===selectedWeek)
    const pa = ea?.total_spend>0 ? (ea.ddu_spend/ea.total_spend)*100 : null
    const pb = eb?.total_spend>0 ? (eb.ddu_spend/eb.total_spend)*100 : null
    // Unlogged first, then by pct ascending (worst first)
    if (pa===null && pb!==null) return -1
    if (pb===null && pa!==null) return 1
    if (pa!==null && pb!==null) return pa - pb
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">Spend Tracker</h1>
            <p className="page-subtitle">Log every Monday for the prior week</p>
          </div>

          <div className="flex gap-2 items-center">
            {/* Archived toggle */}
            <button onClick={()=>setShowArchived(!showArchived)}
              className={showArchived?'btn btn-ghost btn-sm':'btn btn-ghost btn-sm'}
              style={{color:showArchived?'var(--amber)':'var(--text-secondary)',borderColor:showArchived?'var(--amber)':'var(--border)'}}>
              {showArchived?'← Active Clients':'Archived'}
            </button>

            {/* View toggle */}
            <div style={{display:'flex',border:'1.5px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
              <button onClick={()=>setViewMode('weekly')}
                style={{padding:'7px 14px',border:'none',cursor:'pointer',fontSize:12,fontFamily:'var(--font-body)',
                  background:viewMode==='weekly'?'var(--accent)':'transparent',
                  color:viewMode==='weekly'?'#fff':'var(--text-secondary)',transition:'all 0.12s'}}>
                Weekly
              </button>
              <button onClick={()=>setViewMode('monthly')}
                style={{padding:'7px 14px',border:'none',cursor:'pointer',fontSize:12,fontFamily:'var(--font-body)',
                  background:viewMode==='monthly'?'var(--accent)':'transparent',
                  color:viewMode==='monthly'?'#fff':'var(--text-secondary)',transition:'all 0.12s'}}>
                Monthly
              </button>
            </div>

            {/* Week navigator */}
            {viewMode==='weekly'&&(
              <div style={{display:'flex',alignItems:'center',gap:0,border:'1.5px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',background:'var(--bg-card)',boxShadow:'var(--shadow-xs)'}}>
                <button onClick={prevWeek}
                  style={{padding:'8px 12px',border:'none',background:'transparent',cursor:'pointer',color:'var(--text-secondary)',display:'flex',alignItems:'center'}}>
                  <ChevronLeft size={16}/>
                </button>
                <div style={{padding:'8px 16px',borderLeft:'1px solid var(--border)',borderRight:'1px solid var(--border)',textAlign:'center',minWidth:160}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>W{weekNum(selectedWeek)} · {weekLabel(selectedWeek)}</div>
                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',marginTop:1,
                    color:isLastWeek?'var(--green)':isThisWeek?'var(--amber)':'var(--text-muted)'}}>
                    {isLastWeek?'✓ Target logging week':isThisWeek?'⚠ Current week':' Historical'}
                  </div>
                </div>
                <button onClick={nextWeek} disabled={!canGoNext}
                  style={{padding:'8px 12px',border:'none',background:'transparent',cursor:canGoNext?'pointer':'not-allowed',color:canGoNext?'var(--text-secondary)':'var(--border)',display:'flex',alignItems:'center'}}>
                  <ChevronRight size={16}/>
                </button>
              </div>
            )}

            {/* Month navigator */}
            {viewMode==='monthly'&&(
              <div style={{display:'flex',alignItems:'center',gap:0,border:'1.5px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',background:'var(--bg-card)',boxShadow:'var(--shadow-xs)'}}>
                <button onClick={prevMonth}
                  style={{padding:'8px 12px',border:'none',background:'transparent',cursor:'pointer',color:'var(--text-secondary)',display:'flex',alignItems:'center'}}>
                  <ChevronLeft size={16}/>
                </button>
                <div style={{padding:'8px 16px',borderLeft:'1px solid var(--border)',borderRight:'1px solid var(--border)',textAlign:'center',minWidth:160}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{monthLabel(selectedMonth)}</div>
                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginTop:1}}>Monthly overview</div>
                </div>
                <button onClick={nextMonth} disabled={!canGoNextMonth}
                  style={{padding:'8px 12px',border:'none',background:'transparent',cursor:canGoNextMonth?'pointer':'not-allowed',color:canGoNextMonth?'var(--text-secondary)':'var(--border)',display:'flex',alignItems:'center'}}>
                  <ChevronRight size={16}/>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        {viewMode==='weekly'?(
          <div className="stat-row">
            <div className="stat-box"><div className="stat-box-label">DDU Spend</div><div className="stat-box-value text-accent">{fmtMoney(totalDDU)}</div></div>
            <div className="stat-box"><div className="stat-box-label">Total Spend</div><div className="stat-box-value">{fmtMoney(totalAll)}</div></div>
            <div className="stat-box"><div className="stat-box-label">Avg DDU %</div><div className="stat-box-value" style={{color:spendStatus?.color||'var(--text-muted)'}}>{avgPct!==null?`${avgPct}%`:'—'}</div></div>
            <div className="stat-box"><div className="stat-box-label">At Risk</div><div className="stat-box-value text-red">{atRisk}</div></div>
            <div className="stat-box">
              <div className="stat-box-label">Logged</div>
              <div className="stat-box-value">
                <span style={{color:loggedCount===displayClients.length?'var(--green)':loggedCount>0?'var(--amber)':'var(--text-primary)'}}>{loggedCount}</span>
                <span style={{fontSize:14,color:'var(--text-muted)'}}> / {displayClients.length}</span>
              </div>
            </div>
          </div>
        ):(
          <div className="stat-row">
            <div className="stat-box"><div className="stat-box-label">Monthly DDU</div><div className="stat-box-value text-accent">{fmtMoney(monthDDU)}</div></div>
            <div className="stat-box"><div className="stat-box-label">Monthly Total</div><div className="stat-box-value">{fmtMoney(monthTotal)}</div></div>
            <div className="stat-box"><div className="stat-box-label">Avg DDU %</div>
              <div className="stat-box-value" style={{color:monthAvgPct?getStatus(parseFloat(monthAvgPct)).color:'var(--text-muted)'}}>
                {monthAvgPct?`${monthAvgPct}%`:'—'}
              </div>
            </div>
            <div className="stat-box"><div className="stat-box-label">At Risk</div><div className="stat-box-value text-red">{monthAtRisk}</div></div>
            <div className="stat-box"><div className="stat-box-label">Weeks Logged</div><div className="stat-box-value">{[...new Set(monthEntries.map(e=>e.week_start))].length}</div></div>
          </div>
        )}

        {/* Legend */}
        <div className="card mb-4" style={{padding:'10px 14px'}}>
          <div className="flex items-center gap-4 flex-wrap">
            <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>DDU % OF TOTAL</span>
            {[{label:'At Risk',sub:'< 20%',color:'var(--red)',bg:'var(--red-dim)'},{label:'Healthy',sub:'20–50%',color:'var(--amber)',bg:'var(--amber-dim)'},{label:'Excellent',sub:'≥ 50%',color:'var(--green)',bg:'var(--green-dim)'}].map(t=>(
              <div key={t.label} className="flex items-center gap-2">
                <span style={{padding:'2px 10px',borderRadius:100,background:t.bg,color:t.color,fontSize:11,fontWeight:600,fontFamily:'var(--font-mono)'}}>{t.label}</span>
                <span style={{fontSize:11,color:'var(--text-muted)'}}>{t.sub}</span>
              </div>
            ))}
            <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)'}}>
              Unlogged clients appear first · Worst DDU% next
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <div className="tabs" style={{border:'none',marginBottom:0,flexWrap:'wrap'}}>
            {[{k:'all',l:'All'},{k:'unlogged',l:'⬜ Not Logged'},{k:'atrisk',l:'🔴 At Risk'},{k:'healthy',l:'🟡 Healthy'},{k:'excellent',l:'🟢 Excellent'}]
              .map(f=><button key={f.k} className={`tab ${statusFilter===f.k?'active':''}`} onClick={()=>setStatusFilter(f.k)}>{f.l}</button>)}
          </div>
          {isManagement && (
            <select value={csFilter} onChange={e=>setCsFilter(e.target.value)} style={{width:'auto',fontSize:12}}>
              <option value="all">All CS</option>
              {csMembers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search clients..." style={{width:'auto',fontSize:12,padding:'7px 12px',marginLeft:'auto'}}/>
        </div>

        {/* Client list */}
        {loading
          ? <div className="loading-screen" style={{minHeight:200,background:'transparent'}}><div className="spinner"/></div>
          : viewMode==='weekly' ? (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {filtered.map(client=>(
                <ClientRow key={client.id} client={client}
                  entries={entries[client.id]||[]}
                  selectedWeek={selectedWeek}
                  onLog={(c,e)=>{ setLogClient(c); setLogExisting(e||null) }}/>
              ))}
              {filtered.length===0 && <div className="empty-state"><p>No clients match this filter.</p></div>}
            </div>
          ) : (
            /* Monthly view */
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Monthly DDU</th>
                      <th>Monthly Total</th>
                      <th>DDU %</th>
                      <th>Trend</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(client=>{
                      const clientMonthEntries=(entries[client.id]||[]).filter(e=>e.week_start>=monthStart&&e.week_start<=monthEnd&&e.total_spend>0)
                      const mDDU=clientMonthEntries.reduce((s,e)=>s+(e.ddu_spend||0),0)
                      const mTotal=clientMonthEntries.reduce((s,e)=>s+(e.total_spend||0),0)
                      const mPct=mTotal>0?((mDDU/mTotal)*100).toFixed(1):null
                      const mStatus=mPct?getStatus(parseFloat(mPct)):null
                      // Trend: compare to previous month
                      const prevStart=toDateStr(getMonthStart(addMonths(selectedMonth,-1)))
                      const prevEnd=toDateStr(getMonthEnd(addMonths(selectedMonth,-1)))
                      const prevEntries=(entries[client.id]||[]).filter(e=>e.week_start>=prevStart&&e.week_start<=prevEnd&&e.total_spend>0)
                      const prevTotal=prevEntries.reduce((s,e)=>s+e.total_spend,0)
                      const prevDDU=prevEntries.reduce((s,e)=>s+e.ddu_spend,0)
                      const prevPct=prevTotal>0?(prevDDU/prevTotal)*100:null
                      const trend=mPct&&prevPct?parseFloat(mPct)-prevPct:null
                      if (!mPct&&!clientMonthEntries.length&&search&&!client.name.toLowerCase().includes(search.toLowerCase())) return null
                      return (
                        <tr key={client.id}>
                          <td style={{fontWeight:600}}>{client.name}</td>
                          <td style={{fontFamily:'var(--font-mono)',color:'var(--accent)'}}>{mTotal>0?fmtMoney(mDDU):'—'}</td>
                          <td style={{fontFamily:'var(--font-mono)'}}>{mTotal>0?fmtMoney(mTotal):'—'}</td>
                          <td>
                            {mPct?(
                              <div>
                                <div style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:700,color:mStatus.color}}>{mPct}%</div>
                                <div style={{height:3,background:'var(--border)',borderRadius:2,marginTop:3,overflow:'hidden',width:60}}>
                                  <div style={{width:`${Math.min(100,mPct)}%`,height:'100%',background:mStatus.color,borderRadius:2}}/>
                                </div>
                              </div>
                            ):<span style={{color:'var(--text-muted)',fontSize:12}}>No data</span>}
                          </td>
                          <td>
                            {trend!==null?(
                              <span style={{fontSize:12,fontWeight:600,color:trend>0?'var(--green)':trend<0?'var(--red)':'var(--text-muted)'}}>
                                {trend>0?'↑':'↓'} {Math.abs(trend).toFixed(1)}%
                              </span>
                            ):<span style={{color:'var(--text-muted)',fontSize:12}}>—</span>}
                          </td>
                          <td>
                            {mStatus?(
                              <span style={{padding:'2px 9px',borderRadius:100,fontSize:10,fontWeight:600,fontFamily:'var(--font-mono)',
                                background:mStatus.bg,color:mStatus.color}}>{mStatus.label}</span>
                            ):<span style={{color:'var(--text-muted)',fontSize:11}}>Not logged</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
      </div>

      {logClient && (
        <LogModal client={logClient} existing={logExisting}
          weekStart={selectedWeek}
          onClose={()=>{ setLogClient(null); setLogExisting(null) }}
          onSave={load}/>
      )}
    </>
  )
}
