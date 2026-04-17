import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'

// Week helpers (same as SpendTracker)
function getMondayOfWeek(d) {
  const day=d.getDay(); const diff=day===0?-6:1-day
  const m=new Date(d); m.setDate(m.getDate()+diff); m.setHours(0,0,0,0); return m
}
function getLastMonday() {
  const d=new Date(); const day=d.getDay()
  const diff=day===0?13:day+6; d.setDate(d.getDate()-diff); d.setHours(0,0,0,0); return d
}
function addWeeks(d,n) { const r=new Date(d); r.setDate(r.getDate()+n*7); return r }
function toDateStr(d) { return d.toISOString().split('T')[0] }
function getSundayStr(mondayStr) {
  const d=new Date(mondayStr); d.setDate(d.getDate()+6); return toDateStr(d)
}
function isCurrentOrFutureWeek(dateStr) {
  const monday=getMondayOfWeek(new Date())
  return dateStr >= toDateStr(monday)
}
function weekLabel2(mondayStr) {
  const start=new Date(mondayStr); const end=new Date(mondayStr); end.setDate(end.getDate()+6)
  const fmt=(d)=>`${d.toLocaleString('default',{month:'short'})} ${d.getDate()}`
  return `${fmt(start)} – ${fmt(end)}`
}
function weekNum2(mondayStr) {
  const d=new Date(mondayStr)
  const jan1=new Date(d.getFullYear(),0,1)
  return Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7)
}

const PLATFORMS = ['Meta','TikTok','AppLovin','Google']
const PLATFORM_COLORS = { Meta:'#3b82f6', TikTok:'#f43f5e', AppLovin:'#8b5cf6', Google:'#22c55e' }

const CHANGE_TYPES = [
  'Budget Increase','Budget Decrease','Campaign Launch','Campaign Paused',
  'Audience Change','Creative Swap','Bid Strategy Change','CBO/ABO Switch',
  'Ad Set Change','Scaling','Testing','Other'
]

// Safe date parser — avoids UTC midnight timezone shift
function parseDate(str) {
  if (!str) return new Date()
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y, m-1, d)
}
function fmtDate(str) {
  return parseDate(str).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function AddLogModal({ clients, onClose, onSave }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    client_id: '', platform: 'Meta', change_type: 'Budget Increase',
    description: '', impact: '', log_date: todayStr()
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.client_id || !form.description) return
    setSaving(true)
    await supabase.from('change_log').insert({ ...form, entered_by: profile?.id })
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:520 }} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">Log Change</h2>
        <div className="grid-2">
          <div className="form-group">
            <label>Client</label>
            <select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}>
              <option value="">Select client...</option>
              {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.log_date} onChange={e=>setForm({...form,log_date:e.target.value})}/>
          </div>
        </div>
        <div className="form-group">
          <label>Platform</label>
          <div style={{display:'flex',gap:8}}>
            {PLATFORMS.map(p=>(
              <button key={p} onClick={()=>setForm({...form,platform:p})}
                style={{flex:1,padding:'8px 4px',borderRadius:'var(--radius)',border:`2px solid ${form.platform===p?PLATFORM_COLORS[p]:'var(--border)'}`,background:form.platform===p?`${PLATFORM_COLORS[p]}18`:'var(--bg-input)',color:form.platform===p?PLATFORM_COLORS[p]:'var(--text-muted)',fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>Change Type</label>
          <select value={form.change_type} onChange={e=>setForm({...form,change_type:e.target.value})}>
            {CHANGE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>What changed <span style={{color:'var(--red)'}}>*</span></label>
          <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3} placeholder="Describe the change in detail..." style={{resize:'vertical'}}/>
        </div>
        <div className="form-group">
          <label>Expected Impact / Reason</label>
          <textarea value={form.impact} onChange={e=>setForm({...form,impact:e.target.value})} rows={2} placeholder="Why was this change made? What result do you expect?" style={{resize:'vertical'}}/>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!form.client_id||!form.description}>{saving?'Saving...':'Log Change'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function LogRow({ entry, clientMap, memberMap, canDelete, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const client = clientMap[entry.client_id]
  const member = memberMap[entry.entered_by]
  const color = PLATFORM_COLORS[entry.platform] || 'var(--text-secondary)'

  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',marginBottom:8}}>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer',borderLeft:`4px solid ${color}`}} onClick={()=>setExpanded(!expanded)}>
        <div style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontFamily:'var(--font-display)',fontWeight:600,fontSize:13}}>{client?.name||'—'}</span>
            <span style={{padding:'1px 8px',borderRadius:100,background:`${color}18`,color,fontSize:10,fontFamily:'var(--font-mono)',fontWeight:600}}>{entry.platform}</span>
            <span style={{fontSize:11,color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>{entry.change_type}</span>
          </div>
          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.description}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{fmtDate(entry.log_date)}</div>
          <div style={{fontSize:10,color:'var(--text-muted)',marginTop:1}}>{member?.full_name||'—'}</div>
        </div>
        {canDelete && (
          <button className="btn btn-danger btn-icon btn-sm" onClick={e=>{e.stopPropagation();onDelete(entry.id)}}><Trash2 size={12}/></button>
        )}
        {expanded?<ChevronUp size={15} color="var(--text-muted)"/>:<ChevronDown size={15} color="var(--text-muted)"/>}
      </div>
      {expanded && (
        <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
          <div className="card-label mb-1">Change Description</div>
          <p style={{fontSize:13,lineHeight:1.6,marginBottom:12}}>{entry.description}</p>
          {entry.impact && (
            <>
              <div className="card-label mb-1">Expected Impact / Reason</div>
              <p style={{fontSize:13,lineHeight:1.6,color:'var(--text-secondary)'}}>{entry.impact}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ChangeLog() {
  const { profile, isManagement } = useAuth()
  const [logs, setLogs] = useState([])
  const [clients, setClients] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [platformFilter, setPlatformFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [memberFilter, setMemberFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('week')
  const [selectedWeek, setSelectedWeek] = useState(()=>toDateStr(getLastMonday()))
  const [showArchived, setShowArchived] = useState(false)
  const [allFetchedClients, setAllFetchedClients] = useState([])

  useEffect(()=>{ if(profile?.id) load() },[profile?.id])

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const [{ data:logData },{ data:clientData },{ data:memberData }] = await Promise.all([
      supabase.from('change_log').select('*').order('log_date',{ascending:false}).order('created_at',{ascending:false}).limit(200),
      (() => {
        let q = supabase.from('clients').select('id,name,cs_ids,mb_ids,editor_ids,designer_ids,ugc_ids,assigned_cs_id,channels,is_archived')
          .eq('is_active',true).order('name')
        if (!isManagement && profile?.id) {
          q = q.or(`cs_ids.cs.["${profile.id}"],mb_ids.cs.["${profile.id}"],assigned_cs_id.eq.${profile.id}`)
        }
        return q
      })(),
      supabase.from('profiles').select('id,full_name,position').order('full_name'),
    ])
    setLogs(logData||[])
    // Filter clients for athletes client-side (simple and reliable)
    const parse = (v) => Array.isArray(v)?v:(v?(()=>{try{return JSON.parse(v)}catch{return[]}})():[])
    const visibleClients = (!isManagement && profile?.id)
      ? (clientData||[]).filter(cl =>
          parse(cl.cs_ids).includes(profile.id) ||
          parse(cl.mb_ids).includes(profile.id) ||
          cl.assigned_cs_id === profile.id
        )
      : (clientData||[])
    setAllFetchedClients(visibleClients)
    setClients(visibleClients.filter(c=>!c.is_archived))
    setMembers(memberData||[])
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this log entry?')) return
    await supabase.from('change_log').delete().eq('id',id)
    setLogs(prev=>prev.filter(l=>l.id!==id))
  }

  const archivedClients = allFetchedClients.filter(c=>c.is_archived)
  const displayClients = showArchived ? archivedClients : clients
  const clientMap = Object.fromEntries(allFetchedClients.map(c=>[c.id,c]))
  const memberMap = Object.fromEntries(members.map(m=>[m.id,m]))
  const mediaBuyers = members.filter(m=>m.position==='media_buyer')

  // Date range
  function getDateRange() {
    const now = new Date()
    if (dateFilter==='today') { const t=todayStr(); return {from:t,to:t} }
    if (dateFilter==='week') {
      return {from:selectedWeek, to:getSundayStr(selectedWeek)}
    }
    if (dateFilter==='month') {
      const from=new Date(now.getFullYear(),now.getMonth(),1)
      return {from:`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-01`,to:todayStr()}
    }
    return {from:'2000-01-01',to:'9999-12-31'}
  }
  function prevWeek() { setSelectedWeek(w=>toDateStr(addWeeks(new Date(w),-1))) }
  function nextWeek() {
    const next=toDateStr(addWeeks(new Date(selectedWeek),1))
    if (!isCurrentOrFutureWeek(next)) setSelectedWeek(next)
  }
  const canGoNext = !isCurrentOrFutureWeek(toDateStr(addWeeks(new Date(selectedWeek),1)))
  const isLastWeek = selectedWeek===toDateStr(getLastMonday())

  const {from,to} = getDateRange()
  // Build set of visible client IDs for this user
  const visibleClientIds = new Set(clients.map(c=>c.id))

  const filtered = logs.filter(l=>{
    // Athletes only see logs for their assigned clients
    if (!isManagement && !visibleClientIds.has(l.client_id)) return false
    if (platformFilter!=='all'&&l.platform!==platformFilter) return false
    if (clientFilter!=='all'&&l.client_id!==clientFilter) return false
    if (memberFilter!=='all'&&l.entered_by!==memberFilter) return false
    if (l.log_date<from||l.log_date>to) return false
    return true
  })

  // Group by date
  const byDate = filtered.reduce((acc,l)=>{
    if (!acc[l.log_date]) acc[l.log_date]=[]
    acc[l.log_date].push(l); return acc
  },{})

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">Change Log</h1>
            <p className="page-subtitle">Daily account changes per channel and client</p>
          </div>
          <div className="flex gap-2 items-center">
            {dateFilter==='week'&&(
              <div style={{display:'flex',alignItems:'center',gap:0,border:'1.5px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden',background:'var(--bg-card)',boxShadow:'var(--shadow-xs)'}}>
                <button onClick={prevWeek} style={{padding:'7px 11px',border:'none',background:'transparent',cursor:'pointer',color:'var(--text-secondary)',display:'flex',alignItems:'center'}}>
                  <ChevronLeft size={15}/>
                </button>
                <div style={{padding:'7px 14px',borderLeft:'1px solid var(--border)',borderRight:'1px solid var(--border)',textAlign:'center',minWidth:150}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>W{weekNum2(selectedWeek)} · {weekLabel2(selectedWeek)}</div>
                  <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:isLastWeek?'var(--green)':'var(--text-muted)',marginTop:1}}>
                    {isLastWeek?'✓ Last week':'Historical'}
                  </div>
                </div>
                <button onClick={nextWeek} disabled={!canGoNext} style={{padding:'7px 11px',border:'none',background:'transparent',cursor:canGoNext?'pointer':'not-allowed',color:canGoNext?'var(--text-secondary)':'var(--border)',display:'flex',alignItems:'center'}}>
                  <ChevronRight size={15}/>
                </button>
              </div>
            )}
<button onClick={()=>setShowArchived(!showArchived)}
              className="btn btn-ghost btn-sm"
              style={{color:showArchived?'var(--amber)':'var(--text-secondary)'}}>
              {showArchived?'← Active':'Archived'}
            </button>
            <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> Log Change</button>
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">This Week</div><div className="stat-box-value text-accent">{logs.filter(l=>l.log_date>=from&&l.log_date<=to).length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Today</div><div className="stat-box-value">{logs.filter(l=>l.log_date===todayStr()).length}</div></div>
          {PLATFORMS.map(p=>(
            <div key={p} className="stat-box">
              <div className="stat-box-label">{p}</div>
              <div className="stat-box-value" style={{color:PLATFORM_COLORS[p]}}>{logs.filter(l=>l.platform===p&&l.log_date>=from&&l.log_date<=to).length}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:20,alignItems:'center'}}>
          <div className="tabs" style={{border:'none',marginBottom:0}}>
            {[{k:'today',l:'Today'},{k:'week',l:'This Week'},{k:'month',l:'This Month'},{k:'all',l:'All Time'}].map(f=>(
              <button key={f.k} className={`tab ${dateFilter===f.k?'active':''}`} onClick={()=>setDateFilter(f.k)}>{f.l}</button>
            ))}
          </div>
          <select value={platformFilter} onChange={e=>setPlatformFilter(e.target.value)} style={{width:'auto',fontSize:12}}>
            <option value="all">All Platforms</option>
            {PLATFORMS.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <select value={clientFilter} onChange={e=>setClientFilter(e.target.value)} style={{width:'auto',fontSize:12}}>
            <option value="all">All Clients</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)} style={{width:'auto',fontSize:12}}>
            <option value="all">All Team Members</option>
            {mediaBuyers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>

        {loading ? <div className="loading-screen" style={{minHeight:200}}><div className="spinner"/></div>
          : (
            <>
              {/* Client roster panel — always visible */}
              <div className="card mb-4" style={{padding:0,overflow:'hidden'}}>
                <div style={{padding:'10px 16px',background:'var(--bg)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>Active Clients on Selected Channels</span>
                  <span style={{fontSize:11,color:'var(--text-muted)'}}>{displayClients.length} {showArchived?'archived ':''}clients</span>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:0}}>
                  {displayClients.filter(c=>clientFilter==='all'||c.id===clientFilter).map((cl,i,arr)=>{
                    const chs=cl.channels||{}
                    const active=Object.entries(chs).filter(([,v])=>v).map(([k])=>k)
                    const clLogs=filtered.filter(l=>l.client_id===cl.id)
                    return (
                      <div key={cl.id} style={{
                        display:'flex',alignItems:'center',gap:10,padding:'8px 16px',
                        borderBottom:i<arr.length-1?'1px solid var(--border)':'none',
                        width:'100%',
                      }}>
                        <div style={{width:28,height:28,borderRadius:'var(--radius)',background:'var(--accent-dim)',
                          display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'var(--accent)',flexShrink:0}}>
                          {cl.name?.slice(0,2).toUpperCase()}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{cl.name}</div>
                          <div style={{display:'flex',gap:4,marginTop:2,flexWrap:'wrap'}}>
                            {active.length===0
                              ? <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>No channels set</span>
                              : active.map(ch=>{
                                  const colors={meta:'#1877f2',google:'#34a853',tiktok:'#f43f5e',snapchat:'#fffc00',applovin:'#8b5cf6'}
                                  return <span key={ch} style={{fontSize:9,fontFamily:'var(--font-mono)',fontWeight:600,padding:'1px 6px',borderRadius:100,background:`${colors[ch]||'#888'}15`,color:colors[ch]||'var(--text-muted)',textTransform:'capitalize'}}>{ch}</span>
                                })
                            }
                          </div>
                        </div>
                        <span style={{fontSize:11,color:clLogs.length>0?'var(--accent)':'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
                          {clLogs.length} change{clLogs.length!==1?'s':''}
                        </span>
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11}}
                          onClick={()=>{setShowAdd(true)}}>
                          + Log
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Log entries grouped by date */}
              {Object.keys(byDate).length===0
                ? <div className="empty-state"><p>No changes logged for this period.</p></div>
                : Object.entries(byDate).map(([date,entries])=>(
                    <div key={date} style={{marginBottom:24}}>
                      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{fmtDate(date)}</div>
                        <div style={{flex:1,height:1,background:'var(--border)'}}/>
                        <span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{entries.length} change{entries.length!==1?'s':''}</span>
                      </div>
                      {entries.map(entry=>(
                        <LogRow key={entry.id} entry={entry} clientMap={clientMap} memberMap={memberMap}
                          canDelete={entry.entered_by===profile?.id||isManagement}
                          onDelete={handleDelete}/>
                      ))}
                    </div>
                  ))
              }
            </>
          )}
      </div>
      {showAdd&&<AddLogModal clients={clients} onClose={()=>setShowAdd(false)} onSave={load}/>}
    </>
  )
}
