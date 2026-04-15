import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus, Check, X } from 'lucide-react'

const RISK_COLORS = { Low:'var(--green)', Medium:'var(--amber)', High:'var(--red)', Leaving:'#7c3aed' }
const RISK_BG = { Low:'var(--green-dim)', Medium:'var(--amber-dim)', High:'var(--red-dim)', Leaving:'rgba(124,58,237,0.12)' }
const SCORE_FIELDS = [
  { key:'performance_health', label:'Performance & Results', short:'Perf' },
  { key:'creative_strategy', label:'Creative Strategy Impact', short:'Creative' },
  { key:'execution_delivery', label:'Execution & Delivery', short:'Delivery' },
  { key:'strategic_alignment', label:'Strategic Alignment', short:'Strategy' },
  { key:'communication', label:'Communication & Relationship', short:'Comms' },
]

function getMonday() {
  const d=new Date(),day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1)
  const m=new Date(d);m.setDate(diff);m.setHours(0,0,0,0);return m
}
function fmt(d) { return d instanceof Date?d.toISOString().split('T')[0]:d }
function weekStart() { return fmt(getMonday()) }

function avg(entry) {
  if (!entry) return 0
  const vals=SCORE_FIELDS.map(f=>parseFloat(entry[f.key])||0)
  return vals.some(v=>v>0)?(vals.reduce((a,b)=>a+b,0)/vals.filter(v=>v>0).length).toFixed(1):0
}

function ScoreBar({ value }) {
  const pct=(value/5)*100
  const color=value>=4?'var(--green)':value>=3?'var(--amber)':'var(--red)'
  return (
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <div style={{flex:1,height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
        <div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:2,transition:'width 0.4s ease'}}/>
      </div>
      <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-secondary)',width:20,textAlign:'right'}}>{value||'—'}</span>
    </div>
  )
}

function RiskBadge({ risk }) {
  if (!risk) return null
  return <span style={{display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:100,fontSize:11,fontWeight:600,background:RISK_BG[risk],color:RISK_COLORS[risk],fontFamily:'var(--font-mono)'}}>{risk}</span>
}

// ── SCORE ENTRY MODAL ────────────────────────────────────────
function EntryModal({ client, existing, onClose, onSave }) {
  const { profile } = useAuth()
  const ws = weekStart()
  const [form, setForm] = useState({
    performance_health:existing?.performance_health||0,
    creative_strategy:existing?.creative_strategy||0,
    execution_delivery:existing?.execution_delivery||0,
    strategic_alignment:existing?.strategic_alignment||0,
    communication:existing?.communication||0,
    churn_risk:existing?.churn_risk||'Low',
    notes:existing?.notes||'',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('client_health_entries').upsert({
      client_id:client.id, week_start:ws, ...form,
      entered_by:profile?.id, updated_at:new Date().toISOString()
    }, { onConflict:'client_id,week_start' })
    onSave(); setSaving(false); onClose()
  }

  const score=avg(form)
  const status=score>=4?getStatus('green'):score>=3?getStatus('amber'):getStatus('red')

  function getStatus(s) { return {green:{color:'var(--green)',bg:'var(--green-dim)'},amber:{color:'var(--amber)',bg:'var(--amber-dim)'},red:{color:'var(--red)',bg:'var(--red-dim)'}}[s] }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title" style={{marginBottom:0}}>{client.name} — Score</h2>
          {score>0&&<div style={{textAlign:'right'}}>
            <div style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:700,letterSpacing:'-0.03em',color:score>=4?'var(--green)':score>=3?'var(--amber)':'var(--red)'}}>{score}</div>
            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>avg score</div>
          </div>}
        </div>
        <p style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:16}}>Week of {ws} · Scores saved first, then add actions separately</p>

        {SCORE_FIELDS.map(f=>(
          <div key={f.key} className="form-group">
            <label>{f.label}</label>
            <div style={{display:'flex',gap:8}}>
              {[1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setForm({...form,[f.key]:n})}
                  style={{flex:1,padding:'10px 0',borderRadius:'var(--radius)',border:`2px solid ${form[f.key]===n?'var(--accent)':'var(--border)'}`,background:form[f.key]===n?'var(--accent-dim)':'var(--bg-input)',color:form[f.key]===n?'var(--accent)':'var(--text-secondary)',fontFamily:'var(--font-display)',fontWeight:700,fontSize:15,cursor:'pointer',transition:'all 0.15s'}}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="form-group">
          <label>Churn Risk</label>
          <div style={{display:'flex',gap:8}}>
            {['Low','Medium','High','Leaving'].map(r=>(
              <button key={r} onClick={()=>setForm({...form,churn_risk:r})}
                style={{flex:1,padding:'8px 4px',borderRadius:'var(--radius)',border:`2px solid ${form.churn_risk===r?RISK_COLORS[r]:'var(--border)'}`,background:form.churn_risk===r?RISK_BG[r]:'var(--bg-input)',color:form.churn_risk===r?RISK_COLORS[r]:'var(--text-secondary)',fontSize:11,fontWeight:600,cursor:'pointer',transition:'all 0.15s',fontFamily:'var(--font-mono)'}}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Notes / Observations</label>
          <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={3} placeholder="CS sentiment, client feedback, context..." style={{resize:'vertical'}}/>
        </div>

        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':'Save Scores'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── ACTIONS PANEL ────────────────────────────────────────────
function ActionsPanel({ client, entry }) {
  const { profile } = useAuth()
  const [actions, setActions] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ action_text:'', owner:'', due_date:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (entry?.id) load() }, [entry?.id])

  async function load() {
    const { data } = await supabase.from('client_actions').select('*').eq('health_entry_id', entry.id).order('created_at')
    setActions(data||[])
    setLoaded(true)
  }

  async function addAction() {
    if (!form.action_text.trim()) return
    setSaving(true)
    await supabase.from('client_actions').insert({
      client_id:client.id, health_entry_id:entry.id,
      action_text:form.action_text, owner:form.owner||null, due_date:form.due_date||null,
      created_by:profile?.id
    })
    setForm({action_text:'',owner:'',due_date:''})
    setSaving(false); setAdding(false); load()
  }

  async function toggleDone(id, isDone) {
    await supabase.from('client_actions').update({is_done:!isDone}).eq('id',id)
    setActions(prev=>prev.map(a=>a.id===id?{...a,is_done:!isDone}:a))
  }

  async function deleteAction(id) {
    await supabase.from('client_actions').delete().eq('id',id)
    setActions(prev=>prev.filter(a=>a.id!==id))
  }

  async function updateAction(id, text) {
    await supabase.from('client_actions').update({action_text:text}).eq('id',id)
    setActions(prev=>prev.map(a=>a.id===id?{...a,action_text:text}:a))
  }

  if (!entry) return null

  return (
    <div style={{padding:'14px 16px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
      <div className="flex items-center justify-between mb-3">
        <div className="card-label" style={{marginBottom:0}}>Actions to Improve</div>
        <button className="btn btn-primary btn-sm" onClick={()=>setAdding(!adding)}>
          <Plus size={12}/> Add Action
        </button>
      </div>

      {adding && (
        <div className="card mb-3" style={{padding:14}}>
          <div className="form-group"><label>Action</label>
            <input value={form.action_text} onChange={e=>setForm({...form,action_text:e.target.value})} placeholder="What needs to happen?" autoFocus onKeyDown={e=>e.key==='Enter'&&addAction()}/>
          </div>
          <div className="grid-2">
            <div className="form-group"><label>Owner</label><input value={form.owner} onChange={e=>setForm({...form,owner:e.target.value})} placeholder="Who owns this?"/></div>
            <div className="form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={addAction} disabled={saving}>{saving?'Saving...':'Add'}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {actions.length===0&&!adding&&<p style={{fontSize:12,color:'var(--text-muted)'}}>No actions logged yet. Add actions to track improvements.</p>}

      {actions.map(action=>(
        <ActionRow key={action.id} action={action} onToggle={toggleDone} onDelete={deleteAction} onUpdate={updateAction}/>
      ))}
    </div>
  )
}

function ActionRow({ action, onToggle, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(action.action_text)

  return (
    <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
      <button onClick={()=>onToggle(action.id,action.is_done)} style={{background:'none',border:'none',cursor:'pointer',marginTop:1,flexShrink:0}}>
        {action.is_done
          ? <Check size={16} color="var(--green)"/>
          : <div style={{width:16,height:16,borderRadius:'50%',border:'2px solid var(--border)'}}/>
        }
      </button>
      <div style={{flex:1,minWidth:0}}>
        {editing ? (
          <div className="flex gap-2">
            <input value={text} onChange={e=>setText(e.target.value)} style={{fontSize:13,padding:'3px 8px'}} autoFocus
              onKeyDown={e=>{if(e.key==='Enter'){onUpdate(action.id,text);setEditing(false)}if(e.key==='Escape')setEditing(false)}}/>
            <button className="btn btn-primary btn-icon btn-sm" onClick={()=>{onUpdate(action.id,text);setEditing(false)}}><Check size={12}/></button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setEditing(false)}><X size={12}/></button>
          </div>
        ):(
          <div>
            <span style={{fontSize:13,textDecoration:action.is_done?'line-through':'none',color:action.is_done?'var(--text-muted)':'var(--text-primary)'}}>{action.action_text}</span>
            {(action.owner||action.due_date)&&(
              <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginTop:2}}>
                {action.owner&&<span>Owner: {action.owner}</span>}
                {action.owner&&action.due_date&&<span> · </span>}
                {action.due_date&&<span>Due: {new Date(action.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-1" style={{flexShrink:0}}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setEditing(true)}><Edit2 size={11}/></button>
        <button className="btn btn-danger btn-icon btn-sm" onClick={()=>onDelete(action.id)}><Trash2 size={11}/></button>
      </div>
    </div>
  )
}

// ── CLIENT CARD ──────────────────────────────────────────────
function ClientCard({ client, latestEntry, history, onEdit, onDelete, isManagement }) {
  const [expanded, setExpanded] = useState(false)
  const score=parseFloat(avg(latestEntry))
  const risk=latestEntry?.churn_risk||null
  const prevEntry=history?.[1]
  const prevScore=parseFloat(avg(prevEntry))
  const trend=history?.length>1?score-prevScore:null
  const radarData=SCORE_FIELDS.map(f=>({subject:f.short,value:parseFloat(latestEntry?.[f.key])||0,fullMark:5}))
  const chartData=history?.slice().reverse().map(e=>({week:e.week_start?.slice(5),score:parseFloat(avg(e))}))

  return (
    <div className="card" style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'14px 16px',borderLeft:`4px solid ${risk?RISK_COLORS[risk]:'var(--border)'}`,cursor:'pointer'}} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          <div className="flex items-center gap-3" style={{flex:1}}>
            <div>
              <div style={{fontFamily:'var(--font-display)',fontWeight:600,fontSize:14}}>{client.name}</div>
              {latestEntry?.notes&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{latestEntry.notes}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3" style={{flexShrink:0}}>
            {risk&&<RiskBadge risk={risk}/>}
            {latestEntry?(
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:22,fontWeight:700,letterSpacing:'-0.03em',color:score>=4?'var(--green)':score>=3?'var(--amber)':'var(--red)'}}>{score}</div>
                {trend!==null&&<div style={{fontSize:10,color:trend>0?'var(--green)':trend<0?'var(--red)':'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:2}}>
                  {trend>0?<TrendingUp size={10}/>:trend<0?<TrendingDown size={10}/>:<Minus size={10}/>}
                  {trend>0?'+':''}{trend.toFixed(1)}
                </div>}
              </div>
            ):<span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>No data</span>}
            <div className="flex gap-1">
              <button className="btn btn-primary btn-sm" onClick={e=>{e.stopPropagation();onEdit()}} style={{fontSize:11}}>
                {latestEntry?.week_start===weekStart()?'Update':'Log Week'}
              </button>
              {isManagement&&<button className="btn btn-danger btn-icon btn-sm" onClick={e=>{e.stopPropagation();onDelete()}}><Trash2 size={12}/></button>}
            </div>
            {expanded?<ChevronUp size={15} color="var(--text-muted)"/>:<ChevronDown size={15} color="var(--text-muted)"/>}
          </div>
        </div>
        {latestEntry&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginTop:12}}>
            {SCORE_FIELDS.map(f=>(
              <div key={f.key}>
                <div style={{fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:4,textTransform:'uppercase',letterSpacing:0.5}}>{f.short}</div>
                <ScoreBar value={parseFloat(latestEntry[f.key])||0}/>
              </div>
            ))}
          </div>
        )}
      </div>

      {expanded&&(
        <>
          <div style={{padding:'16px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:16}}>
              <div>
                <div className="card-label mb-2">Score Trend</div>
                {chartData?.length>1?(
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="week" tick={{fill:'#3d526e',fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis domain={[0,5]} tick={{fill:'#3d526e',fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{background:'#0e1420',border:'1px solid #1e2d47',borderRadius:8,fontSize:11}}/>
                      <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{fill:'#3b82f6',r:3}}/>
                    </LineChart>
                  </ResponsiveContainer>
                ):<p className="text-muted text-sm">Log 2+ weeks to see trend.</p>}
              </div>
              <div>
                <div className="card-label mb-2">This Week</div>
                <ResponsiveContainer width="100%" height={130}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)"/>
                    <PolarAngleAxis dataKey="subject" tick={{fill:'#7a8ba8',fontSize:10}}/>
                    <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2}/>
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <ActionsPanel client={client} entry={latestEntry}/>
        </>
      )}
    </div>
  )
}

// ── ADD CLIENT ───────────────────────────────────────────────
function AddClientModal({ onClose, onSave }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!name.trim()) return; setSaving(true)
    await supabase.from('clients').insert({ name: name.trim() })
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">Add Client</h2>
        <div className="form-group"><label>Client Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSave()} placeholder="e.g. Abriga" autoFocus/>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Adding...':'Add'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Clients() {
  const { isManagement } = useAuth()
  const [clients, setClients] = useState([])
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editClient, setEditClient] = useState(null)
  const [riskFilter, setRiskFilter] = useState('all')
  const [sortBy, setSortBy] = useState('risk')

  useEffect(()=>{load()},[])

  async function load() {
    setLoading(true)
    const {data:clientData}=await supabase.from('clients').select('*').eq('is_active',true).order('name').or('is_archived.is.null,is_archived.eq.false')
    setClients(clientData||[])
    if (clientData?.length) {
      const {data:entryData}=await supabase.from('client_health_entries').select('*').in('client_id',clientData.map(c=>c.id)).order('week_start',{ascending:false})
      const map={}; entryData?.forEach(e=>{if (!map[e.client_id])map[e.client_id]=[];map[e.client_id].push(e)})
      setEntries(map)
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Archive this client?')) return
    await supabase.from('clients').update({is_active:false}).eq('id',id)
    setClients(prev=>prev.filter(c=>c.id!==id))
  }

  if (!isManagement) return <div className="page-body" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}><p className="text-muted">Management access only.</p></div>

  const RISK_ORDER={Leaving:0,High:1,Medium:2,Low:3}
  let filtered=clients.filter(c=>{
    const e=entries[c.id]?.[0]
    if (riskFilter==='all') return true
    return (e?.churn_risk||'Low')===riskFilter
  }).sort((a,b)=>{
    const ea=entries[a.id]?.[0],eb=entries[b.id]?.[0]
    if (sortBy==='risk') return (RISK_ORDER[ea?.churn_risk]??3)-(RISK_ORDER[eb?.churn_risk]??3)
    if (sortBy==='score') return parseFloat(avg(eb))-parseFloat(avg(ea))
    return a.name.localeCompare(b.name)
  })

  const withEntries=clients.filter(c=>entries[c.id]?.length>0)
  const highRisk=withEntries.filter(c=>['High','Leaving'].includes(entries[c.id]?.[0]?.churn_risk)).length
  const avgScore=withEntries.length?(withEntries.reduce((s,c)=>s+parseFloat(avg(entries[c.id]?.[0])),0)/withEntries.length).toFixed(1):'—'
  const leaving=clients.filter(c=>entries[c.id]?.[0]?.churn_risk==='Leaving').length

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div><h1 className="page-title">Client Health</h1><p className="page-subtitle">Weekly churn risk assessment, scoring, and action tracking</p></div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> Add Client</button>
        </div>
      </div>
      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">Total Clients</div><div className="stat-box-value">{clients.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Avg Score</div><div className="stat-box-value text-accent">{avgScore}</div></div>
          <div className="stat-box"><div className="stat-box-label">High Risk</div><div className="stat-box-value text-red">{highRisk}</div></div>
          <div className="stat-box"><div className="stat-box-label">Leaving</div><div className="stat-box-value" style={{color:'#7c3aed'}}>{leaving}</div></div>
        </div>

        {withEntries.length>0&&(
          <div className="card mb-4">
            <div className="card-label mb-2">Risk Distribution</div>
            <div style={{display:'flex',gap:0,borderRadius:6,overflow:'hidden',height:10}}>
              {['Low','Medium','High','Leaving'].map(r=>{
                const count=withEntries.filter(c=>(entries[c.id]?.[0]?.churn_risk||'Low')===r).length
                const pct=(count/withEntries.length)*100
                return pct>0?<div key={r} style={{width:`${pct}%`,background:RISK_COLORS[r],transition:'width 0.4s'}} title={`${r}: ${count}`}/>:null
              })}
            </div>
            <div className="flex gap-4 mt-3">
              {['Low','Medium','High','Leaving'].map(r=>{
                const count=withEntries.filter(c=>(entries[c.id]?.[0]?.churn_risk||'Low')===r).length
                return <div key={r} className="flex items-center gap-2"><div style={{width:8,height:8,borderRadius:'50%',background:RISK_COLORS[r]}}/><span style={{fontSize:11,color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>{r}: <strong>{count}</strong></span></div>
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-4" style={{flexWrap:'wrap'}}>
          <div className="tabs" style={{border:'none',marginBottom:0}}>
            {['all','Low','Medium','High','Leaving'].map(r=>(
              <button key={r} className={`tab ${riskFilter===r?'active':''}`} onClick={()=>setRiskFilter(r)}
                style={{color:riskFilter===r&&r!=='all'?RISK_COLORS[r]:undefined}}>{r==='all'?'All':r}</button>
            ))}
          </div>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{width:'auto',marginLeft:'auto',fontSize:12}}>
            <option value="risk">Sort by Risk</option>
            <option value="score">Sort by Score</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>

        {loading?<div className="loading-screen" style={{minHeight:200}}><div className="spinner"/></div>:(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {filtered.map(client=>(
              <ClientCard key={client.id} client={client} latestEntry={entries[client.id]?.[0]} history={entries[client.id]}
                onEdit={()=>setEditClient(client)} onDelete={()=>handleDelete(client.id)} isManagement={isManagement}/>
            ))}
          </div>
        )}
      </div>
      {showAdd&&<AddClientModal onClose={()=>setShowAdd(false)} onSave={load}/>}
      {editClient&&<EntryModal client={editClient} existing={entries[editClient.id]?.[0]?.week_start===weekStart()?entries[editClient.id][0]:null} onClose={()=>setEditClient(null)} onSave={load}/>}
    </>
  )
}
