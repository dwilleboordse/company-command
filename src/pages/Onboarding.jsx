import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Check, Trash2, ChevronDown, ChevronUp, Edit2 } from 'lucide-react'

const DEFAULT_ITEMS = [
  { category:'Account Access',   item:'Ad account access granted (Meta Business Manager)' },
  { category:'Account Access',   item:'Google Ads access granted' },
  { category:'Account Access',   item:'TikTok Ads Manager access granted' },
  { category:'Account Access',   item:'Brand asset folder shared (logos, fonts, guidelines)' },
  { category:'Account Access',   item:'Website / Shopify access granted' },
  { category:'Strategy',         item:'Kickoff call completed' },
  { category:'Strategy',         item:'Ideal customer profile (ICP) documented' },
  { category:'Strategy',         item:'Competitor research completed' },
  { category:'Strategy',         item:'90-day creative strategy submitted' },
  { category:'Strategy',         item:'First month content plan approved' },
  { category:'Creative',         item:'First batch of creatives briefed' },
  { category:'Creative',         item:'First batch of creatives delivered' },
  { category:'Creative',         item:'Client approved first creatives' },
  { category:'Creative',         item:'Creatives live in ad account' },
  { category:'Tracking',         item:'Pixel / conversion tracking verified' },
  { category:'Tracking',         item:'UTM parameters set up' },
  { category:'Tracking',         item:'Weekly reporting cadence agreed' },
  { category:'Tracking',         item:'First weekly report sent' },
  { category:'Billing',          item:'Contract signed' },
  { category:'Billing',          item:'First invoice sent' },
  { category:'Billing',          item:'Payment received' },
]

const CATEGORY_COLORS = {
  'Account Access': 'var(--accent)',
  'Strategy':       'var(--purple, #7c3aed)',
  'Creative':       '#f59e0b',
  'Tracking':       'var(--green)',
  'Billing':        '#ec4899',
  'Custom':         'var(--text-secondary)',
}

function parseIds(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  try { return JSON.parse(val) } catch { return [] }
}

// ── ADD ITEM MODAL ───────────────────────────────────────────
function AddItemModal({ clientId, allMembers, onClose, onSave, existingCount }) {
  const [item, setItem] = useState('')
  const [category, setCategory] = useState('Custom')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!item.trim()) return
    setSaving(true)
    await supabase.from('onboarding_checklists').insert({
      client_id: clientId, item: item.trim(),
      category, assigned_to: assignedTo||null,
      due_date: dueDate||null, notes,
      sort_order: existingCount, is_done: false,
    })
    onSave(); setSaving(false); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">Add Checklist Item</h2>
        <div className="form-group">
          <label>Task *</label>
          <input value={item} onChange={e=>setItem(e.target.value)} placeholder="e.g. Submit creative brief" autoFocus/>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)}>
              {Object.keys(CATEGORY_COLORS).map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Assign To</label>
            <select value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {allMembers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Due Date</label>
          <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{resize:'vertical'}} placeholder="Optional context..."/>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!item.trim()}>{saving?'Saving...':'Add Item'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── CHECKLIST ITEM ROW ───────────────────────────────────────
function ChecklistItem({ item, allMembers, onToggle, onDelete }) {
  const assignee = allMembers.find(m=>m.id===item.assigned_to)
  const color = CATEGORY_COLORS[item.category]||'var(--text-secondary)'
  const isOverdue = item.due_date && !item.is_done && new Date(item.due_date) < new Date()

  return (
    <div style={{
      display:'flex', alignItems:'flex-start', gap:10, padding:'10px 16px',
      borderBottom:'1px solid var(--border)',
      background: item.is_done ? 'var(--bg)' : 'var(--bg-card)',
      transition:'background 0.15s',
      opacity: item.is_done ? 0.65 : 1,
    }}>
      {/* Checkbox */}
      <button onClick={()=>onToggle(item)}
        style={{
          width:20, height:20, borderRadius:5, border:`2px solid ${item.is_done?'var(--green)':color}`,
          background: item.is_done?'var(--green)':'transparent',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', flexShrink:0, marginTop:1, transition:'all 0.15s'
        }}>
        {item.is_done && <Check size={11} color="#fff" strokeWidth={3}/>}
      </button>

      {/* Content */}
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <span style={{
            fontSize:13, fontWeight:500,
            color: item.is_done ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: item.is_done ? 'line-through' : 'none',
          }}>{item.item}</span>
          <span style={{
            fontSize:9, fontFamily:'var(--font-mono)', fontWeight:600,
            padding:'1px 6px', borderRadius:100, textTransform:'uppercase', letterSpacing:0.5,
            background:`${color}15`, color,
          }}>{item.category}</span>
        </div>
        <div style={{display:'flex', gap:12, marginTop:4, flexWrap:'wrap'}}>
          {assignee && (
            <span style={{fontSize:11, color:'var(--text-muted)'}}>
              → {assignee.full_name}
            </span>
          )}
          {item.due_date && (
            <span style={{fontSize:11, color: isOverdue?'var(--red)':'var(--text-muted)', fontWeight:isOverdue?600:400}}>
              {isOverdue?'⚠ Overdue: ':'Due: '}{new Date(item.due_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
            </span>
          )}
          {item.notes && <span style={{fontSize:11, color:'var(--text-muted)', fontStyle:'italic'}}>{item.notes}</span>}
        </div>
      </div>

      {/* Delete */}
      <button onClick={()=>onDelete(item.id)}
        style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',padding:4,flexShrink:0,opacity:0.5,transition:'opacity 0.12s'}}
        onMouseEnter={e=>e.currentTarget.style.opacity='1'}
        onMouseLeave={e=>e.currentTarget.style.opacity='0.5'}>
        <Trash2 size={13}/>
      </button>
    </div>
  )
}

// ── CLIENT CHECKLIST CARD ────────────────────────────────────
function ClientChecklistCard({ client, allMembers, isManagement }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [seeding, setSeeding] = useState(false)

  useEffect(()=>{ loadItems() }, [client.id])

  async function loadItems() {
    const {data} = await supabase.from('onboarding_checklists')
      .select('*').eq('client_id', client.id).order('sort_order').order('created_at')
    setItems(data||[])
    setLoading(false)
    if ((data||[]).length > 0) setExpanded(true)
  }

  async function seedDefaults() {
    setSeeding(true)
    const inserts = DEFAULT_ITEMS.map((d,i)=>({
      client_id:client.id, item:d.item, category:d.category,
      is_done:false, sort_order:i
    }))
    await supabase.from('onboarding_checklists').insert(inserts)
    await loadItems()
    setExpanded(true)
    setSeeding(false)
  }

  async function toggleItem(item) {
    await supabase.from('onboarding_checklists').update({is_done:!item.is_done}).eq('id',item.id)
    setItems(prev=>prev.map(i=>i.id===item.id?{...i,is_done:!i.is_done}:i))
  }

  async function deleteItem(id) {
    if (!confirm('Remove this checklist item?')) return
    await supabase.from('onboarding_checklists').delete().eq('id',id)
    setItems(prev=>prev.filter(i=>i.id!==id))
  }

  const done = items.filter(i=>i.is_done).length
  const total = items.length
  const pct = total > 0 ? Math.round((done/total)*100) : 0
  const byCategory = items.reduce((acc,i)=>{ if(!acc[i.category])acc[i.category]=[]; acc[i.category].push(i); return acc },{})

  return (
    <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
      {/* Header */}
      <div style={{padding:'14px 18px',cursor:'pointer',borderLeft:`5px solid ${pct===100?'var(--green)':pct>0?'var(--amber)':'var(--border)'}`}}
        onClick={()=>setExpanded(!expanded)}>
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:8}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
              <h3 style={{fontSize:15,fontWeight:700,color:'var(--text-primary)'}}>{client.name}</h3>
              {pct===100
                ? <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--green)',background:'var(--green-dim)',padding:'2px 8px',borderRadius:100,fontWeight:600}}>✓ Complete</span>
                : total>0
                ? <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',background:'var(--bg)',padding:'2px 8px',borderRadius:100}}>{done}/{total} done</span>
                : <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--amber)',background:'var(--amber-dim)',padding:'2px 8px',borderRadius:100}}>No checklist yet</span>
              }
            </div>
            {total>0&&(
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{flex:1,height:5,background:'var(--border)',borderRadius:3,overflow:'hidden',maxWidth:200}}>
                  <div style={{width:`${pct}%`,height:'100%',background:pct===100?'var(--green)':'var(--accent)',borderRadius:3,transition:'width 0.4s ease'}}/>
                </div>
                <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>{pct}%</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 items-center" onClick={e=>e.stopPropagation()}>
            {total===0&&isManagement&&(
              <button className="btn btn-ghost btn-sm" onClick={seedDefaults} disabled={seeding}>
                {seeding?'Adding...':'+ Add Default Checklist'}
              </button>
            )}
            {isManagement&&(
              <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>
                <Plus size={13}/> Add Item
              </button>
            )}
            {expanded?<ChevronUp size={15} color="var(--text-muted)"/>:<ChevronDown size={15} color="var(--text-muted)"/>}
          </div>
        </div>
      </div>

      {/* Checklist body */}
      {expanded&&(
        <div style={{borderTop:'1px solid var(--border)'}}>
          {loading ? (
            <div style={{padding:20,textAlign:'center'}}><div className="spinner" style={{margin:'0 auto'}}/></div>
          ) : total===0 ? (
            <div className="empty-state" style={{padding:'24px 20px'}}>
              <p>No checklist items yet.</p>
              {isManagement&&(
                <button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={seedDefaults} disabled={seeding}>
                  {seeding?'Loading...':'Load Default Onboarding Checklist'}
                </button>
              )}
            </div>
          ) : (
            Object.entries(byCategory).map(([cat, catItems])=>(
              <div key={cat}>
                <div style={{
                  padding:'6px 16px', background:'var(--bg)',
                  borderBottom:'1px solid var(--border)',
                  fontSize:9, fontFamily:'var(--font-mono)', fontWeight:600,
                  color:CATEGORY_COLORS[cat]||'var(--text-muted)', textTransform:'uppercase', letterSpacing:1.5,
                  display:'flex', alignItems:'center', justifyContent:'space-between'
                }}>
                  <span>{cat}</span>
                  <span style={{color:'var(--text-muted)'}}>{catItems.filter(i=>i.is_done).length}/{catItems.length}</span>
                </div>
                {catItems.map(item=>(
                  <ChecklistItem key={item.id} item={item} allMembers={allMembers}
                    onToggle={toggleItem} onDelete={deleteItem}/>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {showAdd&&(
        <AddItemModal clientId={client.id} allMembers={allMembers}
          existingCount={items.length}
          onClose={()=>setShowAdd(false)}
          onSave={()=>{ loadItems() }}/>
      )}
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function Onboarding() {
  const { isManagement } = useAuth()
  const [clients, setClients] = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | incomplete | complete

  useEffect(()=>{ load() },[])

  async function load() {
    setLoading(true)
    const [{data:clientData},{data:memberData}] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active',true).order('name'),
      supabase.from('profiles').select('id,full_name,position').order('full_name'),
    ])
    // Filter archived; athletes see all active clients (they need to action their items)
    const active = (clientData||[]).filter(c=>!c.is_archived)
    setClients(active)
    setAllMembers(memberData||[])
    setLoading(false)
  }

  const filtered = clients.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">Onboarding</h1>
            <p className="page-subtitle">First-month checklist for every active client</p>
          </div>
          <div style={{position:'relative',maxWidth:260}}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search clients..." style={{paddingLeft:12}}/>
          </div>
        </div>
      </div>

      <div className="page-body">
        {loading
          ? <div className="loading-screen" style={{minHeight:200,background:'transparent'}}><div className="spinner"/></div>
          : filtered.map(client=>(
              <ClientChecklistCard key={client.id} client={client}
                allMembers={allMembers} isManagement={isManagement}/>
            ))
        }
        {!loading&&filtered.length===0&&(
          <div className="empty-state"><p>No clients found.</p></div>
        )}
      </div>
    </>
  )
}
