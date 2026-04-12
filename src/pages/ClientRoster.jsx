import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Search } from 'lucide-react'

function parseIds(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  try { return JSON.parse(val) } catch { return [] }
}

function initials(name) {
  return name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?'
}

function MemberPicker({ label, ids, allMembers, onChange, color }) {
  const [open, setOpen] = useState(false)
  const selected = allMembers.filter(m => ids.includes(m.id))
  return (
    <div style={{ position:'relative' }}>
      <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>{label}</div>
      <div onClick={() => setOpen(!open)}
        style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', cursor:'pointer',
          padding:'7px 10px', borderRadius:'var(--radius)', border:`1.5px solid ${open?color:'var(--border)'}`,
          background:'var(--bg-input)', minHeight:36, transition:'border-color 0.12s' }}>
        {selected.length === 0
          ? <span style={{ fontSize:12, color:'var(--text-muted)' }}>Unassigned</span>
          : selected.map(m => (
              <span key={m.id} style={{ display:'flex', alignItems:'center', gap:4, padding:'1px 8px',
                borderRadius:100, background:`${color}12`, border:`1px solid ${color}30`, fontSize:11, color }}>
                <div className="user-avatar" style={{ width:16, height:16, fontSize:7, border:'none', background:`${color}20`, color }}>
                  {initials(m.full_name)}
                </div>
                {m.full_name}
              </span>
            ))
        }
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)' }}>▾</span>
      </div>
      {open && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:90 }} onClick={() => setOpen(false)}/>
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:100,
            background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)',
            boxShadow:'var(--shadow-md)', maxHeight:220, overflowY:'auto', padding:6 }}>
            {allMembers.map(m => {
              const sel = ids.includes(m.id)
              return (
                <div key={m.id} onClick={() => {
                  onChange(sel ? ids.filter(x=>x!==m.id) : [...ids, m.id])
                }} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
                  borderRadius:'var(--radius)', cursor:'pointer',
                  background: sel ? `${color}10` : 'transparent',
                  transition:'background 0.1s' }}>
                  <div className="user-avatar" style={{ width:24, height:24, fontSize:9,
                    border:`1.5px solid ${sel?color:'var(--border)'}`,
                    background: sel?`${color}15`:'var(--bg)' }}>
                    {m.avatar_url ? <img src={m.avatar_url} alt=""/> : initials(m.full_name)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight: sel?600:400, color: sel?color:'var(--text-primary)' }}>{m.full_name}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{m.position?.replace(/_/g,' ')}</div>
                  </div>
                  {sel && <span style={{ fontSize:14, color }}>✓</span>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ClientRow({ client, csMembers, mbMembers, onSave }) {
  const [csIds, setCsIds] = useState(parseIds(client.cs_ids))
  const [mbIds, setMbIds] = useState(parseIds(client.mb_ids))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  async function save(newCsIds, newMbIds) {
    setSaving(true)
    await supabase.from('clients').update({
      cs_ids: newCsIds,
      mb_ids: newMbIds,
      // keep legacy column in sync for backward compat
      assigned_cs_id: newCsIds[0] || null,
    }).eq('id', client.id)
    setSaving(false)
    setDirty(false)
    onSave()
  }

  function handleCsChange(ids) {
    setCsIds(ids); setDirty(true)
    save(ids, mbIds)
  }
  function handleMbChange(ids) {
    setMbIds(ids); setDirty(true)
    save(csIds, ids)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr', gap:12,
      padding:'12px 16px', borderBottom:'1px solid var(--border)',
      alignItems:'center', transition:'background 0.1s' }}
      onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:'var(--radius)', background:'var(--accent-dim)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:12, fontWeight:700, color:'var(--accent)', flexShrink:0 }}>
          {client.name?.slice(0,2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600 }}>{client.name}</div>
          <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
            {csIds.length + mbIds.length === 0 ? 'No team assigned' : `${csIds.length + mbIds.length} assigned`}
          </div>
        </div>
      </div>
      <MemberPicker label="Creative Strategist" ids={csIds} allMembers={csMembers} onChange={handleCsChange} color="var(--green)"/>
      <MemberPicker label="Media Buyer" ids={mbIds} allMembers={mbMembers} onChange={handleMbChange} color="var(--accent)"/>
    </div>
  )
}

function AddClientModal({ onClose, onSave }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!name.trim()) return; setSaving(true)
    await supabase.from('clients').insert({ name: name.trim(), cs_ids: [], mb_ids: [] })
    onSave(); setSaving(false); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2 className="modal-title">Add Client</h2>
        <div className="form-group">
          <label>Client Name</label>
          <input value={name} onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleSave()}
            placeholder="e.g. Abriga" autoFocus/>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Adding...':'Add Client'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function ClientRoster() {
  const { isManagement } = useAuth()
  const [clients, setClients] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: clientData }, { data: memberData }] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('id,full_name,position,avatar_url').order('full_name'),
    ])
    setClients(clientData || [])
    setMembers(memberData || [])
    setLoading(false)
  }

  async function archiveClient(id) {
    if (!confirm('Archive this client?')) return
    await supabase.from('clients').update({ is_active: false }).eq('id', id)
    setClients(prev => prev.filter(c => c.id !== id))
  }

  if (!isManagement) return (
    <div className="page-body" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <p style={{ color:'var(--text-muted)' }}>Management access only.</p>
    </div>
  )

  const csMembers = members.filter(m => m.position === 'creative_strategist')
  const mbMembers = members.filter(m => m.position === 'media_buyer')

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  const unassigned = filtered.filter(c => parseIds(c.cs_ids).length === 0 && parseIds(c.mb_ids).length === 0)
  const assigned = filtered.filter(c => parseIds(c.cs_ids).length > 0 || parseIds(c.mb_ids).length > 0)

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap:'wrap', gap:10 }}>
          <div>
            <h1 className="page-title">Client Roster</h1>
            <p className="page-subtitle">Assign Creative Strategists and Media Buyers to each client — drives all dashboards</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15}/> Add Client
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-box-label">Total Clients</div><div className="stat-box-value">{clients.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Fully Assigned</div><div className="stat-box-value text-green">{assigned.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Unassigned</div><div className="stat-box-value text-red">{unassigned.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">CS Team</div><div className="stat-box-value text-accent">{csMembers.length}</div></div>
          <div className="stat-box"><div className="stat-box-label">Media Buyers</div><div className="stat-box-value">{mbMembers.length}</div></div>
        </div>

        {/* Search */}
        <div style={{ position:'relative', marginBottom:20 }}>
          <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search clients..."
            style={{ paddingLeft:34, maxWidth:300 }}/>
        </div>

        {loading ? (
          <div className="loading-screen" style={{ minHeight:200, background:'transparent' }}><div className="spinner"/></div>
        ) : (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            {/* Header row */}
            <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr', gap:12,
              padding:'10px 16px', background:'var(--bg)', borderBottom:'1.5px solid var(--border)' }}>
              <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1.5, fontWeight:600 }}>Client</div>
              <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--green)', textTransform:'uppercase', letterSpacing:1.5, fontWeight:600 }}>Creative Strategist</div>
              <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--accent)', textTransform:'uppercase', letterSpacing:1.5, fontWeight:600 }}>Media Buyer</div>
            </div>

            {/* Unassigned warning */}
            {unassigned.length > 0 && !search && (
              <div style={{ padding:'8px 16px', background:'var(--amber-dim)', borderBottom:'1px solid var(--border)',
                fontSize:11, color:'var(--amber)', fontFamily:'var(--font-mono)' }}>
                ⚠ {unassigned.length} client{unassigned.length!==1?'s':''} without a team assigned
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="empty-state"><p>No clients found.</p></div>
            ) : filtered.map(client => (
              <ClientRow key={client.id} client={client}
                csMembers={csMembers} mbMembers={mbMembers}
                onSave={load}/>
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onSave={load}/>}
    </>
  )
}
