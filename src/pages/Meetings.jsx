import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Check, Clock, Users, Video } from 'lucide-react'

const DEFAULT_TIMES = { week_start:'10:30–11:30', day_start:'08:00–09:00', general_assembly:'15:00–16:00' }
const DEFAULT_DAYS = { week_start:'Monday', day_start:'Daily', general_assembly:'Friday' }

function fmt(d) { return d instanceof Date ? d.toISOString().split('T')[0] : d }

function getThisMondayStr() {
  const d = new Date(), day = d.getDay(), diff = d.getDate()-day+(day===0?-6:1)
  const m = new Date(d); m.setDate(diff); return fmt(m)
}
function getThisFridayStr() {
  const d = new Date(), day = d.getDay()
  // days until friday: fri=5
  const diff = d.getDate() + (5 - day + (day > 5 ? 7 : 0))
  const f = new Date(d); f.setDate(diff); return fmt(f)
}
function getTodayStr() { return fmt(new Date()) }

function getMeetingDefaultDate(type) {
  if (type === 'week_start') return getThisMondayStr()
  if (type === 'general_assembly') return getThisFridayStr()
  return getTodayStr()
}

const MEETING_CONFIGS = [
  { key:'week_start', label:'Week Start', icon:Video, color:'var(--accent)',
    fields:['dashboard_done','milestone_notes','week_outcome_notes','general_notes'],
    fieldLabels:{ dashboard_done:'Dashboard Updated ✓', milestone_notes:'Milestone / Goals Update', week_outcome_notes:'Week Outcome', general_notes:'Backlog / Other Notes' } },
  { key:'day_start', label:'Day Start', icon:Clock, color:'var(--green)',
    fields:['dashboard_notes','general_notes'],
    fieldLabels:{ dashboard_notes:'Goals & Plan for Today', general_notes:'Workload & Day Outcome' } },
  { key:'general_assembly', label:'General Assembly', icon:Users, color:'var(--amber)',
    fields:['dashboard_done','milestone_notes','general_notes'],
    fieldLabels:{ dashboard_done:'Dashboard Updated ✓', milestone_notes:'Milestone Update', general_notes:'Team Update Summary' } },
]

function PrepCard({ meetingType, userId, date, isOwn, memberName }) {
  const [form, setForm] = useState({ dashboard_done:false, dashboard_notes:'', milestone_notes:'', week_outcome_notes:'', general_notes:'', is_completed:false })
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const mConfig = MEETING_CONFIGS.find(m => m.key === meetingType)

  useEffect(() => { load() }, [meetingType, date, userId])

  async function load() {
    const { data } = await supabase.from('meeting_preps').select('*').eq('user_id',userId).eq('meeting_type',meetingType).eq('meeting_date',date).single()
    if (data) setForm({ dashboard_done:data.dashboard_done||false, dashboard_notes:data.dashboard_notes||'', milestone_notes:data.milestone_notes||'', week_outcome_notes:data.week_outcome_notes||'', general_notes:data.general_notes||'', is_completed:data.is_completed||false })
    setLoaded(true)
  }

  async function save(markComplete=false) {
    setSaving(true)
    const payload = { user_id:userId, meeting_type:meetingType, meeting_date:date, ...form, updated_at:new Date().toISOString() }
    if (markComplete) payload.is_completed = true
    await supabase.from('meeting_preps').upsert(payload, { onConflict:'user_id,meeting_type,meeting_date' })
    setSaving(false); load()
  }

  if (!loaded) return null
  const isCompleted = form.is_completed
  const Icon = mConfig?.icon || Video

  return (
    <div className="card" style={{ borderLeft:`3px solid ${mConfig?.color}` }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={14} color={mConfig?.color} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-secondary)' }}>{memberName}</span>
        </div>
        {isCompleted ? <span className="badge green"><Check size={10}/> Ready</span> : <span className="badge gray">Pending</span>}
      </div>

      {mConfig?.fields.map(field => {
        if (field === 'dashboard_done') {
          return (
            <div key={field} className="form-group">
              <label>{mConfig.fieldLabels[field]}</label>
              {isOwn ? (
                <div className="checkbox-item" onClick={() => setForm({...form, dashboard_done:!form.dashboard_done})} style={{ padding:'10px 12px', background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
                  <input type="checkbox" checked={form.dashboard_done} readOnly style={{ width:16, height:16 }} />
                  <span style={{ fontSize:13 }}>Dashboard has been updated</span>
                </div>
              ) : (
                <div style={{ padding:'10px 12px', background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:13, color: form.dashboard_done ? 'var(--green)' : 'var(--text-muted)' }}>
                  {form.dashboard_done ? '✓ Done' : '✗ Not done'}
                </div>
              )}
            </div>
          )
        }
        return (
          <div key={field} className="form-group">
            <label>{mConfig.fieldLabels[field]}</label>
            {isOwn ? (
              <textarea value={form[field]||''} onChange={e=>setForm({...form,[field]:e.target.value})} rows={2} placeholder={`${mConfig.fieldLabels[field]}...`} style={{ resize:'vertical' }} />
            ) : (
              <div style={{ background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'9px 12px', minHeight:50, fontSize:13, color:form[field]?'var(--text-primary)':'var(--text-muted)' }}>
                {form[field] || '—'}
              </div>
            )}
          </div>
        )
      })}

      {isOwn && (
        <div className="flex gap-2 mt-2">
          <button className="btn btn-ghost btn-sm" onClick={()=>save(false)} disabled={saving}>Save Draft</button>
          <button className="btn btn-primary btn-sm" onClick={()=>save(true)} disabled={saving||isCompleted}>{isCompleted?'✓ Prepared':'Mark as Prepared'}</button>
        </div>
      )}
    </div>
  )
}

function RecapPanel({ meetingType, date, canEdit }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({ notes:'', decisions:'', blockers:'' })
  const [recap, setRecap] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [meetingType, date])

  async function load() {
    const { data } = await supabase.from('meeting_recaps').select('*').eq('meeting_type',meetingType).eq('meeting_date',date).maybeSingle()
    if (data) { setRecap(data); setForm({ notes:data.notes||'', decisions:data.decisions||'', blockers:data.blockers||'' }) }
  }

  async function save() {
    setSaving(true)
    await supabase.from('meeting_recaps').upsert({ meeting_type:meetingType, meeting_date:date, ...form, created_by:profile?.id, team:'all' }, { onConflict:'meeting_type,meeting_date,team' })
    setSaving(false); load()
  }

  return (
    <div className="card mt-4" style={{ borderLeft:'3px solid var(--border-light)' }}>
      <div className="card-label mb-3">Meeting Recap</div>
      {canEdit ? (
        <>
          <div className="form-group"><label>Notes & Discussion</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={3} style={{ resize:'vertical' }} placeholder="What was discussed..." /></div>
          <div className="form-group"><label>Decisions Made</label><textarea value={form.decisions} onChange={e=>setForm({...form,decisions:e.target.value})} rows={2} style={{ resize:'vertical' }} placeholder="Key decisions..." /></div>
          <div className="form-group"><label>Blockers</label><textarea value={form.blockers} onChange={e=>setForm({...form,blockers:e.target.value})} rows={2} style={{ resize:'vertical' }} placeholder="Blockers flagged..." /></div>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving?'Saving...':'Save Recap'}</button>
        </>
      ) : recap ? (
        <div>
          {recap.notes && <><div className="card-label">Notes</div><p style={{ fontSize:13, marginBottom:12 }}>{recap.notes}</p></>}
          {recap.decisions && <><div className="card-label">Decisions</div><p style={{ fontSize:13, marginBottom:12 }}>{recap.decisions}</p></>}
          {recap.blockers && <><div className="card-label">Blockers</div><p style={{ fontSize:13 }}>{recap.blockers}</p></>}
        </div>
      ) : <p className="text-muted text-sm">No recap yet.</p>}
    </div>
  )
}

export default function Meetings() {
  const { profile, isManagement } = useAuth()
  const [selectedType, setSelectedType] = useState('week_start')
  const [members, setMembers] = useState([])
  const [prepStats, setPrepStats] = useState({})
  const [customTimes, setCustomTimes] = useState({ week_start:'', day_start:'', general_assembly:'' })
  const [editingTime, setEditingTime] = useState(null)

  const mConfig = MEETING_CONFIGS.find(m => m.key === selectedType)
  const date = getMeetingDefaultDate(selectedType)
  const displayTime = customTimes[selectedType] || DEFAULT_TIMES[selectedType]
  const displayDay = DEFAULT_DAYS[selectedType]

  const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })

  useEffect(() => {
    if (isManagement) loadTeam()
    else if (profile) setMembers([profile])
  }, [isManagement, profile])

  useEffect(() => { if (members.length) loadPrepStats() }, [members, selectedType, date])

  async function loadTeam() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setMembers(data || [])
  }

  async function loadPrepStats() {
    const { data } = await supabase.from('meeting_preps').select('user_id,is_completed').eq('meeting_type',selectedType).eq('meeting_date',date)
    const stats = {}
    data?.forEach(d => { stats[d.user_id] = d.is_completed })
    setPrepStats(stats)
  }

  const prepCount = Object.values(prepStats).filter(Boolean).length
  const Icon = mConfig?.icon || Video

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1 className="page-title">Meetings</h1><p className="page-subtitle">Prep, run, and recap the 3 core meeting rituals</p></div>
        </div>
      </div>
      <div className="page-body">
        {/* Meeting type selector */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:28 }}>
          {MEETING_CONFIGS.map(m => {
            const MIcon = m.icon, active = selectedType === m.key
            const mDate = getMeetingDefaultDate(m.key)
            const mDateFmt = new Date(mDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})
            return (
              <div key={m.key} className="card" onClick={()=>setSelectedType(m.key)} style={{ cursor:'pointer', borderColor:active?m.color:'var(--border)', transition:'all 0.15s' }}>
                <div className="flex items-center gap-2 mb-1">
                  <MIcon size={14} color={active?m.color:'var(--text-muted)'}/>
                  <span style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:14, color:active?m.color:'var(--text-primary)' }}>{m.label}</span>
                </div>
                <p style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                  {DEFAULT_DAYS[m.key]} · {customTimes[m.key] || DEFAULT_TIMES[m.key]}
                </p>
                <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:3, fontFamily:'var(--font-mono)' }}>{mDateFmt}</p>
              </div>
            )
          })}
        </div>

        {/* Active meeting header */}
        <div className="card mb-6" style={{ borderLeft:`3px solid ${mConfig?.color}` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {mConfig && <Icon size={18} color={mConfig.color} />}
              <div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:16 }}>{mConfig?.label}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginTop:2 }}>
                  {dateFormatted} · {displayTime}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editingTime === selectedType ? (
                <>
                  <input placeholder={DEFAULT_TIMES[selectedType]} style={{ width:130, fontSize:12, padding:'5px 8px' }}
                    onKeyDown={e => { if (e.key==='Enter') { setCustomTimes(p=>({...p,[selectedType]:e.target.value})); setEditingTime(null) } if (e.key==='Escape') setEditingTime(null) }}
                    autoFocus />
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditingTime(null)}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={()=>setEditingTime(selectedType)}>
                  <Clock size={12}/> Change Time
                </button>
              )}
              {isManagement && (
                <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>
                  {prepCount}/{members.length} prepared
                </span>
              )}
            </div>
          </div>

          {/* Prep avatars */}
          {isManagement && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:12 }}>
              {members.map(m => (
                <div key={m.id} title={`${m.full_name} — ${prepStats[m.id]?'Prepared':'Not prepared'}`} style={{ width:28, height:28, borderRadius:'50%', background:prepStats[m.id]?'var(--green-dim)':'var(--bg)', border:`2px solid ${prepStats[m.id]?'var(--green)':'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:prepStats[m.id]?'var(--green)':'var(--text-muted)', fontFamily:'var(--font-display)' }}>
                  {m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prep forms */}
        <div style={{ display:'grid', gridTemplateColumns:isManagement?'repeat(2,1fr)':'1fr', gap:16 }}>
          {members.filter(Boolean).map(member => (
            <PrepCard key={member.id} meetingType={selectedType} userId={member.id} date={date} isOwn={member.id===profile?.id} memberName={member.full_name} />
          ))}
        </div>

        <RecapPanel meetingType={selectedType} date={date} canEdit={isManagement} />
      </div>
    </>
  )
}
