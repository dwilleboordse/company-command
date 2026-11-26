import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileWarning, Lock, Plus, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/reportingData'
import {
  CATEGORY_OPTIONS, HR_LOG_TABLE, HR_STATUSES, SEVERITY_OPTIONS,
  entryDay, entryForm, entryPayload, filterEntries, listedName, optionList, validateEntry, yearsOf,
} from '../lib/hrLog'

const STATUS_BADGE = { Open: 'amber', Escalated: 'red', 'No Action': 'gray' }
const muted = { color: 'var(--text-muted)' }

function fmtDay(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Only active CEO and management accounts; the database enforces the same rule.
function canUseHrLog(profile) {
  return Boolean(profile && profile.is_active !== false && ['ceo', 'management'].includes(profile.role))
}

async function loadHrLog() {
  const [entries, staff] = await Promise.all([
    fetchAllRows(() => supabase.from(HR_LOG_TABLE).select('*').order('created_at', { ascending: false }).order('id')),
    fetchAllRows(() => supabase.from('team_member_tenures').select('full_name,end_date').order('full_name').order('id')),
  ])
  if (entries.error) throw new Error(entries.error.code === 'PGRST205' || entries.error.code === '42P01'
    ? 'The HR log table has not been added to the database yet.' : entries.error.message)
  // The staff list only suggests names; if it cannot load, names can still be typed.
  const names = (staff.data || []).filter(row => !row.end_date).map(row => row.full_name)
  return { entries: entries.data || [], names: [...new Set(names)] }
}

function Field({ label, required, hint, children }) {
  return (
    <div className="form-group">
      <label>{label}{required && <span style={{ color: 'var(--red)' }}> *</span>}</label>
      {children}
      {hint && <p style={{ fontSize: 10, ...muted, marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

function EntryModal({ entry, names, options, onClose, onSaved }) {
  const isNew = !entry?.id
  const [form, setForm] = useState(() => entryForm(entry))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function handleSave() {
    const problem = validateEntry(form)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError('')
    const payload = entryPayload(form)
    const query = isNew
      ? supabase.from(HR_LOG_TABLE).insert(payload).select('id')
      : supabase.from(HR_LOG_TABLE).update(payload).eq('id', entry.id).select('id')
    const { data, error: saveError } = await query
    if (saveError || !data?.length) {
      setError(saveError?.message || 'Nothing was saved. Only an active CEO or management account can write to the HR log.')
      setSaving(false)
      return
    }
    await onSaved()
    onClose()
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${entry.subject}" about ${entry.team_member}? This cannot be undone.`)) return
    setSaving(true)
    const { data, error: deleteError } = await supabase.from(HR_LOG_TABLE).delete().eq('id', entry.id).select('id')
    if (deleteError || !data?.length) { setError(deleteError?.message || 'Nothing was deleted.'); setSaving(false); return }
    await onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680 }} onClick={event => event.stopPropagation()}>
        <div style={{ marginBottom: 18 }}>
          <h2 className="modal-title" style={{ marginBottom: 3 }}>{isNew ? 'Log an HR issue' : entry.subject}</h2>
          <p style={{ fontSize: 11, ...muted }}>
            {isNew ? 'Same fields as the ClickUp form. Only Dennis and management can see this.'
              : `Logged ${fmtDay(String(entry.created_at).slice(0, 10))}${entry.updated_at && entry.updated_at !== entry.created_at ? ` · last changed ${fmtDay(String(entry.updated_at).slice(0, 10))}` : ''}`}
          </p>
        </div>

        <datalist id="hr-names">{names.map(name => <option key={name} value={name}/>)}</datalist>
        <datalist id="hr-categories">{options.category.map(value => <option key={value} value={value}/>)}</datalist>
        <datalist id="hr-severities">{options.severity.map(value => <option key={value} value={value}/>)}</datalist>
        <datalist id="hr-topics">{options.topic.map(value => <option key={value} value={value}/>)}</datalist>

        <Field label="Subject" required>
          <input value={form.subject} onChange={event => set('subject', event.target.value)} maxLength={200}/>
        </Field>
        <Field label="This log is about which team member?" required hint="Pick a name or type one.">
          <input value={form.team_member} onChange={event => set('team_member', event.target.value)} list="hr-names" maxLength={120} autoComplete="off"/>
        </Field>
        <Field label="Tell us what happened" required>
          <textarea value={form.what_happened} onChange={event => set('what_happened', event.target.value)} rows={5} maxLength={5000}/>
        </Field>

        <div className="grid-2">
          <Field label="Incident date">
            <input type="date" value={form.incident_date} onChange={event => set('incident_date', event.target.value)}/>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={event => set('status', event.target.value)}>
              {HR_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Category" required hint="Pick one or type a new one.">
            <input value={form.category} onChange={event => set('category', event.target.value)} list="hr-categories" maxLength={60} autoComplete="off"/>
          </Field>
          <Field label="Severity level" required hint="Pick one or type a new one.">
            <input value={form.severity} onChange={event => set('severity', event.target.value)} list="hr-severities" maxLength={60} autoComplete="off"/>
          </Field>
          <Field label="Topic category">
            <input value={form.topic_category} onChange={event => set('topic_category', event.target.value)} list="hr-topics" maxLength={80} autoComplete="off"/>
          </Field>
          <Field label="Slack link" hint="The message the issue came from.">
            <input value={form.slack_link} onChange={event => set('slack_link', event.target.value)} placeholder="https://…slack.com/archives/…" maxLength={500}/>
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Follow up?">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={form.follow_up} onChange={event => set('follow_up', event.target.checked)} style={{ width: 'auto' }}/> Yes
            </label>
            {form.follow_up && <input type="date" value={form.follow_up_date} onChange={event => set('follow_up_date', event.target.value)} aria-label="Follow-up date" style={{ marginTop: 6 }}/>}
          </Field>
          <Field label="Consequences?">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={form.consequences} onChange={event => set('consequences', event.target.checked)} style={{ width: 'auto' }}/> Yes
            </label>
            {form.consequences && <textarea value={form.what_consequences} onChange={event => set('what_consequences', event.target.value)} rows={2} maxLength={2000} placeholder="What consequences" style={{ marginTop: 6 }}/>}
          </Field>
        </div>

        <Field label="Agreements with the team member">
          <textarea value={form.agreements} onChange={event => set('agreements', event.target.value)} rows={2} maxLength={2000}/>
        </Field>

        {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>{!isNew && <button className="btn btn-danger btn-sm" disabled={saving} onClick={handleDelete}>Delete</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={saving} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : isNew ? 'Log it' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HRLog() {
  const { profile } = useAuth()
  const allowed = canUseHrLog(profile)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [filters, setFilters] = useState({ search: '', member: '', status: '', category: '', year: String(new Date().getFullYear()) })
  const [editing, setEditing] = useState(null)
  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }))

  const reload = async () => {
    try { setData(await loadHrLog()); setLoadError('') } catch (error) { setLoadError(error.message) }
  }
  useEffect(() => {
    if (!allowed) return undefined
    let cancelled = false
    loadHrLog().then(result => { if (!cancelled) setData(result) }, error => { if (!cancelled) setLoadError(error.message) })
    return () => { cancelled = true }
  }, [allowed])

  const entries = useMemo(() => data?.entries ?? [], [data])
  const shown = useMemo(() => filterEntries(entries, filters), [entries, filters])
  const options = useMemo(() => ({
    category: optionList(CATEGORY_OPTIONS, entries, 'category'),
    severity: optionList(SEVERITY_OPTIONS, entries, 'severity'),
    topic: optionList([], entries, 'topic_category'),
  }), [entries])
  const members = useMemo(() => optionList([], entries, 'team_member').sort((a, b) => a.localeCompare(b)), [entries])
  const years = useMemo(() => [...new Set([String(new Date().getFullYear()), ...yearsOf(entries)])].sort().reverse(), [entries])
  const inYear = filterEntries(entries, { year: filters.year })

  if (!allowed) {
    return <div className="page-body"><div className="empty-state"><Lock size={18}/><p style={{ marginTop: 8 }}>The HR Log is for the CEO and management only.</p></div></div>
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">HR Log</h1>
        <p className="page-subtitle">HR issues, complaints, compliments and leave, from 2027. Only Dennis and management can see this page.</p>
      </div>
      <div className="page-body">
        {loadError ? (
          <div className="card" style={{ padding: 20, color: 'var(--red)', fontSize: 12 }}>The HR log could not load: {loadError}</div>
        ) : !data ? (
          <div className="loading-screen" style={{ minHeight: 240, background: 'transparent' }}><div className="spinner"/></div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 16 }}>
              {[
                [`Logged${filters.year ? ` in ${filters.year}` : ''}`, inYear.length, undefined],
                ['Open', inYear.filter(entry => entry.status === 'Open').length, 'var(--amber)'],
                ['Escalated', inYear.filter(entry => entry.status === 'Escalated').length, 'var(--red)'],
              ].map(([label, value, color]) => (
                <div key={label} className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, ...muted }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, marginTop: 8, color: value ? color : undefined }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '2 1 200px' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: 10, ...muted }}/>
                <input value={filters.search} onChange={event => setFilter('search', event.target.value)} placeholder="Search subject, name, what happened" style={{ paddingLeft: 28, fontSize: 12 }}/>
              </div>
              <select value={filters.member} onChange={event => setFilter('member', event.target.value)} aria-label="Team member" style={{ flex: '1 1 150px', fontSize: 12 }}>
                <option value="">Everyone</option>
                {members.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <select value={filters.status} onChange={event => setFilter('status', event.target.value)} aria-label="Status" style={{ flex: '1 1 120px', fontSize: 12 }}>
                <option value="">Any status</option>
                {HR_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={filters.category} onChange={event => setFilter('category', event.target.value)} aria-label="Category" style={{ flex: '1 1 140px', fontSize: 12 }}>
                <option value="">Any category</option>
                {options.category.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={filters.year} onChange={event => setFilter('year', event.target.value)} aria-label="Year" style={{ flex: '0 1 110px', fontSize: 12 }}>
                <option value="">All years</option>
                {years.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Plus size={12}/> Log an issue</button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Team member</th><th>Subject</th><th>Category</th><th>Severity</th><th>Status</th><th>Follow-up</th><th>Slack</th></tr></thead>
                  <tbody>
                    {shown.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: 28, ...muted }}>
                        {entries.length ? 'Nothing matches these filters.' : 'Nothing logged yet. Use "Log an issue" to add the first one.'}
                      </td></tr>
                    )}
                    {shown.map(entry => (
                      <tr key={entry.id} onClick={() => setEditing(entry)} style={{ cursor: 'pointer' }}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDay(entryDay(entry))}{!entry.incident_date && <div style={{ fontSize: 9, ...muted }}>day logged</div>}</td>
                        <td style={{ fontSize: 12 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: 0, fontWeight: 700 }} title="Show only this person"
                            onClick={event => { event.stopPropagation(); setFilter('member', listedName(members, entry.team_member)) }}>{entry.team_member}</button>
                        </td>
                        <td style={{ fontSize: 12, maxWidth: 320 }}>
                          <div style={{ fontWeight: 650 }}>{entry.subject}</div>
                          <div style={{ fontSize: 10, ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.what_happened}</div>
                        </td>
                        <td style={{ fontSize: 12 }}>{entry.category}{entry.topic_category && <div style={{ fontSize: 10, ...muted }}>{entry.topic_category}</div>}</td>
                        <td style={{ fontSize: 12 }}>{entry.severity}</td>
                        <td><span className={`badge ${STATUS_BADGE[entry.status] || 'gray'}`}>{entry.status}</span></td>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{entry.follow_up ? (entry.follow_up_date ? fmtDay(entry.follow_up_date) : 'Yes') : <span style={muted}>—</span>}</td>
                        <td>{entry.slack_link
                          ? <a href={entry.slack_link} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} title="Open the Slack message"><ExternalLink size={13}/></a>
                          : <span style={muted}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p style={{ fontSize: 10, ...muted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <FileWarning size={11}/> 2026 and earlier stay in the ClickUp form "HR Issue Tracking Log". Click a row to see or change it.
            </p>
          </>
        )}
      </div>
      {editing && <EntryModal entry={editing.id ? editing : null} names={data?.names ?? []} options={options} onClose={() => setEditing(null)} onSaved={reload}/>}
    </>
  )
}
