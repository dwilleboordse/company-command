import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Edit2, Check } from 'lucide-react'
import { weekLabel, weekNum, parseLocal } from '../lib/dates'

const PLATFORMS = [
  {key:'meta_spend',    label:'Meta',     color:'#1877f2'},
  {key:'tiktok_spend',  label:'TikTok',   color:'#f43f5e'},
  {key:'applovin_spend',label:'AppLovin', color:'#8b5cf6'},
  {key:'other_spend',   label:'Other',    color:'#6b7280'},
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
    ddu_spend:     existing?.ddu_spend     || '',
    total_spend:   existing?.total_spend   || '',
    meta_spend:    existing?.meta_spend    || '',
    tiktok_spend:  existing?.tiktok_spend  || '',
    applovin_spend:existing?.applovin_spend|| '',
    other_spend:   existing?.other_spend   || '',
    notes:         existing?.notes         || '',
  })
  const [saving, setSaving] = useState(false)

  const platformSum = PLATFORMS.reduce((s,p) => s + (parseFloat(form[p.key])||0), 0)
  const dduVal = platformSum > 0 ? platformSum : (parseFloat(form.ddu_spend)||0)
  const pct = form.total_spend > 0 ? ((dduVal / form.total_spend)*100).toFixed(1) : null
  const status = pct !== null ? getStatus(parseFloat(pct)) : null

  async function handleSave() {
    if (!form.total_spend) return
    setSaving(true)
    await supabase.from('spend_entries').upsert({
      client_id: client.id, week_start: weekStart,
      ddu_spend: dduVal,
      total_spend:    parseFloat(form.total_spend)||0,
      meta_spend:     parseFloat(form.meta_spend)||0,
      tiktok_spend:   parseFloat(form.tiktok_spend)||0,
      applovin_spend: parseFloat(form.applovin_spend)||0,
      other_spend:    parseFloat(form.other_spend)||0,
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

        <div className="card-label" style={{marginTop:16,marginBottom:8}}>DDU Platform Spend</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          {PLATFORMS.map(p => (
            <div key={p.key}>
              <label style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:p.color}}/>
                {p.label} ($)
              </label>
              <input type="number" value={form[p.key]}
                onChange={e=>setForm({...form,[p.key]:e.target.value})} placeholder="0"/>
            </div>
          ))}
        </div>

        {platformSum > 0
          ? <div style={{marginBottom:14,padding:'8px 12px',background:'var(--accent-dim)',borderRadius:'var(--radius)',border:'1px solid var(--accent)',fontSize:12,color:'var(--accent)',display:'flex',justifyContent:'space-between'}}>
              <span>DDU Total (sum of platforms)</span><span style={{fontWeight:700}}>{fmtMoney(platformSum)}</span>
            </div>
          : <div className="form-group">
              <label>DDU Total Spend ($)</label>
              <input type="number" value={form.ddu_spend} onChange={e=>setForm({...form,ddu_spend:e.target.value})} placeholder="0"/>
            </div>
        }

        <div className="form-group">
          <label>Total Spend All Channels ($) <span style={{color:'var(--red)'}}>*</span></label>
          <input type="number" value={form.total_spend} onChange={e=>setForm({...form,total_spend:e.target.value})} placeholder="0"/>
        </div>

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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!form.total_spend}>
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

  // Default to last Monday — the standard logging day
  const [selectedWeek, setSelectedWeek] = useState(() => toDateStr(getLastMonday()))

  useEffect(() => { if (profile?.id) load() }, [profile?.id])

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const [{ data:clientData }, { data:memberData }] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('id,full_name,position').order('full_name'),
    ])
    setClients(clientData||[])
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
  const isLastWeek = selectedWeek === toDateStr(getLastMonday())
  const isThisWeek = isCurrentWeek(selectedWeek)

  const csMap = Object.fromEntries(members.map(m=>[m.id,m]))
  const csMembers = members.filter(m => m.position==='creative_strategist')

  // Stats for selected week
  const weekEntries = clients.map(c => entries[c.id]?.find(e=>e.week_start===selectedWeek)).filter(e=>e?.total_spend>0)
  const totalDDU   = weekEntries.reduce((s,e) => s+(e.ddu_spend||0), 0)
  const totalAll   = weekEntries.reduce((s,e) => s+(e.total_spend||0), 0)
  const avgPct     = weekEntries.length ? (weekEntries.reduce((s,e) => s+(e.ddu_spend/e.total_spend)*100, 0)/weekEntries.length).toFixed(1) : null
  const atRisk     = weekEntries.filter(e => (e.ddu_spend/e.total_spend)<0.2).length
  const loggedCount = weekEntries.length
  const spendStatus = avgPct !== null ? getStatus(parseFloat(avgPct)) : null

  // Filter + sort
  const filtered = clients.filter(c => {
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

          {/* Week navigator */}
          <div style={{display:'flex',alignItems:'center',gap:0,border:'1.5px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',background:'var(--bg-card)',boxShadow:'var(--shadow-xs)'}}>
            <button onClick={prevWeek}
              style={{padding:'8px 12px',border:'none',background:'transparent',cursor:'pointer',color:'var(--text-secondary)',display:'flex',alignItems:'center',transition:'background 0.1s'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <ChevronLeft size={16}/>
            </button>
            <div style={{padding:'8px 16px',borderLeft:'1px solid var(--border)',borderRight:'1px solid var(--border)',textAlign:'center',minWidth:160}}>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>W{weekNum(selectedWeek)} · {weekLabel(selectedWeek)}</div>
              <div style={{fontSize:10,fontFamily:'var(--font-mono)',marginTop:1,
                color: isLastWeek ? 'var(--green)' : isThisWeek ? 'var(--amber)' : 'var(--text-muted)'}}>
                {isLastWeek ? '✓ Target logging week' : isThisWeek ? '⚠ Current week (not yet complete)' : 'Historical'}
              </div>
            </div>
            <button onClick={nextWeek} disabled={!canGoNext}
              style={{padding:'8px 12px',border:'none',background:'transparent',cursor:canGoNext?'pointer':'not-allowed',color:canGoNext?'var(--text-secondary)':'var(--border)',display:'flex',alignItems:'center',transition:'background 0.1s'}}
              onMouseEnter={e=>{if(canGoNext)e.currentTarget.style.background='var(--bg-hover)'}}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">DDU Spend</div><div className="stat-box-value text-accent">{fmtMoney(totalDDU)}</div></div>
          <div className="stat-box"><div className="stat-box-label">Total Spend</div><div className="stat-box-value">{fmtMoney(totalAll)}</div></div>
          <div className="stat-box"><div className="stat-box-label">Avg DDU %</div><div className="stat-box-value" style={{color:spendStatus?.color||'var(--text-muted)'}}>{avgPct!==null?`${avgPct}%`:'—'}</div></div>
          <div className="stat-box"><div className="stat-box-label">At Risk</div><div className="stat-box-value text-red">{atRisk}</div></div>
          <div className="stat-box">
            <div className="stat-box-label">Logged</div>
            <div className="stat-box-value">
              <span style={{color:loggedCount===clients.length?'var(--green)':loggedCount>0?'var(--amber)':'var(--text-primary)'}}>{loggedCount}</span>
              <span style={{fontSize:14,color:'var(--text-muted)'}}> / {clients.length}</span>
            </div>
          </div>
        </div>

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
          : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {filtered.map(client=>(
                <ClientRow key={client.id} client={client}
                  entries={entries[client.id]||[]}
                  selectedWeek={selectedWeek}
                  onLog={(c,e)=>{ setLogClient(c); setLogExisting(e||null) }}/>
              ))}
              {filtered.length===0 && <div className="empty-state"><p>No clients match this filter.</p></div>}
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
