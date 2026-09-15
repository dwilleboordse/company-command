import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Clock3, RefreshCw, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import HealthAnalytics from '../components/HealthAnalytics'
import { fetchHealthData, saveHealthEntry } from '../lib/healthData'
import { HEALTH_CONFIG, healthCurrentWeek, healthDueWeek, healthEligibleEntities, healthScore, healthWeekOptions, healthWeekSummary, isHealthComplete, isHealthEntityActive } from '../lib/healthWeekly'
import './TeamHealth.css'

const CONFIG = HEALTH_CONFIG.team
const RISK_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const RISK_COLORS = { Low: 'var(--green)', Medium: 'var(--amber)', High: 'var(--red)', Critical: 'var(--purple)' }

function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function isMonday(value) { return isDateKey(value) && new Date(`${value}T00:00:00Z`).getUTCDay() === 1 }
function dateLabel(value) {
  if (!isDateKey(value)) return value || 'Date not recorded'
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function weekLabel(value) { return isMonday(value) ? `Week of ${dateLabel(value)}` : `${dateLabel(value)} · legacy date` }
function formatPosition(value) { return (value || 'Role not recorded').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
function scoreLabel(entry) { const score = healthScore('team', entry); return score == null ? 'Not fully scored' : `${score.toFixed(1)} / 5` }
function completionOf(entry) { return !entry ? 'missing' : isHealthComplete('team', entry) ? 'complete' : 'partial' }
function sortReviews(a, b) { return (b.week_start || '').localeCompare(a.week_start || '') || (b.updated_at || '').localeCompare(a.updated_at || '') || String(b.id).localeCompare(String(a.id)) }
function unknownMember(id) { return { id, full_name: `Former / unavailable member (${String(id).slice(0, 8)})`, is_active: false } }

function RiskBadge({ risk }) {
  return risk ? <span className="team-health-risk" style={{ color: RISK_COLORS[risk] || 'var(--text-secondary)' }}>{risk} risk</span> : <span className="team-health-muted">Risk not recorded</span>
}

function ScoreBreakdown({ entry }) {
  return <dl className="team-health-scores">{CONFIG.fields.map(field => {
    const value = Number(entry?.[field.key])
    const valid = Number.isFinite(value) && value >= 1 && value <= 5
    return <div key={field.key}><dt>{field.short || field.label}</dt><dd>{valid ? `${value} / 5` : 'Not scored'}</dd></div>
  })}</dl>
}

function ReviewText({ entry }) {
  return <div className="team-health-review-text">
    <div><h4>Observations & notes</h4><p>{entry?.notes?.trim() || 'No notes recorded.'}</p></div>
    <div><h4>Actions / next steps</h4><p>{entry?.actions?.trim() || 'No actions recorded.'}</p></div>
  </div>
}

function ReviewModal({ member, week, existing, previous, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(CONFIG.fields.map(field => [field.key, existing?.[field.key] ?? ''])),
    [CONFIG.riskKey]: existing?.[CONFIG.riskKey] ?? '', notes: existing?.notes ?? '', actions: existing?.actions ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const savingRef = useRef(false)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const keydown = event => {
      if (event.key === 'Escape' && !savingRef.current) { event.preventDefault(); closeRef.current() }
      if (event.key !== 'Tab') return
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary')]
      if (!controls.length) { event.preventDefault(); dialogRef.current.focus(); return }
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keydown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  async function handleSave(event) {
    event.preventDefault()
    if (savingRef.current) return
    if (!isHealthComplete('team', form)) { setError('Select a score from 1 to 5 for every category and choose the performance risk.'); return }
    if (!isDateKey(week) || (!existing && (!isMonday(week) || week > healthCurrentWeek())) || (existing && existing.week_start !== week)) { setError('Choose a current or past Monday for a new weekly review. Existing legacy records keep their original date.'); return }
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const saved = await saveHealthEntry('team', { entityId: member.id, week, values: form, existing, userId: profile?.id })
      onSaved(saved)
    } catch (failure) {
      setError(failure.message || 'The review could not be saved. Your entries are still here; please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return <div className="modal-overlay team-health-modal-overlay">
    <section className="modal team-health-modal" role="dialog" aria-modal="true" aria-labelledby="team-review-title" aria-describedby="team-review-week" tabIndex={-1} ref={dialogRef}>
      <div className="team-health-modal-heading"><div><h2 className="modal-title" id="team-review-title">{existing ? 'Edit' : 'Log'} review · {member.full_name}</h2><p id="team-review-week">{weekLabel(week)} · {formatPosition(member.position)}</p></div><button type="button" className="btn btn-ghost btn-icon" aria-label="Close review" onClick={onClose} disabled={saving}><X size={18} /></button></div>
      <div className="team-health-period-note"><Clock3 size={16} aria-hidden="true" /><span>{existing ? `Updating the saved record dated ${dateLabel(existing.week_start)}. No other week will be changed.` : `This is a new, blank review for the week starting ${dateLabel(week)}. Previous scores are not carried forward.`}</span></div>
      {previous && <details className="team-health-previous"><summary>Previous logged review · {weekLabel(previous.week_start)} · reference only</summary><div><p><strong>{scoreLabel(previous)}</strong> · {previous[CONFIG.riskKey] || 'Risk not recorded'}</p><ScoreBreakdown entry={previous} /><ReviewText entry={previous} /></div></details>}
      <form onSubmit={handleSave}>
        <fieldset className="team-health-form-fields" disabled={saving}>
          <p className="team-health-muted">Score each category: 1 = needs urgent attention, 5 = consistently strong. All scores and the risk level are required.</p>
          {CONFIG.fields.map(field => <fieldset className="team-health-rating" key={field.key}>
            <legend>{field.label} <span aria-hidden="true">*</span></legend>
            {field.desc && <p>{field.desc}</p>}
            <div className="team-health-rating-options">{[1, 2, 3, 4, 5].map(value => <label key={value} className={Number(form[field.key]) === value ? 'selected' : ''}><input type="radio" name={field.key} value={value} checked={Number(form[field.key]) === value} onChange={() => setForm(current => ({ ...current, [field.key]: value }))} required /><span>{value}</span></label>)}</div>
          </fieldset>)}
          <fieldset className="team-health-rating"><legend>Performance risk <span aria-hidden="true">*</span></legend><div className="team-health-rating-options risk-options">{CONFIG.risks.map(risk => <label key={risk} className={form[CONFIG.riskKey] === risk ? 'selected' : ''}><input type="radio" name="performance-risk" value={risk} checked={form[CONFIG.riskKey] === risk} onChange={() => setForm(current => ({ ...current, [CONFIG.riskKey]: risk }))} required /><span>{risk}</span></label>)}</div></fieldset>
          <label className="team-health-text-label" htmlFor="team-review-notes">Observations & notes</label><textarea id="team-review-notes" value={form.notes} rows={3} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="What happened this week? Include supporting context." />
          <label className="team-health-text-label" htmlFor="team-review-actions">Actions / next steps</label><textarea id="team-review-actions" value={form.actions} rows={3} onChange={event => setForm(current => ({ ...current, actions: event.target.value }))} placeholder="What should happen next, and who will follow up?" />
        </fieldset>
        {error && <p className="team-health-error" role="alert">{error}</p>}
        <div className="team-health-modal-footer"><span>{scoreLabel(form)}</span><div><button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Save weekly review'}</button></div></div>
      </form>
    </section>
  </div>
}

function WeeklyMember({ member, entry, previous, week, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const complete = completionOf(entry)
  const active = isHealthEntityActive('team', member)
  return <article className="card team-health-member">
    <div className="team-health-member-heading">
      <div><h3>{member.full_name}</h3><p>{formatPosition(member.position)}{member.department ? ` · ${member.department}` : ''}{!active ? ' · Historical member' : ''}</p></div>
      <div className="team-health-member-actions"><span className={`team-health-completion ${complete}`}>{complete === 'complete' ? <><CheckCircle2 size={12} /> Logged</> : complete === 'partial' ? 'Incomplete record' : 'Not logged'}</span>{entry && <RiskBadge risk={entry[CONFIG.riskKey]} />}<strong>{entry ? scoreLabel(entry) : '—'}</strong>
        {entry || (active && isMonday(week) && week <= healthCurrentWeek()) ? <button className="btn btn-primary btn-sm" onClick={() => onEdit(member, entry)}>{entry ? 'Edit this week' : 'Log this week'}</button> : null}
        {entry && <button className="btn btn-ghost btn-sm" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} review details for ${member.full_name}`} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}Details</button>}
      </div>
    </div>
    {entry ? <ScoreBreakdown entry={entry} /> : <p className="team-health-no-entry">No review logged for {weekLabel(week).toLowerCase()}. {previous ? <>Last recorded: {dateLabel(previous.week_start)} · {scoreLabel(previous)} <span className="team-health-muted">(previous context, not this week’s score)</span></> : 'No previous review available.'}</p>}
    {expanded && entry && <div className="team-health-member-details"><ReviewText entry={entry} /><p className="team-health-muted">Recorded for {weekLabel(entry.week_start).toLowerCase()}. {entry.updated_at ? `Last saved ${new Date(entry.updated_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })} Dubai time.` : ''}</p></div>}
  </article>
}

export default function TeamHealth() {
  const { profile, isManagement, isOps } = useAuth()
  const canManage = isManagement || isOps
  const [searchParams, setSearchParams] = useSearchParams()
  const queryWeek = searchParams.get('week')
  const [tab, setTab] = useState('weekly')
  const [data, setData] = useState({ entities: [], entries: [] })
  const [calendarWeek, setCalendarWeek] = useState(() => healthCurrentWeek())
  const selectedWeek = isDateKey(queryWeek) && (queryWeek <= calendarWeek || data.entries.some(entry => entry.week_start === queryWeek)) ? queryWeek : healthDueWeek()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  const [memberFilter, setMemberFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [completionFilter, setCompletionFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [historyPeriod, setHistoryPeriod] = useState('all')
  const [editing, setEditing] = useState(null)
  const editingOpen = Boolean(editing)
  const [savedNotice, setSavedNotice] = useState('')

  useEffect(() => {
    if (!canManage || !profile?.id) return
    let cancelled = false
    fetchHealthData('team').then(result => {
      if (!cancelled) { setData(result); setLoadError(''); setLoading(false) }
    }).catch(error => {
      if (!cancelled) { setLoadError(error.message || 'Unable to load team health.'); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [canManage, profile?.id, revision])

  useEffect(() => {
    if (!canManage) return
    const refresh = () => {
      setCalendarWeek(healthCurrentWeek())
      if (!editingOpen) setRevision(value => value + 1)
    }
    const timer = window.setInterval(refresh, 5 * 60 * 1000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [canManage, editingOpen])

  const entitiesById = useMemo(() => new Map(data.entities.map(member => [member.id, member])), [data.entities])
  const reviews = useMemo(() => [...data.entries].sort(sortReviews), [data.entries])
  const memberHistory = useMemo(() => {
    const map = new Map()
    for (const entry of reviews) {
      if (!map.has(entry[CONFIG.idKey])) map.set(entry[CONFIG.idKey], [])
      map.get(entry[CONFIG.idKey]).push(entry)
    }
    return map
  }, [reviews])
  const selectedByMember = useMemo(() => {
    const map = new Map()
    reviews.filter(entry => entry.week_start === selectedWeek).forEach(entry => { if (!map.has(entry[CONFIG.idKey])) map.set(entry[CONFIG.idKey], entry) })
    return map
  }, [reviews, selectedWeek])
  const activeMembers = useMemo(() => data.entities.filter(member => isHealthEntityActive('team', member)), [data.entities])
  const summary = useMemo(() => healthWeekSummary('team', activeMembers, reviews, selectedWeek), [activeMembers, reviews, selectedWeek])
  const weeks = useMemo(() => [...new Set([...healthWeekOptions(reviews), selectedWeek, calendarWeek])].filter(isDateKey).sort((a, b) => b.localeCompare(a)), [reviews, selectedWeek, calendarWeek])
  const allMembers = useMemo(() => {
    const map = new Map(entitiesById)
    reviews.forEach(entry => { if (!map.has(entry[CONFIG.idKey])) map.set(entry[CONFIG.idKey], unknownMember(entry[CONFIG.idKey])) })
    return [...map.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [entitiesById, reviews])
  const departments = [...new Set(allMembers.map(member => member.department).filter(Boolean))].sort()
  const matchesMember = member => (memberFilter === 'all' || member.id === memberFilter) && (deptFilter === 'all' || member.department === deptFilter)
  const matchesReview = entry => (completionFilter === 'all' || completionOf(entry) === completionFilter) && (riskFilter === 'all' || entry?.[CONFIG.riskKey] === riskFilter)
  const weeklyMembers = healthEligibleEntities('team', activeMembers, reviews, selectedWeek).filter(member => matchesMember(member) && matchesReview(selectedByMember.get(member.id)))
    .sort((a, b) => (RISK_ORDER[selectedByMember.get(a.id)?.[CONFIG.riskKey]] ?? 4) - (RISK_ORDER[selectedByMember.get(b.id)?.[CONFIG.riskKey]] ?? 4) || (a.full_name || '').localeCompare(b.full_name || ''))
  const visibleHistory = reviews.filter(entry => (historyPeriod === 'all' || entry.week_start === historyPeriod) && matchesMember(entitiesById.get(entry[CONFIG.idKey]) || unknownMember(entry[CONFIG.idKey])) && matchesReview(entry))

  function selectWeek(value) { const next = new URLSearchParams(searchParams); next.set('week', value); setSearchParams(next) }
  function openReview(member, existing, week = selectedWeek) {
    setEditing({ member, existing, week, previous: (memberHistory.get(member.id) || []).find(entry => entry.week_start < week) || null })
  }
  function afterSave(saved) {
    // All cards, coverage and analytics read from this same parent state.
    setData(current => ({ ...current, entries: [saved, ...current.entries.filter(entry => entry.id !== saved.id)] }))
    setSavedNotice(`Review saved for ${weekLabel(saved.week_start).toLowerCase()}.`)
    setEditing(null)
  }
  function reload() { setLoading(true); setRevision(value => value + 1) }
  function selectTab(value) { setTab(value); if (value === 'history' && completionFilter === 'missing') setCompletionFilter('all') }

  if (!canManage) return <div className="page-body"><p className="text-muted">Team Health is available to Management and Operations only.</p></div>

  return <>
    <div className="page-header"><div><h1 className="page-title">Team Health</h1><p className="page-subtitle">Weekly reviews, saved history and performance trends</p></div><button className="btn btn-ghost" onClick={reload} disabled={loading}><RefreshCw size={15} /> Refresh</button></div>
    <div className="page-body team-health-page">
      <div className="tabs team-health-tabs" aria-label="Team health views">{[['weekly', 'Weekly logs'], ['history', 'History'], ['analytics', 'Analytics']].map(([value, label]) => <button className={`tab ${tab === value ? 'active' : ''}`} key={value} onClick={() => selectTab(value)} aria-pressed={tab === value}>{label}</button>)}</div>
      {savedNotice && <div className="team-health-saved" role="status"><CheckCircle2 size={16} />{savedNotice}<button className="btn btn-ghost btn-icon" aria-label="Dismiss saved message" onClick={() => setSavedNotice('')}><X size={14} /></button></div>}
      {loading ? <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /><p>Loading team health…</p></div> : loadError ? <div className="team-health-error" role="alert"><p>{loadError}</p><button className="btn btn-ghost" onClick={reload}>Retry</button></div> : tab === 'analytics' ? <HealthAnalytics kind="team" entities={data.entities} entries={reviews} /> : <>
        {tab === 'weekly' ? <>
          <div className="team-health-week-toolbar"><label htmlFor="team-health-week">Review week<select id="team-health-week" value={selectedWeek} onChange={event => selectWeek(event.target.value)}>{weeks.map(week => <option key={week} value={week}>{weekLabel(week)}{week === healthDueWeek() ? ' · due now' : week === healthCurrentWeek() ? ' · in progress' : ''}</option>)}</select></label><button className="btn btn-ghost" disabled={selectedWeek === healthDueWeek()} onClick={() => selectWeek(healthDueWeek())}>Go to due week</button></div>
          <p className="team-health-muted">Reviews are due on Monday for the previous completed week, using Dubai time. You are viewing <strong>{weekLabel(selectedWeek)}</strong>.{selectedWeek === healthCurrentWeek() ? ' This week is still in progress.' : ''}</p>
          {!isMonday(selectedWeek) && <div className="team-health-period-note">This is a legacy date. Existing reviews can be corrected without moving them; new weekly reviews must start on a Monday.</div>}
          <div className="stat-row team-health-stat-row"><div className="stat-box"><div className="stat-box-label">Weekly coverage</div><div className="stat-box-value">{summary.complete} / {summary.eligible}</div></div><div className="stat-box"><div className="stat-box-label">Missing reviews</div><div className="stat-box-value">{summary.missing}</div></div><div className="stat-box"><div className="stat-box-label">Incomplete records</div><div className="stat-box-value">{summary.partial}</div></div><div className="stat-box"><div className="stat-box-label">Average score</div><div className="stat-box-value">{summary.average == null ? '—' : summary.average.toFixed(1)}</div></div><div className="stat-box"><div className="stat-box-label">High / critical risk</div><div className="stat-box-value text-red">{summary.highRisk}</div></div></div>
          <p className="team-health-muted">Current active roster eligible by week end. Past members remain in History; historical membership is not reconstructed. Only records dated exactly for this week count; missing or incomplete scores are not treated as healthy.</p>
        </> : <div className="team-health-history-heading"><div><h2>Saved team reviews</h2><p>Every entry retains its original date, scores, notes and actions. Editing a row only updates that saved record.</p></div><label htmlFor="team-health-history-week">Date<select id="team-health-history-week" value={historyPeriod} onChange={event => setHistoryPeriod(event.target.value)}><option value="all">All saved weeks</option>{[...new Set(reviews.map(entry => entry.week_start))].map(week => <option value={week} key={week}>{weekLabel(week)}</option>)}</select></label></div>}
        <div className="team-health-filters">
          <label htmlFor="team-health-member">Team member<select id="team-health-member" value={memberFilter} onChange={event => setMemberFilter(event.target.value)}><option value="all">All team members</option>{allMembers.filter(member => isHealthEntityActive('team', member) || memberHistory.has(member.id)).map(member => <option value={member.id} key={member.id}>{member.full_name}{!isHealthEntityActive('team', member) ? ' · historical' : ''}</option>)}</select></label>
          <label htmlFor="team-health-department">Department<select id="team-health-department" value={deptFilter} onChange={event => setDeptFilter(event.target.value)}><option value="all">All departments</option>{departments.map(department => <option key={department} value={department}>{department}</option>)}</select></label>
          <label htmlFor="team-health-completion">Completion<select id="team-health-completion" value={completionFilter} onChange={event => setCompletionFilter(event.target.value)}><option value="all">All statuses</option><option value="complete">Logged</option><option value="partial">Incomplete record</option>{tab === 'weekly' && <option value="missing">Not logged</option>}</select></label>
          <label htmlFor="team-health-risk">Risk<select id="team-health-risk" value={riskFilter} onChange={event => setRiskFilter(event.target.value)}><option value="all">All risk levels</option>{CONFIG.risks.map(risk => <option key={risk} value={risk}>{risk}</option>)}</select></label>
          <button className="btn btn-ghost" onClick={() => { setMemberFilter('all'); setDeptFilter('all'); setCompletionFilter('all'); setRiskFilter('all') }}>Clear filters</button>
        </div>
        {tab === 'weekly' ? <div className="team-health-members">{weeklyMembers.length ? weeklyMembers.map(member => <WeeklyMember key={`${member.id}:${selectedWeek}`} member={member} week={selectedWeek} entry={selectedByMember.get(member.id)} previous={(memberHistory.get(member.id) || []).find(entry => entry.week_start < selectedWeek)} onEdit={openReview} />) : <div className="card team-health-empty"><ClipboardList size={23} /><p>No team members match these filters.</p></div>}</div>
          : <div className="team-health-history-list"><p className="team-health-muted">{visibleHistory.length} saved review{visibleHistory.length === 1 ? '' : 's'} match this view.</p>{visibleHistory.length ? visibleHistory.map(entry => {
            const member = entitiesById.get(entry[CONFIG.idKey]) || unknownMember(entry[CONFIG.idKey])
            return <article className="card team-health-history-entry" key={entry.id}><div className="team-health-member-heading"><div><h3>{member.full_name}</h3><p>{weekLabel(entry.week_start)} · {member.department || formatPosition(member.position)}{!isHealthEntityActive('team', member) ? ' · Historical member' : ''}</p></div><div className="team-health-member-actions"><span className={`team-health-completion ${completionOf(entry)}`}>{isHealthComplete('team', entry) ? 'Logged' : 'Incomplete record'}</span><RiskBadge risk={entry[CONFIG.riskKey]} /><strong>{scoreLabel(entry)}</strong><button className="btn btn-ghost btn-sm" onClick={() => openReview(member, entry, entry.week_start)}>Edit this record</button></div></div><ScoreBreakdown entry={entry} /><ReviewText entry={entry} /></article>
          }) : <div className="card team-health-empty"><ClipboardList size={23} /><p>No saved reviews match this view. No historical reviews have been filled automatically.</p></div>}</div>}
      </>}
    </div>
    {editing && <ReviewModal key={`${editing.member.id}:${editing.week}:${editing.existing?.id || 'new'}`} {...editing} onClose={() => setEditing(null)} onSaved={afterSave} />}
  </>
}
