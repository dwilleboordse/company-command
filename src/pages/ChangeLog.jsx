import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

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

  useEffect(()=>{ if(profile?.id) load() },[profile?.id])

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const [{ data:logData },{ data:clientData },{ data:memberData }] = await Promise.all([
      supabase.from('change_log').select('*').order('log_date',{ascending:false}).order('created_at',{ascending:false}).limit(200),
      supabase.from('clients').select('id,name,cs_ids,mb_ids,editor_ids,designer_ids,ugc_ids,assigned_cs_id').eq('is_active',true).order('name'),
      supabase.from('profiles').select('id,full_name,position').order('full_name'),
    ])
    setLogs(logData||[])
    // Athletes only see their assigned clients
    let filteredClients = clientData||[]
    if (!isManagement && profile?.id) {
      filteredClients = filteredClients.filter(cl => {
        const parse = (v) => Array.isArray(v)?v:(v?JSON.parse(v):[])
        return parse(cl.cs_ids).includes(profile.id) ||
               parse(cl.mb_ids).includes(profile.id) ||
               parse(cl.editor_ids||'[]').includes(profile.id) ||
               parse(cl.designer_ids||'[]').includes(profile.id) ||
               parse(cl.ugc_ids||'[]').includes(profile.id) ||
               cl.assigned_cs_id === profile.id
      })
    }
    setClients(filteredClients)
    setMembers(memberData||[])
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this log entry?')) return
    await supabase.from('change_log').delete().eq('id',id)
    setLogs(prev=>prev.filter(l=>l.id!==id))
  }

  const clientMap = Object.fromEntries(clients.map(c=>[c.id,c]))
  const memberMap = Object.fromEntries(members.map(m=>[m.id,m]))
  const mediaBuyers = members.filter(m=>m.position==='media_buyer')

  // Date range
  function getDateRange() {
    const now = new Date()
    if (dateFilter==='today') {
      const t=todayStr(); return {from:t,to:t}
    }
    if (dateFilter==='week') {
      const mon=new Date(now); const d=mon.getDay(); mon.setDate(mon.getDate()-d+(d===0?-6:1))
      const fri=new Date(mon); fri.setDate(mon.getDate()+6)
      return {from:`${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`,
              to:`${fri.getFullYear()}-${String(fri.getMonth()+1).padStart(2,'0')}-${String(fri.getDate()).padStart(2,'0')}`}
    }
    if (dateFilter==='month') {
      const from=new Date(now.getFullYear(),now.getMonth(),1)
      return {from:`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-01`,to:todayStr()}
    }
    return {from:'2000-01-01',to:'9999-12-31'}
  }

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
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> Log Change</button>
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
          : Object.keys(byDate).length===0 ? <div className="empty-state"><p>No changes logged for this filter.</p><button className="btn btn-primary btn-sm" style={{marginTop:12}} onClick={()=>setShowAdd(true)}>Log First Change</button></div>
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
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ))}
      </div>
      {showAdd&&<AddLogModal clients={clients} onClose={()=>setShowAdd(false)} onSave={load}/>}
    </>
  )
}
