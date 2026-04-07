import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Check, Clock, Users, Video, Calendar } from 'lucide-react'

const MEETING_TYPES = [
  {
    key: 'week_start',
    label: 'Week Start',
    schedule: 'Monday · 10:30–11:30',
    icon: Calendar,
    color: 'var(--accent)',
    fields: ['dashboard_notes', 'milestone_notes', 'week_outcome_notes', 'general_notes'],
    fieldLabels: {
      dashboard_notes: 'Dashboard Update',
      milestone_notes: 'Milestone / Goals Update',
      week_outcome_notes: 'Week Outcome Declaration',
      general_notes: 'Backlog / Other Notes'
    }
  },
  {
    key: 'day_start',
    label: 'Day Start',
    schedule: 'Daily · 08:00–09:00',
    icon: Clock,
    color: 'var(--green)',
    fields: ['dashboard_notes', 'general_notes'],
    fieldLabels: {
      dashboard_notes: 'Goals & Plan for Today',
      general_notes: 'Workload & Day Outcome'
    }
  },
  {
    key: 'general_assembly',
    label: 'General Assembly',
    schedule: 'Friday · 15:00–16:00',
    icon: Users,
    color: 'var(--amber)',
    fields: ['dashboard_notes', 'milestone_notes', 'general_notes'],
    fieldLabels: {
      dashboard_notes: 'Dashboard Update (Part 1)',
      milestone_notes: 'Milestone Update (Part 1)',
      general_notes: 'Team Update Summary (Part 2)'
    }
  }
]

function fmt(date) { return date.toISOString().split('T')[0] }

function PrepCard({ meetingType, userId, date, isOwn, profile }) {
  const [prep, setPrep] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const mConfig = MEETING_TYPES.find(m => m.key === meetingType)

  useEffect(() => { load() }, [meetingType, date, userId])

  async function load() {
    const { data } = await supabase.from('meeting_preps')
      .select('*').eq('user_id', userId).eq('meeting_type', meetingType).eq('meeting_date', date).single()
    setPrep(data)
    if (data) {
      setForm({
        dashboard_notes: data.dashboard_notes || '',
        milestone_notes: data.milestone_notes || '',
        week_outcome_notes: data.week_outcome_notes || '',
        general_notes: data.general_notes || '',
        is_completed: data.is_completed || false
      })
    } else {
      setForm({ dashboard_notes: '', milestone_notes: '', week_outcome_notes: '', general_notes: '', is_completed: false })
    }
    setLoaded(true)
  }

  async function save(markComplete = false) {
    setSaving(true)
    const payload = { user_id: userId, meeting_type: meetingType, meeting_date: date, ...form, updated_at: new Date().toISOString() }
    if (markComplete) payload.is_completed = true
    await supabase.from('meeting_preps').upsert(payload, { onConflict: 'user_id,meeting_type,meeting_date' })
    setSaving(false)
    load()
  }

  if (!loaded) return null

  const isCompleted = prep?.is_completed || form.is_completed
  const Icon = mConfig?.icon || Video

  return (
    <div className="card" style={{ borderLeft: `3px solid ${mConfig?.color}` }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={15} color={mConfig?.color} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
            {profile?.full_name}
          </span>
        </div>
        {isCompleted ? (
          <span className="badge green"><Check size={10} /> Prepared</span>
        ) : (
          <span className="badge gray">Not prepared</span>
        )}
      </div>

      {mConfig?.fields.map(field => (
        <div key={field} className="form-group">
          <label>{mConfig.fieldLabels[field]}</label>
          {isOwn ? (
            <textarea
              value={form[field] || ''}
              onChange={e => setForm({ ...form, [field]: e.target.value })}
              rows={2}
              placeholder={`Add your ${mConfig.fieldLabels[field].toLowerCase()}...`}
              style={{ resize: 'vertical' }}
            />
          ) : (
            <div style={{
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '9px 12px', minHeight: 60,
              fontSize: 13, color: form[field] ? 'var(--text-primary)' : 'var(--text-muted)'
            }}>
              {form[field] || 'No input'}
            </div>
          )}
        </div>
      ))}

      {isOwn && (
        <div className="flex gap-2 mt-2">
          <button className="btn btn-ghost btn-sm" onClick={() => save(false)} disabled={saving}>
            Save Draft
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => save(true)} disabled={saving || isCompleted}>
            {isCompleted ? '✓ Marked Prepared' : 'Mark as Prepared'}
          </button>
        </div>
      )}
    </div>
  )
}

function RecapPanel({ meetingType, date, canEdit }) {
  const { profile } = useAuth()
  const [recap, setRecap] = useState(null)
  const [form, setForm] = useState({ notes: '', decisions: '', blockers: '' })
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { load() }, [meetingType, date])

  async function load() {
    const { data } = await supabase.from('meeting_recaps')
      .select('*').eq('meeting_type', meetingType).eq('meeting_date', date).single()
    setRecap(data)
    if (data) setForm({ notes: data.notes || '', decisions: data.decisions || '', blockers: data.blockers || '' })
    setLoaded(true)
  }

  async function save() {
    setSaving(true)
    await supabase.from('meeting_recaps').upsert({
      meeting_type: meetingType, meeting_date: date, ...form,
      created_by: profile?.id
    }, { onConflict: 'meeting_type,meeting_date,team' })
    setSaving(false)
    load()
  }

  if (!loaded) return null

  return (
    <div className="card mt-4" style={{ borderLeft: '3px solid var(--border-light)' }}>
      <div className="card-label" style={{ marginBottom: 12 }}>Meeting Recap</div>
      {canEdit ? (
        <>
          <div className="form-group">
            <label>Notes & Discussion</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="What was discussed..." style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Decisions Made</label>
            <textarea value={form.decisions} onChange={e => setForm({ ...form, decisions: e.target.value })} rows={2} placeholder="Key decisions..." style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Blockers Flagged</label>
            <textarea value={form.blockers} onChange={e => setForm({ ...form, blockers: e.target.value })} rows={2} placeholder="Blockers mentioned..." style={{ resize: 'vertical' }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Recap'}
          </button>
        </>
      ) : recap ? (
        <div>
          {recap.notes && <><div className="card-label">Notes</div><p style={{ fontSize: 13, marginBottom: 12 }}>{recap.notes}</p></>}
          {recap.decisions && <><div className="card-label">Decisions</div><p style={{ fontSize: 13, marginBottom: 12 }}>{recap.decisions}</p></>}
          {recap.blockers && <><div className="card-label">Blockers</div><p style={{ fontSize: 13 }}>{recap.blockers}</p></>}
        </div>
      ) : (
        <p className="text-muted text-sm">No recap added yet.</p>
      )}
    </div>
  )
}

export default function Meetings() {
  const { profile, isManagement } = useAuth()
  const [selectedType, setSelectedType] = useState('week_start')
  const [date, setDate] = useState(fmt(new Date()))
  const [members, setMembers] = useState([])
  const [prepStats, setPrepStats] = useState({})

  useEffect(() => {
    if (isManagement) loadTeam()
    else if (profile) setMembers([profile])
  }, [isManagement, profile])

  useEffect(() => {
    if (members.length) loadPrepStats()
  }, [members, selectedType, date])

  async function loadTeam() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setMembers(data || [])
  }

  async function loadPrepStats() {
    const { data } = await supabase.from('meeting_preps')
      .select('user_id, is_completed')
      .eq('meeting_type', selectedType)
      .eq('meeting_date', date)
    const stats = {}
    data?.forEach(d => { stats[d.user_id] = d.is_completed })
    setPrepStats(stats)
  }

  const mConfig = MEETING_TYPES.find(m => m.key === selectedType)
  const prepCount = Object.values(prepStats).filter(Boolean).length
  const Icon = mConfig?.icon || Video

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Meetings</h1>
            <p className="page-subtitle">Prep, run, and recap the 3 core meeting rituals</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ width: 'auto', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Meeting type selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {MEETING_TYPES.map(m => {
            const MIcon = m.icon
            const active = selectedType === m.key
            return (
              <div
                key={m.key}
                className="card"
                onClick={() => setSelectedType(m.key)}
                style={{
                  cursor: 'pointer',
                  borderColor: active ? m.color : 'var(--border)',
                  background: active ? `rgba(${m.color === 'var(--accent)' ? '59,130,246' : m.color === 'var(--green)' ? '34,197,94' : '245,158,11'},0.05)` : 'var(--bg-card)',
                  transition: 'all 0.15s'
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MIcon size={15} color={active ? m.color : 'var(--text-muted)'} />
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: active ? m.color : 'var(--text-primary)' }}>{m.label}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{m.schedule}</p>
              </div>
            )
          })}
        </div>

        {/* Prep completion summary (management) */}
        {isManagement && (
          <div className="card mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="card-label">Prep Completion — {mConfig?.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800 }}>
                  <span className={prepCount === members.length ? 'text-green' : 'text-amber'}>{prepCount}</span>
                  <span className="text-muted" style={{ fontSize: 16 }}>/{members.length}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 400 }}>
                {members.map(m => (
                  <div key={m.id} title={m.full_name} style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: prepStats[m.id] ? 'var(--green-dim)' : 'var(--bg)',
                    border: `2px solid ${prepStats[m.id] ? 'var(--green)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    color: prepStats[m.id] ? 'var(--green)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-display)'
                  }}>
                    {m.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Prep forms */}
        <div style={{ display: 'grid', gridTemplateColumns: isManagement ? 'repeat(2, 1fr)' : '1fr', gap: 16 }}>
          {members.filter(Boolean).map(member => (
            <PrepCard
              key={member.id}
              meetingType={selectedType}
              userId={member.id}
              date={date}
              isOwn={member.id === profile?.id}
              profile={member}
            />
          ))}
        </div>

        {/* Recap (management writes, all read) */}
        <RecapPanel meetingType={selectedType} date={date} canEdit={isManagement} />
      </div>
    </>
  )
}
