import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus, X } from 'lucide-react'

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
  d.setDate(diff); return d.toISOString().split('T')[0]
}

function avg(entry) {
  if (!entry) return 0
  const vals = SCORE_FIELDS.map(f=>parseFloat(entry[f.key])||0)
  const sum = vals.reduce((a,b)=>a+b,0)
  return vals.some(v=>v>0) ? (sum/vals.filter(v=>v>0).length).toFixed(1) : 0
}

function ScoreBar({ value, max=5 }) {
  const pct = (value/max)*100
  const color = value>=4?'var(--green)':value>=3?'var(--amber)':'var(--red)'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:2, transition:'width 0.4s ease' }}/>
      </div>
      <span style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--text-secondary)', width:20, textAlign:'right' }}>{value||'—'}</span>
    </div>
  )
}

function RiskBadge({ risk }) {
  if (!risk) return null
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:100, fontSize:11, fontWeight:600, background:RISK_BG[risk], color:RISK_COLORS[risk], fontFamily:'var(--font-mono)', letterSpacing:0.5 }}>
      {risk}
    </span>
  )
}

function AddClientModal({ onClose, onSave }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('clients').insert({ name: name.trim() })
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">Add Client</h2>
        <div className="form-group">
          <label>Client Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSave()} placeholder="e.g. Abriga" autoFocus />
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Adding...':'Add Client'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function EntryModal({ client, existing, onClose, onSave }) {
  const { profile } = useAuth()
  const weekStart = getMonday()
  const [form, setForm] = useState({
    performance_health: existing?.performance_health||0,
    creative_strategy: existing?.creative_strategy||0,
    execution_delivery: existing?.execution_delivery||0,
    strategic_alignment: existing?.strategic_alignment||0,
    communication: existing?.communication||0,
    churn_risk: existing?.churn_risk||'Low',
    notes: existing?.notes||'',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('client_health_entries').upsert({
      client_id: client.id, week_start: weekStart, ...form,
      entered_by: profile?.id, updated_at: new Date().toISOString()
    }, { onConflict:'client_id,week_start' })
    onSave(); setSaving(false); onClose()
  }

  const score = avg(form)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:520 }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title" style={{ marginBottom:0 }}>{client.name}</h2>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, letterSpacing:'-0.03em', color:score>=4?'var(--green)':score>=3?'var(--amber)':'var(--red)' }}>{score}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>avg score</div>
          </div>
        </div>

        <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:16 }}>
          Week of {new Date(weekStart+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
        </div>

        {SCORE_FIELDS.map(f => (
          <div key={f.key} className="form-group">
            <label>{f.label}</label>
            <div style={{ display:'flex', gap:8 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={()=>setForm({...form,[f.key]:n})}
                  style={{ flex:1, padding:'10px 0', borderRadius:'var(--radius)', border:`2px solid ${form[f.key]===n?'var(--accent)':'var(--border)'}`, background:form[f.key]===n?'var(--accent-dim)':'var(--bg-input)', color:form[f.key]===n?'var(--accent)':'var(--text-secondary)', fontFamily:'var(--font-display)', fontWeight:700, fontSize:15, cursor:'pointer', transition:'all 0.15s' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="form-group">
          <label>Churn Risk</label>
          <div style={{ display:'flex', gap:8 }}>
            {['Low','Medium','High','Leaving'].map(r => (
              <button key={r} onClick={()=>setForm({...form,churn_risk:r})}
                style={{ flex:1, padding:'8px 4px', borderRadius:'var(--radius)', border:`2px solid ${form.churn_risk===r?RISK_COLORS[r]:'var(--border)'}`, background:form.churn_risk===r?RISK_BG[r]:'var(--bg-input)', color:form.churn_risk===r?RISK_COLORS[r]:'var(--text-secondary)', fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.15s', fontFamily:'var(--font-mono)' }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Notes / Actions</label>
          <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={3} placeholder="CS sentiment, blockers, actions taken..." style={{ resize:'vertical' }}/>
        </div>

        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':'Save Entry'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function ClientCard({ client, latestEntry, history, onEdit, onDelete, isManagement }) {
  const [expanded, setExpanded] = useState(false)
  const score = parseFloat(avg(latestEntry))
  const risk = latestEntry?.churn_risk || null
  const prevEntry = history?.[1]
  const prevScore = parseFloat(avg(prevEntry))
  const trend = history?.length>1 ? score-prevScore : null

  const radarData = SCORE_FIELDS.map(f => ({
    subject: f.short,
    value: parseFloat(latestEntry?.[f.key])||0,
    fullMark: 5
  }))

  const chartData = history?.slice().reverse().map(e => ({
    week: e.week_start?.slice(5),
    score: parseFloat(avg(e)),
    ...Object.fromEntries(SCORE_FIELDS.map(f=>[f.short, parseFloat(e[f.key])||0]))
  }))

  return (
    <div className="card" style={{ padding:0, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'14px 16px', borderLeft:`4px solid ${risk?RISK_COLORS[risk]:'var(--border)'}`, cursor:'pointer' }} onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:14 }}>{client.name}</div>
              {latestEntry?.notes && (
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{latestEntry.notes}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {risk && <RiskBadge risk={risk}/>}
            {latestEntry ? (
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:700, letterSpacing:'-0.03em', color:score>=4?'var(--green)':score>=3?'var(--amber)':'var(--red)' }}>{score}</div>
                {trend!==null && (
                  <div style={{ fontSize:10, color:trend>0?'var(--green)':trend<0?'var(--red)':'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:2 }}>
                    {trend>0?<TrendingUp size={10}/>:trend<0?<TrendingDown size={10}/>:<Minus size={10}/>}
                    {trend>0?'+':''}{trend.toFixed(1)}
                  </div>
                )}
              </div>
            ) : (
              <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>No data</span>
            )}
            <div className="flex gap-1">
              <button className="btn btn-primary btn-sm" onClick={e=>{e.stopPropagation();onEdit()}} style={{ fontSize:11 }}>
                {latestEntry?.week_start===getMonday()?'Update':'Log Week'}
              </button>
              {isManagement && (
                <button className="btn btn-danger btn-icon btn-sm" onClick={e=>{e.stopPropagation();onDelete()}}><Trash2 size={12}/></button>
              )}
            </div>
            {expanded?<ChevronUp size={15} color="var(--text-muted)"/>:<ChevronDown size={15} color="var(--text-muted)"/>}
          </div>
        </div>

        {/* Score bars always visible */}
        {latestEntry && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginTop:12 }}>
            {SCORE_FIELDS.map(f=>(
              <div key={f.key}>
                <div style={{ fontSize:9, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase', letterSpacing:0.5 }}>{f.short}</div>
                <ScoreBar value={parseFloat(latestEntry[f.key])||0}/>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expanded: chart + radar */}
      {expanded && history?.length>0 && (
        <div style={{ padding:'16px', borderTop:'1px solid var(--border)', background:'var(--bg)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>
            {/* Trend chart */}
            <div>
              <div className="card-label mb-2">Average Score — Weekly Trend</div>
              {chartData?.length>1 ? (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="week" tick={{fill:'#3d526e',fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis domain={[0,5]} tick={{fill:'#3d526e',fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:'#0e1420',border:'1px solid #1e2d47',borderRadius:8,fontSize:11}}/>
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{fill:'#3b82f6',r:3}}/>
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-muted text-sm">Log at least 2 weeks to see trend.</p>}
            </div>
            {/* Radar */}
            <div>
              <div className="card-label mb-2">Current Week Breakdown</div>
              <ResponsiveContainer width="100%" height={140}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)"/>
                  <PolarAngleAxis dataKey="subject" tick={{fill:'#7a8ba8',fontSize:10}}/>
                  <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {latestEntry?.notes && (
            <div style={{ marginTop:12, padding:'10px 12px', background:'var(--bg-card)', borderRadius:'var(--radius)', borderLeft:'3px solid var(--border-light)' }}>
              <div className="card-label" style={{ marginBottom:4 }}>Notes</div>
              <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5 }}>{latestEntry.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Clients() {
  const { isManagement, isCEO, profile } = useAuth()
  const [clients, setClients] = useState([])
  const [entries, setEntries] = useState({})   // clientId -> [entries sorted desc]
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editClient, setEditClient] = useState(null)
  const [riskFilter, setRiskFilter] = useState('all')
  const [sortBy, setSortBy] = useState('risk') // 'risk' | 'score' | 'name'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: clientData } = await supabase.from('clients').select('*').eq('is_active',true).order('name')
    setClients(clientData||[])

    if (clientData?.length) {
      const ids = clientData.map(c=>c.id)
      const { data: entryData } = await supabase.from('client_health_entries').select('*').in('client_id',ids).order('week_start',{ascending:false})
      const map = {}
      entryData?.forEach(e => {
        if (!map[e.client_id]) map[e.client_id] = []
        map[e.client_id].push(e)
      })
      setEntries(map)
    }
    setLoading(false)
  }

  async function handleDelete(clientId) {
    if (!confirm('Archive this client?')) return
    await supabase.from('clients').update({ is_active:false }).eq('id',clientId)
    setClients(prev=>prev.filter(c=>c.id!==clientId))
  }

  if (!isManagement) return (
    <div className="page-body" style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh' }}>
      <p className="text-muted">Management access only.</p>
    </div>
  )

  // Risk order for sorting
  const RISK_ORDER = { Leaving:0, High:1, Medium:2, Low:3 }

  let filtered = clients.filter(c => {
    const latest = entries[c.id]?.[0]
    if (riskFilter==='all') return true
    return latest?.churn_risk===riskFilter || (!latest?.churn_risk&&riskFilter==='Low')
  })

  filtered = [...filtered].sort((a,b) => {
    const ea=entries[a.id]?.[0], eb=entries[b.id]?.[0]
    if (sortBy==='risk') {
      const ra=RISK_ORDER[ea?.churn_risk]??3, rb=RISK_ORDER[eb?.churn_risk]??3
      return ra-rb
    }
    if (sortBy==='score') return parseFloat(avg(eb))-parseFloat(avg(ea))
    return a.name.localeCompare(b.name)
  })

  // Summary stats
  const withEntries = clients.filter(c=>entries[c.id]?.length>0)
  const highRisk = withEntries.filter(c=>['High','Leaving'].includes(entries[c.id]?.[0]?.churn_risk)).length
  const avgScore = withEntries.length ? (withEntries.reduce((s,c)=>s+parseFloat(avg(entries[c.id]?.[0])),0)/withEntries.length).toFixed(1) : '—'
  const leaving = clients.filter(c=>entries[c.id]?.[0]?.churn_risk==='Leaving').length

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Client Health</h1>
            <p className="page-subtitle">Weekly churn risk assessment and relationship tracking</p>
          </div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> Add Client</button>
        </div>
      </div>

      <div className="page-body">
        {/* Summary */}
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">Total Clients</div><div className="stat-box-value">{clients.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Avg Score</div><div className="stat-box-value text-accent">{avgScore}</div></div>
          <div className="stat-box"><div className="stat-box-label">High Risk</div><div className="stat-box-value text-red">{highRisk}</div></div>
          <div className="stat-box"><div className="stat-box-label">Leaving</div><div className="stat-box-value" style={{ color:'#7c3aed' }}>{leaving}</div></div>
        </div>

        {/* Risk distribution bar */}
        {withEntries.length > 0 && (
          <div className="card mb-6">
            <div className="card-label mb-3">Risk Distribution</div>
            <div style={{ display:'flex', gap:0, borderRadius:6, overflow:'hidden', height:12 }}>
              {['Low','Medium','High','Leaving'].map(r => {
                const count = withEntries.filter(c=>entries[c.id]?.[0]?.churn_risk===r).length
                const pct = (count/withEntries.length)*100
                return pct>0 ? <div key={r} style={{ width:`${pct}%`, background:RISK_COLORS[r], transition:'width 0.4s' }} title={`${r}: ${count}`}/> : null
              })}
            </div>
            <div className="flex gap-4 mt-3">
              {['Low','Medium','High','Leaving'].map(r => {
                const count = withEntries.filter(c=>(entries[c.id]?.[0]?.churn_risk||'Low')===r).length
                return (
                  <div key={r} className="flex items-center gap-2">
                    <div style={{ width:8, height:8, borderRadius:'50%', background:RISK_COLORS[r] }}/>
                    <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>{r}: <strong>{count}</strong></span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="tabs" style={{ border:'none', marginBottom:0 }}>
            {['all','Low','Medium','High','Leaving'].map(r=>(
              <button key={r} className={`tab ${riskFilter===r?'active':''}`} onClick={()=>setRiskFilter(r)}
                style={{ color:riskFilter===r&&r!=='all'?RISK_COLORS[r]:undefined }}>
                {r==='all'?'All':r}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ width:'auto', marginLeft:'auto', fontSize:12 }}>
            <option value="risk">Sort by Risk</option>
            <option value="score">Sort by Score</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>

        {loading ? <div className="loading-screen" style={{ minHeight:200 }}><div className="spinner"/></div>
          : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {filtered.map(client => (
                <ClientCard
                  key={client.id}
                  client={client}
                  latestEntry={entries[client.id]?.[0]}
                  history={entries[client.id]}
                  onEdit={()=>setEditClient(client)}
                  onDelete={()=>handleDelete(client.id)}
                  isManagement={isManagement}
                />
              ))}
            </div>
          )}
      </div>

      {showAdd && <AddClientModal onClose={()=>setShowAdd(false)} onSave={load}/>}
      {editClient && (
        <EntryModal
          client={editClient}
          existing={entries[editClient.id]?.[0]?.week_start===getMonday()?entries[editClient.id][0]:null}
          onClose={()=>setEditClient(null)}
          onSave={load}
        />
      )}
    </>
  )
}
