import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Search, Archive, Edit2, LayoutGrid, LayoutList, ChevronDown, ChevronUp } from 'lucide-react'

function parseIds(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  try { return JSON.parse(val) } catch { return [] }
}
function initials(name='') {
  return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?'
}

const CHANNELS = ['meta','google','tiktok','snapchat','applovin']
const CHANNEL_LABELS = {meta:'Meta',google:'Google',tiktok:'TikTok',snapchat:'Snapchat',applovin:'Applovin'}
const CHANNEL_COLORS = {meta:'#1877f2',google:'#34a853',tiktok:'#010101',snapchat:'#fffc00',applovin:'#e8473f'}

const ROLE_GROUPS = [
  { key:'cs_ids',       label:'Creative Strategist', position:'creative_strategist', color:'var(--green)' },
  { key:'mb_ids',       label:'Media Buyer',          position:'media_buyer',         color:'var(--accent)' },
  { key:'editor_ids',   label:'Editor',               position:'editor',              color:'#8b5cf6' },
  { key:'designer_ids', label:'Designer',             position:'designer',            color:'#ec4899' },
  { key:'ugc_ids',      label:'UGC Manager',          position:'ugc_manager',         color:'#f59e0b' },
]

// ── MEMBER PILL ──────────────────────────────────────────────
function MemberPill({ member, color }) {
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:100,
      background:`${color}12`,border:`1px solid ${color}30`,fontSize:11,color,fontWeight:500}}>
      <span style={{width:16,height:16,borderRadius:'50%',background:`${color}20`,
        display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:7,fontWeight:700,color}}>
        {initials(member.full_name)}
      </span>
      {member.full_name}
    </span>
  )
}

// ── MULTI-SELECT DROPDOWN ────────────────────────────────────
function MultiSelect({ label, ids, members, onChange, color }) {
  const [open, setOpen] = useState(false)
  const selected = members.filter(m=>ids.includes(m.id))
  return (
    <div style={{position:'relative'}}>
      <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
        textTransform:'uppercase',letterSpacing:1,marginBottom:4,fontWeight:600}}>{label}</div>
      <div onClick={()=>setOpen(!open)}
        style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',cursor:'pointer',
          padding:'6px 10px',borderRadius:'var(--radius)',
          border:`1.5px solid ${open?color:'var(--border)'}`,
          background:'var(--bg-input)',minHeight:34,transition:'border-color 0.12s'}}>
        {selected.length===0
          ? <span style={{fontSize:12,color:'var(--text-muted)'}}>Unassigned</span>
          : selected.map(m=><MemberPill key={m.id} member={m} color={color}/>)}
        <span style={{marginLeft:'auto',fontSize:10,color:'var(--text-muted)'}}>▾</span>
      </div>
      {open&&(
        <>
          <div style={{position:'fixed',inset:0,zIndex:90}} onClick={()=>setOpen(false)}/>
          <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:100,
            background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',
            boxShadow:'var(--shadow-md)',maxHeight:200,overflowY:'auto',padding:6}}>
            {members.length===0
              ? <div style={{padding:'8px 10px',fontSize:12,color:'var(--text-muted)'}}>No {label}s in team</div>
              : members.map(m=>{
                  const sel=ids.includes(m.id)
                  return (
                    <div key={m.id} onClick={()=>{onChange(sel?ids.filter(x=>x!==m.id):[...ids,m.id])}}
                      style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                        borderRadius:'var(--radius)',cursor:'pointer',
                        background:sel?`${color}10`:'transparent',transition:'background 0.1s'}}>
                      <div style={{width:24,height:24,borderRadius:'50%',flexShrink:0,
                        border:`1.5px solid ${sel?color:'var(--border)'}`,
                        background:sel?`${color}15`:'var(--bg)',
                        display:'flex',alignItems:'center',justifyContent:'center',
                        fontSize:9,fontWeight:700,color:sel?color:'var(--text-muted)'}}>
                        {initials(m.full_name)}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:sel?600:400,color:sel?color:'var(--text-primary)'}}>{m.full_name}</div>
                      </div>
                      {sel&&<span style={{fontSize:13,color}}>✓</span>}
                    </div>
                  )
                })
            }
          </div>
        </>
      )}
    </div>
  )
}

// ── CLIENT MODAL (Add/Edit) ──────────────────────────────────
function ClientModal({ client, allMembers, onClose, onSave }) {
  const isEdit = !!client
  const blank = {name:'',package_type:'',
    cs_ids:[],mb_ids:[],editor_ids:[],designer_ids:[],ugc_ids:[],
    channels:{meta:false,google:false,tiktok:false,snapchat:false,applovin:false},
    creatives:{video:{concepts:0,variations:0},ugc:{concepts:0,variations:0},static:{concepts:0,variations:0}}}

  const [form, setForm] = useState(isEdit ? {
    name: client.name||'',
    package_type: client.package_type||'',
    cs_ids: parseIds(client.cs_ids),
    mb_ids: parseIds(client.mb_ids),
    editor_ids: parseIds(client.editor_ids),
    designer_ids: parseIds(client.designer_ids),
    ugc_ids: parseIds(client.ugc_ids),
    channels: client.channels||{meta:false,google:false,tiktok:false,snapchat:false,applovin:false},
    creatives: client.creatives||{video:{concepts:0,variations:0},ugc:{concepts:0,variations:0},static:{concepts:0,variations:0}},
  } : blank)
  const [saving, setSaving] = useState(false)

  function setCreative(type, field, val) {
    setForm(f=>({...f,creatives:{...f.creatives,[type]:{...f.creatives[type],[field]:parseInt(val)||0}}}))
  }
  function toggleChannel(ch) {
    setForm(f=>({...f,channels:{...f.channels,[ch]:!f.channels[ch]}}))
  }
  function totalAds(type) {
    const t = form.creatives[type]
    return (parseInt(t.concepts)||0) * (parseInt(t.variations)||0)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    // Build payload without updated_at (may not exist on all schemas)
    const payload = {
      name: form.name.trim(),
      package_type: form.package_type||'',
      cs_ids: form.cs_ids,
      mb_ids: form.mb_ids,
      editor_ids: form.editor_ids,
      designer_ids: form.designer_ids,
      ugc_ids: form.ugc_ids,
      assigned_cs_id: form.cs_ids[0]||null,
      channels: form.channels,
      creatives: form.creatives,
    }
    if (isEdit) {
      // Save core assignment fields first (always exist)
      const corePayload = {
        cs_ids: payload.cs_ids,
        mb_ids: payload.mb_ids,
        editor_ids: payload.editor_ids,
        designer_ids: payload.designer_ids,
        ugc_ids: payload.ugc_ids,
        assigned_cs_id: payload.assigned_cs_id,
        name: payload.name,
      }
      const {error: coreError} = await supabase.from('clients').update(corePayload).eq('id', client.id)
      if (coreError) {
        alert('Save failed: ' + coreError.message)
        setSaving(false)
        return
      }
      // Try extended fields separately — silently skip if columns don't exist yet
      const extPayload = {
        package_type: payload.package_type,
        channels: payload.channels,
        creatives: payload.creatives,
      }
      await supabase.from('clients').update(extPayload).eq('id', client.id)
    } else {
      const {data:newClient, error} = await supabase.from('clients')
        .insert({...payload, is_active:true, is_archived:false}).select().single()
      if (error) {
        alert('Save failed: ' + error.message)
        setSaving(false)
        return
      }
      if (newClient?.id) {
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate()-weekStart.getDay()+1)
        const ws = weekStart.toISOString().split('T')[0]
        await supabase.from('client_health_entries').upsert({
          client_id:newClient.id, week_start:ws,
          performance_health:0, creative_strategy:0, execution_delivery:0,
          strategic_alignment:0, communication:0
        },{onConflict:'client_id,week_start'})
      }
    }
    setSaving(false)
    onSave()
    onClose()
  }

  const membersFor = (position) => allMembers.filter(m=>m.position===position)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">{isEdit?'Edit Client':'Add Client'}</h2>

        {/* Name + Package */}
        <div className="grid-2">
          <div className="form-group">
            <label>Client Name *</label>
            <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Abriga" autoFocus/>
          </div>
          <div className="form-group">
            <label>Package Type</label>
            <input value={form.package_type} onChange={e=>setForm({...form,package_type:e.target.value})} placeholder="e.g. Full Service, Ads Only"/>
          </div>
        </div>

        {/* Channels */}
        <div className="form-group">
          <label>Media Channels</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:4}}>
            {CHANNELS.map(ch=>{
              const on = form.channels[ch]
              return (
                <div key={ch} onClick={()=>toggleChannel(ch)}
                  style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:100,
                    cursor:'pointer',border:`2px solid ${on?CHANNEL_COLORS[ch]:'var(--border)'}`,
                    background:on?`${CHANNEL_COLORS[ch]}15`:'var(--bg-input)',transition:'all 0.12s',
                    fontSize:12,fontWeight:on?600:400,color:on?CHANNEL_COLORS[ch]:'var(--text-secondary)'}}>
                  {CHANNEL_LABELS[ch]}
                </div>
              )
            })}
          </div>
        </div>

        {/* Creative Package */}
        <div className="form-group">
          <label>Creative Package</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginTop:4}}>
            {['video','ugc','static'].map(type=>{
              const total = totalAds(type)
              return (
                <div key={type} style={{background:'var(--bg)',border:'1px solid var(--border)',
                  borderRadius:'var(--radius)',padding:10}}>
                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
                    textTransform:'uppercase',letterSpacing:1,marginBottom:8,fontWeight:600}}>
                    {type==='ugc'?'UGC':type==='video'?'Video':'Static'}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                    <div>
                      <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:3}}>Concepts</div>
                      <input type="number" min="0" value={form.creatives[type].concepts}
                        onChange={e=>setCreative(type,'concepts',e.target.value)}
                        style={{padding:'4px 8px',fontSize:12}}/>
                    </div>
                    <div>
                      <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:3}}>Variations</div>
                      <input type="number" min="0" value={form.creatives[type].variations}
                        onChange={e=>setCreative(type,'variations',e.target.value)}
                        style={{padding:'4px 8px',fontSize:12}}/>
                    </div>
                  </div>
                  <div style={{marginTop:6,fontSize:11,color:'var(--accent)',fontWeight:600,textAlign:'center'}}>
                    = {total} total {type==='ugc'?'UGC':type==='video'?'videos':'statics'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Team Assignment */}
        <div className="form-group">
          <label>Team Assignment</label>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:4}}>
            {ROLE_GROUPS.map(rg=>(
              <MultiSelect key={rg.key} label={rg.label}
                ids={form[rg.key]} members={membersFor(rg.position)}
                onChange={ids=>setForm({...form,[rg.key]:ids})}
                color={rg.color}/>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!form.name.trim()}>
            {saving?'Saving...':isEdit?'Save Changes':'Add Client'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── CARD VIEW ────────────────────────────────────────────────
function ClientCard({ client, allMembers, onEdit, onArchive }) {
  const channels = client.channels||{}
  const creatives = client.creatives||{}
  const activeChannels = CHANNELS.filter(ch=>channels[ch])
  const totalVideo = (creatives.video?.concepts||0)*(creatives.video?.variations||0)
  const totalUgc = (creatives.ugc?.concepts||0)*(creatives.ugc?.variations||0)
  const totalStatic = (creatives.static?.concepts||0)*(creatives.static?.variations||0)
  const totalAds = totalVideo+totalUgc+totalStatic

  return (
    <div className="card" style={{padding:0,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      {/* Header */}
      <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',
        display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,borderRadius:'var(--radius)',background:'var(--accent-dim)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:13,fontWeight:700,color:'var(--accent)',flexShrink:0}}>
            {client.name?.slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{client.name}</div>
            {client.package_type&&<div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{client.package_type}</div>}
          </div>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>onEdit(client)}><Edit2 size={13}/></button>
          <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--amber)'}}
            onClick={()=>onArchive(client)} title="Archive client"><Archive size={13}/></button>
        </div>
      </div>

      {/* Channels */}
      {activeChannels.length>0&&(
        <div style={{padding:'8px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:6,flexWrap:'wrap'}}>
          {activeChannels.map(ch=>(
            <span key={ch} style={{fontSize:9,fontFamily:'var(--font-mono)',fontWeight:600,
              padding:'2px 7px',borderRadius:100,textTransform:'uppercase',
              background:`${CHANNEL_COLORS[ch]}15`,color:CHANNEL_COLORS[ch],letterSpacing:0.5}}>
              {CHANNEL_LABELS[ch]}
            </span>
          ))}
        </div>
      )}

      {/* Creatives */}
      {totalAds>0&&(
        <div style={{padding:'8px 16px',borderBottom:'1px solid var(--border)',
          display:'flex',gap:12,flexWrap:'wrap'}}>
          {totalVideo>0&&<span style={{fontSize:11,color:'var(--text-secondary)'}}>🎬 {totalVideo} videos</span>}
          {totalUgc>0&&<span style={{fontSize:11,color:'var(--text-secondary)'}}>🎤 {totalUgc} UGC</span>}
          {totalStatic>0&&<span style={{fontSize:11,color:'var(--text-secondary)'}}>🖼 {totalStatic} statics</span>}
          <span style={{fontSize:11,fontWeight:600,color:'var(--accent)',marginLeft:'auto'}}>{totalAds} total ads</span>
        </div>
      )}

      {/* Team */}
      <div style={{padding:'10px 16px',flex:1,display:'flex',flexDirection:'column',gap:8}}>
        {ROLE_GROUPS.map(rg=>{
          const ids = parseIds(client[rg.key])
          const members = ids.map(id=>allMembers.find(m=>m.id===id)).filter(Boolean)
          if (!members.length) return null
          return (
            <div key={rg.key}>
              <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
                textTransform:'uppercase',letterSpacing:1,marginBottom:4,fontWeight:600}}>{rg.label}</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {members.map(m=><MemberPill key={m.id} member={m} color={rg.color}/>)}
              </div>
            </div>
          )
        })}
        {ROLE_GROUPS.every(rg=>parseIds(client[rg.key]).length===0)&&(
          <div style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>No team assigned yet</div>
        )}
      </div>
    </div>
  )
}

// ── TABLE ROW ────────────────────────────────────────────────
function ClientTableRow({ client, allMembers, onEdit, onArchive }) {
  const channels = client.channels||{}
  const creatives = client.creatives||{}
  const activeChannels = CHANNELS.filter(ch=>channels[ch])
  const totalAds =
    (creatives.video?.concepts||0)*(creatives.video?.variations||0)+
    (creatives.ugc?.concepts||0)*(creatives.ugc?.variations||0)+
    (creatives.static?.concepts||0)*(creatives.static?.variations||0)

  return (
    <tr>
      <td>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:30,height:30,borderRadius:'var(--radius)',background:'var(--accent-dim)',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--accent)',flexShrink:0}}>
            {client.name?.slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style={{fontWeight:600,fontSize:13}}>{client.name}</div>
            {client.package_type&&<div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{client.package_type}</div>}
          </div>
        </div>
      </td>
      <td>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {activeChannels.map(ch=>(
            <span key={ch} style={{fontSize:9,padding:'1px 6px',borderRadius:100,fontFamily:'var(--font-mono)',fontWeight:600,
              background:`${CHANNEL_COLORS[ch]}15`,color:CHANNEL_COLORS[ch]}}>{CHANNEL_LABELS[ch]}</span>
          ))}
          {activeChannels.length===0&&<span style={{fontSize:11,color:'var(--text-muted)'}}>—</span>}
        </div>
      </td>
      <td style={{fontSize:12}}>
        {totalAds>0?<span style={{fontWeight:600,color:'var(--accent)'}}>{totalAds} ads</span>:<span style={{color:'var(--text-muted)'}}>—</span>}
      </td>
      {ROLE_GROUPS.map(rg=>{
        const ids = parseIds(client[rg.key])
        const members = ids.map(id=>allMembers.find(m=>m.id===id)).filter(Boolean)
        return (
          <td key={rg.key}>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {members.length===0
                ? <span style={{fontSize:11,color:'var(--text-muted)'}}>—</span>
                : members.map(m=>(
                    <span key={m.id} style={{fontSize:11,color:rg.color,fontWeight:500}}>{m.full_name}</span>
                  ))
              }
            </div>
          </td>
        )
      })}
      <td>
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>onEdit(client)}><Edit2 size={12}/></button>
          <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--amber)'}}
            onClick={()=>onArchive(client)} title="Archive"><Archive size={12}/></button>
        </div>
      </td>
    </tr>
  )
}

// ── MAIN PAGE ────────────────────────────────────────────────
export default function ClientRoster() {
  const { isManagement } = useAuth()
  const [clients, setClients] = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('card') // 'card' | 'table'
  const [showAdd, setShowAdd] = useState(false)
  const [editClient, setEditClient] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(()=>{load()},[])

  async function load() {
    setLoading(true)
    const [{data:clientData},{data:memberData}] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active',true).order('name'),
      supabase.from('profiles').select('id,full_name,position,avatar_url').order('full_name'),
    ])
    setClients(clientData||[])
    setAllMembers(memberData||[])
    setLoading(false)
  }

  async function archiveClient(client) {
    if (!confirm(`Archive "${client.name}"? It will be hidden but not deleted — you can restore it any time.`)) return
    await supabase.from('clients').update({is_archived:true}).eq('id',client.id)
    setClients(prev=>prev.map(c=>c.id===client.id?{...c,is_archived:true}:c))
  }

  async function restoreClient(client) {
    await supabase.from('clients').update({is_archived:false}).eq('id',client.id)
    setClients(prev=>prev.map(c=>c.id===client.id?{...c,is_archived:false}:c))
  }

  if (!isManagement) return (
    <div className="page-body" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}>
      <p style={{color:'var(--text-muted)'}}>Management access only.</p>
    </div>
  )

  const activeClients = clients.filter(c=>!c.is_archived)
  const archivedClients = clients.filter(c=>c.is_archived)
  const filtered = activeClients.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase()))
  const unassigned = filtered.filter(c=>ROLE_GROUPS.every(rg=>parseIds(c[rg.key]).length===0))

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{flexWrap:'wrap',gap:10}}>
          <div>
            <h1 className="page-title">Client Roster</h1>
            <p className="page-subtitle">Single source of truth — drives Spend Tracker, Change Log, and all dashboards</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowArchived(!showArchived)}>
              <Archive size={14}/> {showArchived?'Hide':'Show'} Archived ({archivedClients.length})
            </button>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>
              <Plus size={14}/> Add Client
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">Active Clients</div><div className="stat-box-value">{activeClients.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Fully Assigned</div><div className="stat-box-value text-green">{activeClients.filter(c=>ROLE_GROUPS.some(rg=>parseIds(c[rg.key]).length>0)).length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Unassigned</div><div className="stat-box-value text-red">{unassigned.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Archived</div><div className="stat-box-value text-muted">{archivedClients.length}</div></div>
        </div>

        {/* Search + View Toggle */}
        <div className="flex items-center gap-3 mb-4" style={{flexWrap:'wrap'}}>
          <div style={{position:'relative',flex:1,maxWidth:300}}>
            <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search clients..." style={{paddingLeft:32}}/>
          </div>
          <div style={{display:'flex',border:'1.5px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
            <button onClick={()=>setView('card')}
              style={{padding:'6px 12px',border:'none',cursor:'pointer',fontSize:12,fontFamily:'var(--font-body)',
                background:view==='card'?'var(--accent)':'transparent',
                color:view==='card'?'#fff':'var(--text-secondary)',transition:'all 0.12s',
                display:'flex',alignItems:'center',gap:6}}>
              <LayoutGrid size={13}/> Cards
            </button>
            <button onClick={()=>setView('table')}
              style={{padding:'6px 12px',border:'none',cursor:'pointer',fontSize:12,fontFamily:'var(--font-body)',
                background:view==='table'?'var(--accent)':'transparent',
                color:view==='table'?'#fff':'var(--text-secondary)',transition:'all 0.12s',
                display:'flex',alignItems:'center',gap:6}}>
              <LayoutList size={13}/> Table
            </button>
          </div>
        </div>

        {unassigned.length>0&&!search&&(
          <div style={{padding:'8px 14px',background:'var(--amber-dim)',border:'1px solid var(--amber)',
            borderRadius:'var(--radius)',marginBottom:16,fontSize:11,color:'var(--amber)',fontFamily:'var(--font-mono)'}}>
            ⚠ {unassigned.length} client{unassigned.length!==1?'s':''} with no team assigned
          </div>
        )}

        {loading ? (
          <div className="loading-screen" style={{minHeight:200,background:'transparent'}}><div className="spinner"/></div>
        ) : filtered.length===0 ? (
          <div className="empty-state"><p>No clients found.</p></div>
        ) : view==='card' ? (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16}}>
            {filtered.map(c=>(
              <ClientCard key={c.id} client={c} allMembers={allMembers}
                onEdit={setEditClient} onArchive={archiveClient}/>
            ))}
          </div>
        ) : (
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Channels</th>
                    <th>Ads</th>
                    {ROLE_GROUPS.map(rg=><th key={rg.key} style={{color:rg.color}}>{rg.label}</th>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c=>(
                    <ClientTableRow key={c.id} client={c} allMembers={allMembers}
                      onEdit={setEditClient} onArchive={archiveClient}/>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Archived */}
        {showArchived&&archivedClients.length>0&&(
          <div style={{marginTop:32}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text-muted)',marginBottom:12,
              display:'flex',alignItems:'center',gap:8}}>
              <Archive size={14}/> Archived Clients
            </div>
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              {archivedClients.map((c,i)=>(
                <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                  padding:'10px 16px',borderBottom:i<archivedClients.length-1?'1px solid var(--border)':'none',
                  opacity:0.6}}>
                  <span style={{fontSize:13,color:'var(--text-secondary)'}}>{c.name}</span>
                  <button className="btn btn-ghost btn-sm" onClick={()=>restoreClient(c)}>Restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAdd&&<ClientModal allMembers={allMembers} onClose={()=>setShowAdd(false)} onSave={load}/>}
      {editClient&&<ClientModal client={editClient} allMembers={allMembers} onClose={()=>setEditClient(null)} onSave={load}/>}
    </>
  )
}
