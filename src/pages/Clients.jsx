import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Check, Edit2, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/reportingData'
import { parseReportingDate } from '../lib/reportingPeriods'
import { packageFormValues, packagePayload, validateClientPackage } from '../lib/clientPackage'
import { HEALTH_CONFIG, HEALTH_REVIEW_EVENT, healthCurrentWeek, healthDueWeek, healthEligibleEntities, healthScore, healthWeekOptions, healthWeekSummary, isHealthComplete, isHealthEntityActive } from '../lib/healthWeekly'
import { fetchHealthData, saveHealthEntry } from '../lib/healthData'
import ClientPackageFields from '../components/ClientPackageFields'
import HealthAnalytics from '../components/HealthAnalytics'
import './Clients.css'

const CONFIG = HEALTH_CONFIG.client
const RISK_COLORS = { Low: 'var(--green)', Medium: 'var(--amber)', High: 'var(--red)', Leaving: '#7c3aed' }
const RISK_BG = { Low: 'var(--green-dim)', Medium: 'var(--amber-dim)', High: 'var(--red-dim)', Leaving: 'rgba(124,58,237,0.12)' }
const RISK_ORDER = { Leaving: 0, High: 1, Medium: 2, Low: 3 }
const legacyWeek = value => parseReportingDate(value)?.getDay() !== 1
const weekText = value => {
  const date = parseReportingDate(value)
  return date ? `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${legacyWeek(value) ? ' · legacy date' : ''}` : value
}
const scoreText = entry => healthScore('client', entry) === null ? '—' : healthScore('client', entry).toFixed(1)

function useClientDialogFocus(onClose, saving) {
  const dialogRef = useRef(null)
  const current = useRef({ onClose, saving })
  useEffect(() => { current.current = { onClose, saving } }, [onClose, saving])
  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const focusable = () => [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(element => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length > 0)
    ;(dialog.querySelector('[data-client-dialog-focus]') || focusable()[0] || dialog).focus()
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!current.current.saving) current.current.onClose()
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) { event.preventDefault(); dialog.focus(); return }
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus()
    }
  }, [])
  return dialogRef
}

function RiskBadge({ risk }) {
  return risk ? <span className="client-health-badge" style={{ color: RISK_COLORS[risk] || 'var(--text-muted)', background: RISK_BG[risk] || 'var(--bg)' }}>{risk}</span> : <span className="client-health-note">Risk not set</span>
}

function ScoreDetails({ entry }) {
  return <div className="client-health-scores">{CONFIG.fields.map(field => {
    const value = Number(entry?.[field.key])
    const valid = Number.isFinite(value) && value >= 1 && value <= 5
    return <div key={field.key}><span title={field.label}>{field.short}</span><strong style={{ color: !valid ? 'var(--text-muted)' : value >= 4 ? 'var(--green)' : value >= 3 ? 'var(--amber)' : 'var(--red)' }}>{valid ? value : '—'}<small> / 5</small></strong></div>
  })}</div>
}

function EntryModal({ client, existing, week, onClose, onSave }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(CONFIG.fields.map(field => [field.key, existing?.[field.key] ?? ''])),
    churn_risk: existing?.churn_risk ?? '', notes: existing?.notes ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useClientDialogFocus(onClose, saving)
  async function save(event) {
    event.preventDefault()
    if (saving) return
    if (!isHealthComplete('client', form)) { setError('Select every score from 1 to 5 and a churn risk before saving.'); return }
    setError('')
    setSaving(true)
    try {
      const row = await saveHealthEntry('client', { entityId: client.id, week, values: form, existing, userId: profile?.id })
      onSave(row)
      onClose()
    } catch (saveError) { setError(saveError.message || 'The weekly health log could not be saved.') }
    finally { setSaving(false) }
  }
  return <div className="modal-overlay" onClick={() => !saving && onClose()}><div ref={dialogRef} tabIndex={-1} className="modal" style={{ maxWidth: 580 }} role="dialog" aria-modal="true" aria-labelledby="client-health-log-title" onClick={event => event.stopPropagation()}>
    <div className="client-health-heading"><h2 className="modal-title" id="client-health-log-title">{client.name} · {existing ? 'Edit weekly log' : 'Log client health'}</h2><button className="btn btn-ghost btn-icon" type="button" aria-label="Close client health log" disabled={saving} onClick={onClose}><X size={17} /></button></div>
    <p className="client-health-note">{legacyWeek(week) ? 'Saved date' : 'Week starting'} {weekText(week)}. {existing ? 'Editing this exact record keeps its notes and linked actions in the same week.' : 'This is a new weekly log; previous scores are not carried forward.'}</p>
    <form onSubmit={save}>
      {CONFIG.fields.map((field, fieldIndex) => <fieldset className="client-health-score-input" key={field.key} disabled={saving}><legend>{field.label}</legend>{field.desc && <p className="client-health-note">{field.desc}</p>}<div className="client-health-choice-row">{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} data-client-dialog-focus={fieldIndex === 0 && value === 1 ? '' : undefined} aria-label={`${field.label}: ${value} out of 5`} aria-pressed={Number(form[field.key]) === value} onClick={() => setForm(current => ({ ...current, [field.key]: value }))}>{value}</button>)}</div></fieldset>)}
      <fieldset className="client-health-score-input" disabled={saving}><legend>Churn risk</legend><div className="client-health-choice-row">{CONFIG.risks.map(risk => <button type="button" key={risk} aria-pressed={form.churn_risk === risk} onClick={() => setForm(current => ({ ...current, churn_risk: risk }))}>{risk}</button>)}</div></fieldset>
      <label className="client-health-field form-group">Notes / observations<textarea rows={4} value={form.notes} disabled={saving} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Client feedback, results, delivery issues, and follow-up context…" /></label>
      <p className="client-health-note">{isHealthComplete('client', form) ? `Average score: ${scoreText(form)} / 5` : 'All five scores and a risk level are required.'} Save scores first, then add actions to this entry.</p>
      {error && <p role="alert" className="client-health-error">{error}</p>}
      <div className="flex gap-2"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : existing ? 'Update this log' : 'Save weekly log'}</button><button className="btn btn-ghost" type="button" disabled={saving} onClick={onClose}>Cancel</button></div>
    </form>
  </div></div>
}

function ActionFields({ form, setForm, prefix }) {
  return <>
    <label className="client-health-field form-group">Action<input aria-label={`${prefix} action`} required value={form.action_text} onChange={event => setForm(current => ({ ...current, action_text: event.target.value }))} placeholder="What needs to happen?" /></label>
    <div className="client-health-input-grid"><label className="client-health-field">Owner<input aria-label={`${prefix} action owner`} value={form.owner} onChange={event => setForm(current => ({ ...current, owner: event.target.value }))} placeholder="Who owns this?" /></label><label className="client-health-field">Due date<input aria-label={`${prefix} action due date`} type="date" value={form.due_date} onChange={event => setForm(current => ({ ...current, due_date: event.target.value }))} /></label></div>
  </>
}

function actionValues(form) {
  if (!form.action_text.trim()) throw new Error('Enter an action before saving.')
  if (form.due_date && !parseReportingDate(form.due_date)) throw new Error('Choose a valid action due date.')
  return { action_text: form.action_text.trim(), owner: form.owner.trim() || null, due_date: form.due_date || null }
}

function ActionsPanel({ client, entry }) {
  const { profile } = useAuth()
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ action_text: '', owner: '', due_date: '' })
  const [pending, setPending] = useState(null)
  const load = useCallback(async () => {
    const result = await fetchAllRows(() => supabase.from('client_actions').select('*').eq('health_entry_id', entry.id).order('created_at').order('id'))
    if (result.error) setError(`Actions could not load: ${result.error.message}`)
    else { setActions(result.data); setError('') }
    setLoading(false)
  }, [entry.id])
  useEffect(() => {
    let cancelled = false
    fetchAllRows(() => supabase.from('client_actions').select('*').eq('health_entry_id', entry.id).order('created_at').order('id')).then(result => {
      if (cancelled) return
      if (result.error) setError(`Actions could not load: ${result.error.message}`)
      else setActions(result.data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [entry.id])
  async function addAction(event) {
    event.preventDefault()
    if (pending) return
    setPending('new'); setError('')
    try {
      const values = actionValues(form)
      const { data, error: saveError } = await supabase.from('client_actions').insert({ ...values, client_id: client.id, health_entry_id: entry.id, created_by: profile?.id }).select('*').single()
      if (saveError) throw saveError
      if (!data?.id) throw new Error('No action was saved. Check your permissions.')
      setActions(current => [...current, data]); setForm({ action_text: '', owner: '', due_date: '' }); setAdding(false)
    } catch (saveError) { setError(saveError.message) }
    finally { setPending(null) }
  }
  async function updateAction(action, patch) {
    if (pending) return false
    setPending(action.id); setError('')
    try {
      let query = supabase.from('client_actions').update(patch).eq('id', action.id).eq('health_entry_id', entry.id)
      if (action.updated_at) query = query.eq('updated_at', action.updated_at)
      const { data, error: saveError } = await query.select('*').single()
      if (saveError) throw saveError
      if (!data?.id) throw new Error('No action was updated. Check your permissions.')
      setActions(current => current.map(row => row.id === action.id ? data : row)); return true
    } catch (saveError) { setError(saveError.message); return false }
    finally { setPending(null) }
  }
  async function deleteAction(action) {
    if (pending || !confirm(`Delete this action from the ${weekText(entry.week_start)} log? This cannot be undone.`)) return
    setPending(action.id); setError('')
    try {
      const { data, error: saveError } = await supabase.from('client_actions').delete().eq('id', action.id).eq('health_entry_id', entry.id).select('id').single()
      if (saveError) throw saveError
      if (!data?.id) throw new Error('No action was deleted. Check your permissions.')
      setActions(current => current.filter(row => row.id !== action.id))
    } catch (saveError) { setError(saveError.message) }
    finally { setPending(null) }
  }
  return <section className="client-health-actions" aria-label={`Actions for ${client.name}, ${weekText(entry.week_start)}`}>
    <div className="client-health-heading"><div><h4>Actions to improve</h4><p className="client-health-note">Linked to this saved log: {weekText(entry.week_start)}</p></div><button className="btn btn-primary btn-sm" disabled={!!pending || loading} onClick={() => setAdding(current => !current)}><Plus size={12} /> Add action</button></div>
    {error && <p role="alert" className="client-health-error">{error} <button className="btn btn-ghost btn-sm" onClick={load}>Retry loading</button></p>}
    {adding && <form className="client-health-action-form" onSubmit={addAction}><ActionFields form={form} setForm={setForm} prefix="New" /><div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={!!pending}>{pending === 'new' ? 'Saving…' : 'Save action'}</button><button type="button" className="btn btn-ghost btn-sm" disabled={!!pending} onClick={() => setAdding(false)}>Cancel</button></div></form>}
    {loading ? <p className="client-health-note">Loading actions…</p> : !error && actions.length === 0 && <p className="client-health-note">No actions saved for this log.</p>}
    {actions.map(action => <ActionRow key={action.id} action={action} disabled={!!pending} onUpdate={updateAction} onDelete={deleteAction} />)}
  </section>
}

function ActionRow({ action, disabled, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ action_text: action.action_text || '', owner: action.owner || '', due_date: action.due_date || '' })
  const [error, setError] = useState('')
  async function save(event) {
    event.preventDefault(); setError('')
    try { if (await onUpdate(action, actionValues(form))) setEditing(false) }
    catch (saveError) { setError(saveError.message) }
  }
  return <div className="client-health-action-row">
    <button className="btn btn-ghost btn-icon btn-sm" aria-label={action.is_done ? `Mark action incomplete: ${action.action_text}` : `Complete action: ${action.action_text}`} aria-pressed={!!action.is_done} disabled={disabled} onClick={() => onUpdate(action, { is_done: !action.is_done })}>{action.is_done ? <Check size={16} color="var(--green)" /> : <span className="client-health-open-action" />}</button>
    <div style={{ flex: 1, minWidth: 0 }}>{editing ? <form onSubmit={save}><ActionFields form={form} setForm={setForm} prefix="Edit" />{error && <p className="client-health-error" role="alert">{error}</p>}<div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={disabled}>Save changes</button><button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => setEditing(false)}>Cancel</button></div></form> : <><p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textDecoration: action.is_done ? 'line-through' : 'none' }}>{action.action_text}</p><p className="client-health-note">{action.owner ? `Owner: ${action.owner}` : 'Owner not set'} · {action.due_date ? `Due: ${parseReportingDate(action.due_date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || action.due_date}` : 'No due date'} · {action.is_done ? 'Done' : 'Open'}</p></>}</div>
    {!editing && <div className="flex gap-1"><button className="btn btn-ghost btn-icon btn-sm" aria-label="Edit action" disabled={disabled} onClick={() => { setForm({ action_text: action.action_text || '', owner: action.owner || '', due_date: action.due_date || '' }); setEditing(true) }}><Edit2 size={12} /></button><button className="btn btn-danger btn-icon btn-sm" aria-label="Delete action" disabled={disabled} onClick={() => onDelete(action)}><Trash2 size={12} /></button></div>}
  </div>
}

function EntryDetails({ client, entry, showScores = true }) {
  return <div className="client-health-detail">{showScores && <ScoreDetails entry={entry} />}<h4>Notes / observations</h4><p className="client-health-saved-note">{entry.notes || 'No notes saved.'}</p><ActionsPanel key={entry.id} client={client} entry={entry} /></div>
}

function AddClientModal({ onClose, onSave }) {
  const [form, setForm] = useState(() => ({ name: '', ...packageFormValues() }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useClientDialogFocus(onClose, saving)
  async function save(event) {
    event.preventDefault()
    if (saving) return
    const validationError = !form.name.trim() ? 'Enter a client name.' : validateClientPackage(form, { requirePackage: true })
    if (validationError) { setError(validationError); return }
    setError(''); setSaving(true)
    try {
      const { data, error: saveError } = await supabase.from('clients').insert({ name: form.name.trim(), ...packagePayload(form), is_active: true, is_archived: false }).select('id').single()
      if (saveError) throw saveError
      if (!data?.id) throw new Error('The client could not be created. Please ask the CEO to check your client editing permissions.')
      await onSave(); onClose()
    } catch (saveError) { setError(`Save failed: ${saveError.message}`) }
    finally { setSaving(false) }
  }
  return <div className="modal-overlay" onClick={() => !saving && onClose()}><div ref={dialogRef} tabIndex={-1} className="modal" style={{ maxWidth: 580 }} role="dialog" aria-modal="true" aria-labelledby="health-add-client-title" onClick={event => event.stopPropagation()}><h2 className="modal-title" id="health-add-client-title">Add Client</h2><form onSubmit={save}>
    <div className="form-group"><label htmlFor="health-client-name">Client Name *</label><input id="health-client-name" data-client-dialog-focus="" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Abriga" required /></div>
    <ClientPackageFields value={form} onChange={setForm} requirePackage showConcepts />
    {error && <p role="alert" className="client-health-error">{error}</p>}<div className="flex gap-2 mt-4"><button className="btn btn-primary" disabled={saving || !form.name.trim()}>{saving ? 'Adding…' : 'Add'}</button><button className="btn btn-ghost" type="button" disabled={saving} onClick={onClose}>Cancel</button></div>
  </form></div></div>
}

export default function Clients() {
  const { profile, isManagement, isOps } = useAuth()
  if (!isManagement && !isOps) return <div className="page-body"><p className="text-muted">Client Health is available to management and operations.</p></div>
  return <ClientHealthPage key={profile?.id} />
}

function ClientHealthPage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState({ entities: [], entries: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [logging, setLogging] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [archiving, setArchiving] = useState(null)
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [completion, setCompletion] = useState('all')
  const [sortBy, setSortBy] = useState('missing')
  const [historyStatus, setHistoryStatus] = useState('all')
  const [historyClient, setHistoryClient] = useState('all')
  const [historyWeek, setHistoryWeek] = useState('all')
  const tab = ['history', 'analytics'].includes(params.get('tab')) ? params.get('tab') : 'weekly'
  const requestedWeek = params.get('week')
  const week = parseReportingDate(requestedWeek) && requestedWeek <= healthCurrentWeek() ? requestedWeek : healthDueWeek()
  const weeks = useMemo(() => [...new Set([week, ...healthWeekOptions(data.entries)])].sort().reverse(), [data.entries, week])
  const entityMap = useMemo(() => new Map(data.entities.map(client => [client.id, client])), [data.entities])
  const load = useCallback(async () => {
    setRefreshing(true)
    try { setData(await fetchHealthData('client')); setError('') }
    catch (loadError) { setError(loadError.message || 'Client Health could not load.') }
    finally { setLoading(false); setRefreshing(false) }
  }, [])
  useEffect(() => {
    let cancelled = false
    fetchHealthData('client').then(next => { if (!cancelled) { setData(next); setError('') } }).catch(loadError => { if (!cancelled) setError(loadError.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { window.addEventListener(HEALTH_REVIEW_EVENT, load); return () => window.removeEventListener(HEALTH_REVIEW_EVENT, load) }, [load])
  useEffect(() => { window.addEventListener('focus', load); return () => window.removeEventListener('focus', load) }, [load])
  function changeTab(value) { const next = new URLSearchParams(params); if (value === 'weekly') next.delete('tab'); else next.set('tab', value); setParams(next) }
  function changeWeek(value) { const next = new URLSearchParams(params); next.set('week', value); setParams(next) }
  function entrySaved(row) { setData(current => ({ ...current, entries: [...current.entries.filter(entry => entry.id !== row.id), row].sort((a, b) => b.week_start.localeCompare(a.week_start)) })) }
  async function archive(client) {
    if (archiving || !confirm(`Archive ${client.name}? This removes the client from active lists while preserving saved history and actions.`)) return
    setArchiving(client.id)
    try {
      const { data: saved, error: saveError } = await supabase.from('clients').update({ is_active: false }).eq('id', client.id).select('id,is_active').single()
      if (saveError) throw saveError
      if (!saved?.id) throw new Error('The archive did not apply. Check your permissions.')
      setData(current => ({ ...current, entities: current.entities.map(row => row.id === client.id ? { ...row, ...saved } : row) })); setError('')
      window.dispatchEvent(new Event(HEALTH_REVIEW_EVENT))
    } catch (saveError) { setError(`Archive failed: ${saveError.message}`) }
    finally { setArchiving(null) }
  }
  const activeWeeklyClients = data.entities.filter(client => isHealthEntityActive('client', client))
  const summary = healthWeekSummary('client', activeWeeklyClients, data.entries, week)
  const weeklyRows = healthEligibleEntities('client', activeWeeklyClients, data.entries, week).map(client => ({ client, entry: data.entries.find(entry => entry.client_id === client.id && entry.week_start === week) }))
    .filter(({ client, entry }) => (!search || client.name.toLowerCase().includes(search.toLowerCase())) && (riskFilter === 'all' || entry?.churn_risk === riskFilter)
      && (completion === 'all' || (completion === 'complete' ? isHealthComplete('client', entry) : !isHealthComplete('client', entry))))
    .sort((a, b) => (sortBy === 'missing' ? Number(isHealthComplete('client', a.entry)) - Number(isHealthComplete('client', b.entry)) : sortBy === 'risk' ? (RISK_ORDER[a.entry?.churn_risk] ?? 4) - (RISK_ORDER[b.entry?.churn_risk] ?? 4) : sortBy === 'score' ? (healthScore('client', a.entry) ?? -1) - (healthScore('client', b.entry) ?? -1) : 0) || a.client.name.localeCompare(b.client.name))
  const historyEntities = data.entities.filter(client => historyStatus === 'all' || (historyStatus === 'active') === isHealthEntityActive('client', client))
  const historyIds = new Set(historyEntities.map(client => client.id))
  const historyRows = data.entries.filter(entry => historyIds.has(entry.client_id) && (historyClient === 'all' || entry.client_id === historyClient) && (historyWeek === 'all' || entry.week_start === historyWeek) && (!search || entityMap.get(entry.client_id)?.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => b.week_start.localeCompare(a.week_start) || (entityMap.get(a.client_id)?.name || '').localeCompare(entityMap.get(b.client_id)?.name || ''))
  const names = new Map()
  data.entities.forEach(client => names.set(client.name.toLowerCase(), (names.get(client.name.toLowerCase()) || 0) + 1))

  return <>
    <div className="page-header"><div className="client-health-heading"><div><h1 className="page-title">Client Health</h1><p className="page-subtitle">Weekly client scores, churn risk, and follow-up actions</p></div><div className="client-health-buttons"><button className="btn btn-ghost" disabled={loading || refreshing} onClick={load}>{refreshing ? 'Refreshing…' : 'Refresh'}</button><button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Client</button></div></div></div>
    <div className="page-body">
      <div className="client-health-tabs" role="tablist" aria-label="Client Health views">{[['weekly', 'Weekly logs'], ['history', 'History'], ['analytics', 'Analytics']].map(([value, label]) => <button role="tab" aria-selected={tab === value} key={value} onClick={() => changeTab(value)}>{label}</button>)}</div>
      {error && <div className="client-health-error" role="alert">{error} <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>}
      {loading ? <div className="client-health-empty">Loading Client Health…</div> : error && !data.entities.length ? null : tab === 'analytics' ? <HealthAnalytics kind="client" entities={data.entities} entries={data.entries} /> : tab === 'weekly' ? <>
        <div className="client-health-controls"><label className="client-health-field">Week starting<select value={week} onChange={event => changeWeek(event.target.value)}>{weeks.map(value => <option key={value} value={value}>{weekText(value)}{value === healthDueWeek() ? ' · due now' : value === healthCurrentWeek() ? ' · in progress' : ''}</option>)}</select></label>{week !== healthDueWeek() && <button className="btn btn-ghost btn-sm" onClick={() => changeWeek(healthDueWeek())}>Go to due week</button>}</div>
        <p className="client-health-note">{legacyWeek(week) ? 'Legacy records retain their original saved date. Edit existing logs here; new logs use Monday week-start dates.' : week === healthCurrentWeek() ? 'This week is still in progress. The standard Monday review covers the prior completed week.' : 'Complete a fresh log for each client every Monday for the prior completed week. Earlier logs are not treated as current submissions.'}</p>
        <div className="stat-row"><div className="stat-box"><div className="stat-box-label">Clients to review</div><div className="stat-box-value">{summary.eligible}</div></div><div className="stat-box"><div className="stat-box-label">Complete logs</div><div className="stat-box-value text-green">{summary.complete}</div></div><div className="stat-box"><div className="stat-box-label">Missing / incomplete</div><div className="stat-box-value text-amber">{summary.missing + summary.partial}</div></div><div className="stat-box"><div className="stat-box-label">Average score</div><div className="stat-box-value">{summary.average == null ? '—' : summary.average.toFixed(1)}</div></div><div className="stat-box"><div className="stat-box-label">High risk / leaving</div><div className="stat-box-value text-red">{summary.highRisk}</div></div></div>
        <p className="client-health-note">Coverage uses the current active roster eligible by week end; past clients remain in History. This is not a historical roster reconstruction. Average and risk counts use complete logs only. Filters below affect the list, not these totals.</p>
        <div className="client-health-controls"><label className="client-health-field">Find a client<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Client name…" /></label><label className="client-health-field">Risk<select value={riskFilter} onChange={event => setRiskFilter(event.target.value)}><option value="all">All risks</option>{CONFIG.risks.map(risk => <option key={risk}>{risk}</option>)}</select></label><label className="client-health-field">Completion<select value={completion} onChange={event => setCompletion(event.target.value)}><option value="all">All clients</option><option value="missing">Missing / incomplete</option><option value="complete">Complete logs</option></select></label><label className="client-health-field">Sort<select value={sortBy} onChange={event => setSortBy(event.target.value)}><option value="missing">Needs logging first</option><option value="risk">Highest risk first</option><option value="score">Lowest score first</option><option value="name">Client name</option></select></label></div>
        <div className="client-health-list">{weeklyRows.map(({ client, entry }) => <article className="card client-health-card" key={client.id}><div className="client-health-card-top"><div><h3>{client.name}</h3><p className="client-health-note">{!isHealthEntityActive('client', client) ? 'Paused / past client · ' : ''}{!entry ? 'Not logged for this week' : isHealthComplete('client', entry) ? `Complete log · ${weekText(entry.week_start)}` : 'Incomplete log · select every score and risk'}</p></div><div className="client-health-buttons">{entry && <><RiskBadge risk={entry.churn_risk} /><strong className="client-health-average">{scoreText(entry)}<small> / 5</small></strong></>}{(entry || !legacyWeek(week)) && <button className="btn btn-primary btn-sm" onClick={() => setLogging({ client, existing: entry, week })}>{entry ? 'Edit log' : 'Log week'}</button>}{entry && <button className="btn btn-ghost btn-sm" aria-expanded={expanded === entry.id} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>Notes & actions</button>}{isHealthEntityActive('client', client) && <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Archive ${client.name}`} disabled={!!archiving} onClick={() => archive(client)}><Archive size={14} /></button>}</div></div>{entry && <ScoreDetails entry={entry} />}{entry && expanded === entry.id && <EntryDetails client={client} entry={entry} showScores={false} />}</article>)}{!weeklyRows.length && <p className="client-health-empty">No clients match this week and these filters.</p>}</div>
      </> : <>
        <div className="client-health-controls"><label className="client-health-field">Client status<select value={historyStatus} onChange={event => { setHistoryStatus(event.target.value); setHistoryClient('all') }}><option value="all">Current + past clients</option><option value="active">Active clients</option><option value="past">Paused / past clients</option></select></label><label className="client-health-field">Client<select value={historyClient} onChange={event => setHistoryClient(event.target.value)}><option value="all">All clients in view</option>{historyEntities.map(client => <option key={client.id} value={client.id}>{client.name}{names.get(client.name.toLowerCase()) > 1 ? ` · ${isHealthEntityActive('client', client) ? 'Active' : 'Paused / past'} · ${client.id.slice(-6)}` : ''}</option>)}</select></label><label className="client-health-field">Saved week<select value={historyWeek} onChange={event => setHistoryWeek(event.target.value)}><option value="all">All saved weeks</option>{[...new Set(data.entries.map(entry => entry.week_start))].sort().reverse().map(value => <option key={value} value={value}>{weekText(value)}</option>)}</select></label><label className="client-health-field">Find a client<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Client name…" /></label></div>
        <p className="client-health-note">{historyRows.length} saved logs. Historical dates, notes, and linked actions remain attached to their original records; legacy non-Monday dates are not moved.</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div className="table-wrap"><table className="client-health-history"><thead><tr><th>Client</th><th>Saved week start</th><th>Score</th><th>Churn risk</th><th>Completion</th><th>Notes / actions</th></tr></thead><tbody>{historyRows.map(entry => {
          const client = entityMap.get(entry.client_id)
          return <Fragment key={entry.id}><tr><td>{client.name}<div className="client-health-note">{isHealthEntityActive('client', client) ? 'Active' : 'Paused / past'}</div></td><td>{weekText(entry.week_start)}</td><td>{scoreText(entry)} / 5</td><td><RiskBadge risk={entry.churn_risk} /></td><td>{isHealthComplete('client', entry) ? 'Complete' : 'Incomplete log'}</td><td><div className="client-health-buttons"><button className="btn btn-ghost btn-sm" aria-expanded={expanded === entry.id} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>Inspect log</button><button className="btn btn-ghost btn-sm" onClick={() => setLogging({ client, existing: entry, week: entry.week_start })}>Edit exact log</button></div></td></tr>{expanded === entry.id && <tr><td colSpan={6} style={{ padding: 0 }}><EntryDetails client={client} entry={entry} /></td></tr>}</Fragment>
        })}{!historyRows.length && <tr><td colSpan={6} className="client-health-empty">No saved logs match these filters.</td></tr>}</tbody></table></div></div>
      </>}
    </div>
    {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onSave={load} />}
    {logging && <EntryModal key={`${logging.client.id}:${logging.week}:${logging.existing?.id || 'new'}`} {...logging} onClose={() => setLogging(null)} onSave={entrySaved} />}
  </>
}
