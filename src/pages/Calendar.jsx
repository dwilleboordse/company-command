import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ChevronRight, Plus, X, Save } from 'lucide-react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function getMonday(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmt(date) { return date.toISOString().split('T')[0] }

function fmtDisplay(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function WeekOutcomePanel({ userId, weekStart, isOwn }) {
  const [outcomes, setOutcomes] = useState([])
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { load() }, [weekStart, userId])

  async function load() {
    const { data } = await supabase.from('week_outcomes')
      .select('*').eq('user_id', userId).eq('week_start', weekStart).single()
    setOutcomes(data?.outcomes || [])
    setLoaded(true)
  }

  async function save(newOutcomes) {
    setSaving(true)
    await supabase.from('week_outcomes').upsert({
      user_id: userId, week_start: weekStart, outcomes: newOutcomes, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,week_start' })
    setSaving(false)
  }

  function addOutcome() {
    if (!newItem.trim()) return
    const updated = [...outcomes, newItem.trim()]
    setOutcomes(updated)
    save(updated)
    setNewItem('')
  }

  function removeOutcome(i) {
    const updated = outcomes.filter((_, idx) => idx !== i)
    setOutcomes(updated)
    save(updated)
  }

  if (!loaded) return null

  return (
    <div>
      <div className="card-label">Week Outcome</div>
      {outcomes.map((o, i) => (
        <div key={i} className="flex items-center gap-2" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{o}</span>
          {isOwn && (
            <button onClick={() => removeOutcome(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      {isOwn && (
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <input
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addOutcome()}
            placeholder="Add outcome..."
            style={{ fontSize: 12, padding: '5px 8px' }}
          />
          <button className="btn btn-primary btn-sm btn-icon" onClick={addOutcome}><Plus size={13} /></button>
        </div>
      )}
    </div>
  )
}

function DayCell({ userId, date, isOwn }) {
  const [entry, setEntry] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ goals: '', plan: '', workload: '', day_outcome: '' })
  const [saving, setSaving] = useState(false)
  const dateStr = fmt(date)
  const isToday = fmt(new Date()) === dateStr

  useEffect(() => { load() }, [date, userId])

  async function load() {
    const { data } = await supabase.from('day_entries')
      .select('*').eq('user_id', userId).eq('entry_date', dateStr).single()
    setEntry(data)
    if (data) setForm({ goals: data.goals || '', plan: data.plan || '', workload: data.workload || '', day_outcome: data.day_outcome || '' })
  }

  async function save() {
    setSaving(true)
    await supabase.from('day_entries').upsert({
      user_id: userId, entry_date: dateStr, ...form, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,entry_date' })
    setSaving(false)
    setEditing(false)
    load()
  }

  return (
    <div style={{
      padding: 12, minHeight: 160,
      background: isToday ? 'rgba(59,130,246,0.04)' : 'transparent',
      borderLeft: isToday ? '2px solid var(--accent)' : '2px solid transparent'
    }}>
      {isOwn && !editing ? (
        <div onClick={() => setEditing(true)} style={{ cursor: 'pointer', height: '100%' }}>
          {entry?.day_outcome ? (
            <div>
              <div className="card-label">Day Outcome</div>
              <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{entry.day_outcome}</p>
              {entry.goals && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Goals: {entry.goals}</p>}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
              {isToday ? 'Click to log today' : 'No entry'}
            </div>
          )}
        </div>
      ) : isOwn && editing ? (
        <div>
          <textarea
            placeholder="Goals..."
            value={form.goals}
            onChange={e => setForm({ ...form, goals: e.target.value })}
            rows={2}
            style={{ fontSize: 11, marginBottom: 6, resize: 'none' }}
          />
          <textarea
            placeholder="Plan..."
            value={form.plan}
            onChange={e => setForm({ ...form, plan: e.target.value })}
            rows={2}
            style={{ fontSize: 11, marginBottom: 6, resize: 'none' }}
          />
          <textarea
            placeholder="Day outcome..."
            value={form.day_outcome}
            onChange={e => setForm({ ...form, day_outcome: e.target.value })}
            rows={2}
            style={{ fontSize: 11, marginBottom: 6, resize: 'none' }}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}><Save size={11} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}><X size={11} /></button>
          </div>
        </div>
      ) : (
        <div>
          {entry?.day_outcome ? (
            <div>
              <div className="card-label" style={{ fontSize: 9 }}>Day Outcome</div>
              <p style={{ fontSize: 11, lineHeight: 1.4 }}>{entry.day_outcome}</p>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No entry</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function Calendar() {
  const { profile, isManagement } = useAuth()
  const [weekStart, setWeekStart] = useState(getMonday())
  const [members, setMembers] = useState([])
  const [viewMode, setViewMode] = useState('own') // 'own' or 'team'

  useEffect(() => {
    if (isManagement) loadTeam()
  }, [isManagement])

  async function loadTeam() {
    const { data } = await supabase.from('profiles').select('id, full_name, role, position').order('full_name')
    setMembers(data || [])
  }

  const weekDays = DAYS.map((_, i) => addDays(weekStart, i))
  const weekLabel = `${fmtDisplay(weekStart)} — ${fmtDisplay(weekDays[4])}`

  const displayMembers = viewMode === 'own' || !isManagement
    ? [profile]
    : members

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Calendar</h1>
            <p className="page-subtitle">Weekly outcomes, daily planning, and task tracking</p>
          </div>
          <div className="flex items-center gap-3">
            {isManagement && (
              <div className="tabs" style={{ border: 'none', marginBottom: 0 }}>
                <button className={`tab ${viewMode === 'own' ? 'active' : ''}`} onClick={() => setViewMode('own')}>My View</button>
                <button className={`tab ${viewMode === 'team' ? 'active' : ''}`} onClick={() => setViewMode('team')}>Team View</button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}>
                <ChevronLeft size={15} />
              </button>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {weekLabel}
              </span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ padding: '24px 24px' }}>
        {displayMembers.filter(Boolean).map(member => (
          <div key={member.id} style={{ marginBottom: 32 }}>
            {viewMode === 'team' && (
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                  {member.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>{member.full_name}</span>
                {member.position && <span className="badge blue" style={{ fontSize: 9 }}>{member.position}</span>}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: '180px repeat(5, 1fr)',
              gap: 1,
              background: 'var(--border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '1px solid var(--border)'
            }}>
              {/* Header row */}
              <div style={{ background: 'var(--bg)', padding: '10px 12px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Week Outcome
                </span>
              </div>
              {DAYS.map((day, i) => (
                <div key={day} style={{
                  background: 'var(--bg)',
                  padding: '10px 12px',
                  borderLeft: '1px solid var(--border)'
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: fmt(weekDays[i]) === fmt(new Date()) ? 'var(--accent)' : 'var(--text-primary)' }}>{day}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtDisplay(weekDays[i])}</div>
                </div>
              ))}

              {/* Content row */}
              <div style={{ background: 'var(--bg-card)', padding: 12 }}>
                <WeekOutcomePanel
                  userId={member.id}
                  weekStart={fmt(weekStart)}
                  isOwn={member.id === profile?.id}
                />
              </div>
              {weekDays.map((day, i) => (
                <div key={i} style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)' }}>
                  <DayCell userId={member.id} date={day} isOwn={member.id === profile?.id} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
