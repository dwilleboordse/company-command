import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Flag, LockKeyhole, Plus, Save, Send } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getClientStrategistIds, getClientStrategistNames } from '../lib/clientAssignments'
import { isCreativeStrategist } from '../lib/creativeStrategyRoles'
import { formatSpendMoney, isCompleteSpendEntry, spendClientOptionLabels, spendShare, spendStatus, summarizeSpend } from '../lib/spendAnalytics'
import { weekLabel } from '../lib/dates'
import { canUseCreativeLeadership, canReviewCreativeLeadership, isCreativeLead, creativeLeadDueWeek, shiftCreativeLeadWeek, newClientReview, validateCreativeReview, validateCreativeReviewWeek, creativeClientNeedsAction, safeCreativeEvidenceUrl, CREATIVE_LEAD_FIRST_WEEK, CREATIVE_QUALITY_OPTIONS, CREATIVE_CHECK_OPTIONS, CREATIVE_GROWTH_OPTIONS, addBusinessDays } from '../lib/creativeLeadership'
import { newCreativeResults, validateCreativeResults, summarizeCreativeResults, creativeResultsPeriod, creativeResultsBreakdown, winnerBenchmark } from '../lib/creativeLeadershipResults'
import { loadCreativeLeadership, createCreativeReview, saveCreativeReview, saveCreativeAction, saveCreativeCoaching, publishCreativeFeedback } from '../lib/creativeLeadershipData'
import './CreativeLeadership.css'

const EMPTY_DATA = { reviews: [], clients: [], members: [], entries: [], actions: [], coaching: [], feedback: [] }
const TABS = [['weekly', 'Weekly review'], ['actions', 'Actions & risks'], ['coaching', 'Coaching'], ['history', 'History & scorecard']]
const CHECKS = [['research_check', 'Research & rationale'], ['brief_check', 'Brief readiness'], ['signoff_check', 'Final sign-offs'], ['learning_check', 'Learning & next tests']]
const REVIEW_LABELS = { draft: 'Draft', submitted: 'Awaiting review', changes_requested: 'Changes requested', finalized: 'Finalized' }
const ACTION_STATUSES = ['open', 'in_progress', 'blocked', 'resolved']
const label = value => String(value || '').replaceAll('_', ' ')
const dubaiDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const timestamp = value => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded'
const safeUrl = safeCreativeEvidenceUrl
const ignoreDirty = () => {}

function Status({ value, children }) {
  return <span className={`cl-status cl-status-${value || 'unset'}`}>{children || REVIEW_LABELS[value] || label(value) || 'Not reviewed'}</span>
}

function SpendHealth({ share }) {
  const status = spendStatus(share)
  return <span className="cl-status" style={{ color: status.color, background: status.bg }}>{status.label}</span>
}

const resultsRecorded = row => ['logged', 'no_tests'].includes(row.results?.status) && !validateCreativeResults(row.results, { submission: true })
const percent = value => value === null || value === undefined ? '—' : `${value.toFixed(1)}%`

function Field({ label: title, children, hint, wide = false }) {
  return <label className={`cl-field${wide ? ' cl-wide' : ''}`}><span>{title}</span>{children}{hint && <small>{hint}</small>}</label>
}

function EvidenceLink({ value, children = 'Open evidence' }) {
  const url = safeUrl(value)
  return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children} ↗</a> : <span className="cl-muted">No linked evidence</span>
}

function Options({ options }) {
  return <>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</>
}

function ClientOptions({ clients, includeAll = false, preservedId = null }) {
  const labels = spendClientOptionLabels(clients)
  return <>{clients.filter(client => includeAll || client.is_active === true && !client.is_archived || client.id === preservedId)
    .map(client => <option key={client.id} value={client.id}>{labels.get(client.id)}</option>)}</>
}

function initialClientId(clients, existing) {
  return existing.id || clients.some(client => client.id === existing.client_id)
    ? existing.client_id || '' : ''
}

function useDirtyNotice(name, dirty, onDirty) {
  useEffect(() => { onDirty(name, dirty); return () => onDirty(name, false) }, [name, dirty, onDirty])
}

export default function CreativeLeadership() {
  const { profile } = useAuth()
  const allowed = canUseCreativeLeadership(profile)
  const reviewer = canReviewCreativeLeadership(profile)
  const [data, setData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const savingDisabled = busy || refreshRequired
  const [tab, setTab] = useState('weekly')
  const [params, setParams] = useSearchParams()
  const week = validateCreativeReviewWeek(params.get('week')) ? params.get('week') : creativeLeadDueWeek()
  const lead = params.get('lead') || ''
  const setWeek = value => setParams(current => { const next = new URLSearchParams(current); next.set('week', value); return next })
  const setLead = value => setParams(current => { const next = new URLSearchParams(current); next.set('lead', value); return next })
  const [dirtyForms, setDirtyForms] = useState({})
  const [suggestedClient, setSuggestedClient] = useState(null)
  const hasDirty = Object.values(dirtyForms).some(Boolean)
  const onDirty = useCallback((name, dirty) => setDirtyForms(current => current[name] === dirty ? current : { ...current, [name]: dirty }), [])

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    loadCreativeLeadership().then(next => { if (!cancelled) { setData(next); setLoadedOnce(true); setError('') } })
      .catch(loadError => { if (!cancelled) setError(loadError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [allowed])

  useEffect(() => {
    if (!hasDirty) return
    const savedIndex = window.history.state?.idx
    const savedUrl = window.location.href
    let restoringHistory = false
    const beforeUnload = event => { event.preventDefault(); event.returnValue = '' }
    const historyNavigation = event => {
      if (restoringHistory) { restoringHistory = false; return }
      if (window.confirm('You have unsaved changes. Leave this review and discard them?')) return
      // Capture runs before BrowserRouter's bubble listener, keeping the editor
      // mounted while we restore the browser's previous history position.
      event.stopImmediatePropagation()
      const nextIndex = window.history.state?.idx
      if (Number.isInteger(savedIndex) && Number.isInteger(nextIndex) && savedIndex !== nextIndex) {
        restoringHistory = true
        window.history.go(savedIndex - nextIndex)
      } else window.history.replaceState(window.history.state, '', savedUrl)
    }
    const followLink = event => {
      const anchor = event.target.closest?.('a[href]')
      if (!anchor || anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return
      if (anchor.href === window.location.href || anchor.getAttribute('href')?.startsWith('#')) return
      if (!window.confirm('You have unsaved changes. Leave this page and discard them?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('popstate', historyNavigation, true)
    document.addEventListener('click', followLink, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('popstate', historyNavigation, true); document.removeEventListener('click', followLink, true) }
  }, [hasDirty, params])

  const leads = data.members.filter(isCreativeLead)
  const leadId = isCreativeLead(profile) && !reviewer ? profile.id : lead || leads[0]?.id || data.reviews[0]?.lead_id || ''
  const selectedReview = data.reviews.find(review => review.week_start === week && review.lead_id === leadId)
  const memberById = useMemo(() => new Map(data.members.map(member => [member.id, member])), [data.members])
  const changeSelection = next => {
    if (dirtyForms.weekly && !window.confirm('Discard unsaved weekly-review changes before switching reviews? Your other open forms will be kept.')) return
    setNotice(''); if (!refreshRequired) setError(''); next()
  }
  const reload = async () => { setData(await loadCreativeLeadership()); setLoadedOnce(true); setRefreshRequired(false) }
  const retryLoad = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await reload() }
    catch (loadError) { setError(`Could not refresh the workspace: ${loadError.message}`) }
    finally { setBusy(false) }
  }
  const mutate = async (operation, success) => {
    if (savingDisabled) return false
    setBusy(true); setError(''); setNotice('')
    try {
      await operation()
      setNotice(success)
      try { await reload() }
      catch (reloadError) { setRefreshRequired(true); setError(`Your change was saved, but the updated view could not be loaded: ${reloadError.message}. Retry loading to re-enable editing; do not create the record again.`) }
      return true
    }
    catch (mutationError) { setError(mutationError.message || 'This change could not be saved. Please try again.'); return false }
    finally { setBusy(false) }
  }
  const openClientAction = clientId => { setSuggestedClient({ clientId, nonce: Date.now() }); setTab('actions') }
  const openReview = review => changeSelection(() => { setParams({ lead: review.lead_id, week: review.week_start }); setTab('weekly') })
  const activeActions = data.actions.filter(action => action.status !== 'resolved')
  const overdue = activeActions.filter(action => action.due_date && action.due_date < dubaiDate())

  if (!allowed) return <div className="page-body"><div className="card cl-empty"><LockKeyhole size={24} /><h2>Private creative leadership workspace</h2><p>This page is available to the Head of Creative Strategy, Operations Manager, and CEO.</p><Link to="/">Return to your dashboard</Link></div></div>

  return <>
    <header className="page-header cl-page-header"><div><div className="cl-eyebrow">TEAM QUALITY · FOLLOW-THROUGH · LEARNING</div><h1 className="page-title">Creative Leadership</h1><p className="page-subtitle">Turn client reviews into clear actions and measurable improvement.</p></div><span className="cl-private"><LockKeyhole size={14} />Private leadership workspace</span></header>
    <div className="page-body cl-page">
      {error && <div className="cl-alert cl-error" role="alert"><span>{error}</span><button className="btn btn-ghost btn-sm" disabled={busy} onClick={retryLoad}>Retry loading</button></div>}
      {notice && <div className="cl-alert cl-success" role="status"><CheckCircle2 size={16} />{notice}</div>}
      {loadedOnce && <div className="cl-metrics"><Metric title="Open actions" value={activeActions.length} detail="Carried across weekly reviews" /><Metric title="Overdue actions" value={overdue.length} detail="Across the leadership workspace" warn={overdue.length > 0} /><Metric title="Awaiting review" value={data.reviews.filter(review => review.status === 'submitted').length} detail="Operations / CEO review required" /><Metric title="Results entered · selected week" value={selectedReview ? `${selectedReview.client_reviews?.filter(resultsRecorded).length || 0} / ${selectedReview.client_snapshot?.length || 0}` : 'No review yet'} detail="Manual results from Google Sheets · saved entries" /></div>}
      <nav className="cl-tabs" aria-label="Creative Leadership views">{TABS.map(([value, text]) => <button type="button" key={value} className={tab === value ? 'active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{text}</button>)}</nav>
      {loading ? <div className="cl-empty" role="status"><div className="spinner" /><p>Loading creative leadership…</p></div> : !loadedOnce ? <div className="card cl-empty"><h2>Workspace data is unavailable</h2><p>No records are shown until the workspace loads successfully. Retry loading above before creating or editing anything.</p></div> : <>
        <section hidden={tab !== 'weekly'} aria-label="Weekly review">
          <div className="cl-toolbar"><div className="cl-week"><button className="btn btn-ghost btn-sm" disabled={busy || week <= CREATIVE_LEAD_FIRST_WEEK} aria-label="Previous review week" onClick={() => changeSelection(() => setWeek(shiftCreativeLeadWeek(week, -1)))}><ChevronLeft size={17} /></button><div><strong>{weekLabel(week)}, {week.slice(0, 4)}</strong><small>{week === creativeLeadDueWeek() ? 'Latest due review · previous completed week' : 'Historical review week'} · Dubai time</small></div><button className="btn btn-ghost btn-sm" disabled={busy || week >= creativeLeadDueWeek()} aria-label="Next review week" onClick={() => changeSelection(() => setWeek(shiftCreativeLeadWeek(week, 1)))}><ChevronRight size={17} /></button>{week !== creativeLeadDueWeek() && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => changeSelection(() => setWeek(creativeLeadDueWeek()))}>Latest due week</button>}</div>{reviewer && <Field label="Creative lead"><select value={leadId} disabled={busy} onChange={event => changeSelection(() => setLead(event.target.value))}>{[...new Set([...leads.map(member => member.id), ...data.reviews.map(review => review.lead_id)])].map(id => <option key={id} value={id}>{memberById.get(id)?.full_name || 'Previous creative lead'}</option>)}{!leadId && <option value="">No creative lead assigned</option>}</select></Field>}</div>
          {selectedReview ? <WeeklyReview key={`${selectedReview.id}:${selectedReview.version}`} review={selectedReview} data={data} profile={profile} busy={savingDisabled} onDirty={onDirty} mutate={mutate} onAddAction={openClientAction} /> : <div className="card cl-empty"><ClipboardCheck size={30} /><h2>No review for this week yet</h2><p>{isCreativeLead(profile) && leadId === profile.id ? 'Start a draft with the current active client roster. Review each client, link evidence, and add actions where attention is needed.' : 'The Head of Creative Strategy starts and submits this review. You can then request changes or finalize it.'}</p>{isCreativeLead(profile) && leadId === profile.id && <button className="btn btn-primary" disabled={savingDisabled} onClick={() => mutate(() => createCreativeReview(week), 'Weekly review created. Your active client roster has been captured.')}><Plus size={16} />Start weekly review</button>}</div>}
        </section>
        <section hidden={tab !== 'actions'} aria-label="Actions and risks"><ActionWorkspace data={data} busy={savingDisabled} mutate={mutate} onDirty={onDirty} suggestedClient={suggestedClient} /></section>
        <section hidden={tab !== 'coaching'} aria-label="Strategist coaching"><CoachingWorkspace data={data} busy={savingDisabled} mutate={mutate} onDirty={onDirty} /></section>
        <section hidden={tab !== 'history'} aria-label="History and scorecard"><HistoryScorecard data={data} leadId={leadId} onOpen={openReview} reviewer={reviewer} /></section>
      </>}
    </div>
  </>
}

function Metric({ title, value, detail, warn }) {
  return <div className={`cl-metric${warn ? ' cl-metric-warn' : ''}`}><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>
}

function WeeklyReview({ review, data, profile, busy, onDirty, mutate, onAddAction, readOnly = false }) {
  const initialRows = (review.client_snapshot || []).map(client => {
    const existing = review.client_reviews?.find(row => row.client_id === client.id)
    if (existing) return existing
    const row = newClientReview(client)
    // Old drafts must not acquire a new required results record merely by
    // opening the editor. An explicit results edit adds it when appropriate.
    if (Number(review.results_version || 0) < 1) delete row.results
    return row
  })
  const [rows, setRows] = useState(initialRows)
  const [summary, setSummary] = useState(review.summary || '')
  const [feedback, setFeedback] = useState(review.reviewer_feedback || '')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [localError, setLocalError] = useState('')
  const editable = !readOnly && isCreativeLead(profile) && review.lead_id === profile.id && ['draft', 'changes_requested'].includes(review.status)
  const reviewable = !readOnly && canReviewCreativeLeadership(profile) && review.status === 'submitted'
  const dirty = editable && (summary !== (review.summary || '') || JSON.stringify(rows) !== JSON.stringify(initialRows)) || reviewable && feedback !== (review.reviewer_feedback || '')
  useDirtyNotice('weekly', dirty, onDirty)
  const rowById = new Map(rows.map(row => [row.client_id, row]))
  const snapshot = review.client_snapshot || []
  const frozen = readOnly || ['submitted', 'finalized'].includes(review.status)
  const entries = (frozen ? review.spend_snapshot || [] : data.entries).filter(entry => entry.week_start === review.week_start)
  const clientIds = new Set(snapshot.map(client => client.id))
  const scopedSpend = entries.filter(entry => clientIds.has(entry.client_id))
  const spend = summarizeSpend(scopedSpend)
  const pairedSpend = summarizeSpend(scopedSpend.filter(isCompleteSpendEntry))
  const reviewed = rows.filter(row => row.quality_status && CHECKS.every(([key]) => row[key]) && row.growth_guide_status && row.evidence_url?.trim() && row.next_tests?.trim()).length
  const filteredClients = snapshot.filter(client => (!search || client.name?.toLowerCase().includes(search.toLowerCase())) && (filter === 'all' || filter === 'unreviewed' && !rowById.get(client.id)?.quality_status || filter === 'attention' && rowById.get(client.id)?.quality_status && creativeClientNeedsAction(rowById.get(client.id))))
  const patchRow = (clientId, patch) => setRows(current => current.map(row => row.client_id === clientId ? { ...row, ...patch } : row))
  const save = async status => {
    const patch = { summary, client_reviews: rows, status }
    for (const row of rows) {
      const resultError = validateCreativeResults(row.results)
      if (resultError) { setLocalError(`${snapshot.find(client => client.id === row.client_id)?.name || 'Client'}: ${resultError}`); return }
    }
    const validation = status === 'submitted' ? validateCreativeReview({ ...review, ...patch }, data.actions) : ''
    if (validation) { setLocalError(validation); return }
    if (status === 'submitted' && !window.confirm('Submit this weekly review to Operations / CEO? Client reviews, spend, and action evidence will be captured. You cannot edit it unless changes are requested.')) return
    setLocalError('')
    await mutate(() => saveCreativeReview(review, patch), status === 'submitted' ? 'Weekly review submitted. Operations / CEO can now review it.' : 'Draft saved.')
  }
  const reviewerAction = async status => {
    if (status === 'changes_requested' && !feedback.trim()) { setLocalError('Add feedback explaining the changes needed.'); return }
    if (status === 'finalized' && !window.confirm('Finalize this review? The submitted weekly record will be read-only and preserved.')) return
    setLocalError('')
    await mutate(() => saveCreativeReview(review, { status, reviewer_feedback: feedback }), status === 'finalized' ? 'Weekly review finalized.' : 'Changes requested. The creative lead can update and resubmit this review.')
  }

  return <div className="cl-stack">
    <div className="card cl-review-banner"><div><Status value={review.status} /><h2>{data.members.find(member => member.id === review.lead_id)?.full_name || 'Creative lead'}’s weekly review</h2><p>{snapshot.length} clients captured when this draft was created. Final sign-offs stay with production and the assigned strategist; the lead reviews high-risk work and a team-wide sample.</p></div><Link className="btn btn-ghost btn-sm" to="/spend">Open Spend Tracker<ArrowRight size={14} /></Link></div>
    {review.reviewer_feedback && <div className="cl-callout"><strong>Operations / CEO feedback</strong><p className="cl-preserve">{review.reviewer_feedback}</p></div>}
    <div className="cl-metrics"><Metric title="Client reviews filled" value={`${reviewed} / ${snapshot.length}`} detail="Submission also checks flagged-client actions" /><Metric title="DDU spend · complete logs" value={formatSpendMoney(pairedSpend.ddu)} detail={frozen ? 'Captured at submission' : 'Live complete paired spend for this week'} /><Metric title="Weighted DDU share" value={percent(spend.share)} detail={<><SpendHealth share={spend.share} /> · complete paired spend only</>} /><Metric title="Complete spend logs" value={`${spend.loggedClients} / ${snapshot.length}`} detail={`${spend.incomplete} incomplete entries · missing is not zero`} /></div>
    <div className="cl-callout"><div><strong>Weekly results from your Google Sheet</strong><p>Record only newly classified results for this review week—not cumulative monthly totals or the same ads again. Super-winners are included within winners. Blocked and inconclusive ads are kept outside the eligible tested-ad count. {Number(review.results_version || 0) >= 1 ? 'Choose a results status for every client before submitting.' : 'This review predates manual results. Historical missing results remain unavailable, not zero; editable drafts can be filled voluntarily.'}</p></div></div>
    <div className="cl-toolbar"><div><h2>Client creative review</h2><p className="cl-muted">Review the work, link the evidence, and make the next step explicit.</p></div><div className="cl-inline"><Field label="Search captured clients"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Client name…" /></Field><Field label="Review filter"><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All clients</option><option value="unreviewed">Not reviewed</option><option value="attention">Needs attention / blocked</option></select></Field></div></div>
    {!snapshot.length && <div className="cl-callout">No active clients were captured in this review. No client performance has been assumed.</div>}
    <div className="cl-client-list">{filteredClients.map(client => {
      const row = rowById.get(client.id)
      const entry = entries.find(value => value.client_id === client.id)
      const linkedActions = (frozen ? review.actions_snapshot || [] : data.actions).filter(action => action.client_id === client.id && action.status !== 'resolved')
      return <details key={client.id} className="cl-client">
        <summary>
          <div className="cl-client-name"><strong>{client.name}</strong><small>{(client.strategist_names?.map(member => member.name).filter(Boolean) || getClientStrategistNames(client, data.members)).join(', ') || 'No strategist recorded'}</small><small>{resultsRecorded(row) ? 'Results recorded' : row.results?.status === 'unavailable' ? 'Results unavailable' : Number(review.results_version || 0) >= 1 ? 'Results not entered' : 'Historical results not captured'}</small></div>
          <div className="cl-client-spend"><strong>{entry ? formatSpendMoney(entry.ddu_spend) : '—'} DDU</strong><small>{!entry ? 'Spend not logged' : !isCompleteSpendEntry(entry) ? 'Incomplete spend log' : spendShare(entry) === null ? 'Zero total spend logged' : `${spendShare(entry).toFixed(1)}% of total spend`}</small><SpendHealth share={entry ? spendShare(entry) : null} /></div>
          <Status value={row?.quality_status} /><span className="cl-client-chevron">Review ↓</span>
        </summary>
        <div className="cl-client-body">
          <CreativeResultsEditor results={row.results} disabled={!editable || busy} legacy={Number(review.results_version || 0) < 1} onChange={results => patchRow(client.id, { results })} />
          <h3 className="cl-section-title">Creative quality & next steps</h3>
          <fieldset disabled={!editable || busy} className="cl-form-grid">
            <Field label="Creative quality status"><select value={row.quality_status || ''} onChange={event => patchRow(client.id, { quality_status: event.target.value })}><option value="">Choose a status</option><Options options={CREATIVE_QUALITY_OPTIONS} /></select></Field>
            <Field label="Growth Guide"><select value={row.growth_guide_status || ''} onChange={event => patchRow(client.id, { growth_guide_status: event.target.value })}><option value="">Choose a status</option><Options options={CREATIVE_GROWTH_OPTIONS} /></select></Field>
            {CHECKS.map(([key, title]) => <Field key={key} label={title}><select value={row[key] || ''} onChange={event => patchRow(client.id, { [key]: event.target.value })}><option value="">Not reviewed</option><Options options={CREATIVE_CHECK_OPTIONS} /></select></Field>)}
            <Field label="Diagnosis / what needs to change" wide hint="Separate production or client revisions from performance-testing iterations. Editing revisions are not additional test rounds."><textarea maxLength={6000} rows={3} value={row.diagnosis || ''} onChange={event => patchRow(client.id, { diagnosis: event.target.value })} placeholder="What did you identify, and what is the likely cause?" /></Field>
            <Field label="Next tests / next action" wide><textarea maxLength={6000} rows={2} value={row.next_tests || ''} onChange={event => patchRow(client.id, { next_tests: event.target.value })} placeholder="What will we try next, and what should we learn?" /></Field>
            <Field label="Blocker / dependency" wide><textarea maxLength={6000} rows={2} value={row.blocker || ''} onChange={event => patchRow(client.id, { blocker: event.target.value })} placeholder="Optional: what is preventing progress?" /></Field>
            <Field label="Evidence link" wide hint="Link the Growth Guide, reviewed creative batch, or task. Required when submitting."><input maxLength={2000} type="url" value={row.evidence_url || ''} onChange={event => patchRow(client.id, { evidence_url: event.target.value })} placeholder="https://…" /></Field>
          </fieldset>
          <div className="cl-client-footer"><EvidenceLink value={row.evidence_url} /><span>{linkedActions.length} open linked {linkedActions.length === 1 ? 'action' : 'actions'}{frozen ? ' at submission' : ''}</span>{editable && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAddAction(client.id)}><Plus size={14} />Add linked action</button>}</div>
          {!!linkedActions.length && <ul className="cl-linked-actions">{linkedActions.map(action => <li key={action.id}><strong>{action.title}</strong> · {data.members.find(member => member.id === action.owner_id)?.full_name || 'Owner'} · due {action.due_date} <Status value={action.status} /></li>)}</ul>}
        </div>
      </details>
    })}{snapshot.length > 0 && !filteredClients.length && <div className="cl-empty">No clients match this filter. Your unsaved reviews are preserved.</div>}</div>
    <div className="card cl-summary"><h2>Leadership summary</h2><Field label="What changed, what matters, and what happens next?" hint="Summarize material improvements, risks, coaching priorities, and decisions needed. Do not copy every client note."><textarea maxLength={12000} rows={5} disabled={!editable || busy} value={summary} onChange={event => setSummary(event.target.value)} placeholder="Key wins and lessons, highest-priority risks, and next week's focus…" /></Field></div>
    {reviewable && <div className="card cl-summary"><h2>Operations / CEO review</h2><Field label="Feedback to the creative lead" hint="This is visible inside the private leadership workspace. It is not published to the wider team."><textarea maxLength={12000} rows={4} disabled={busy} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Decisions, questions, or required changes…" /></Field><div className="cl-inline"><button className="btn btn-ghost" disabled={busy} onClick={() => reviewerAction('changes_requested')}>Request changes</button><button className="btn btn-primary" disabled={busy} onClick={() => reviewerAction('finalized')}><LockKeyhole size={15} />Finalize weekly review</button></div></div>}
    {localError && <div className="cl-alert cl-error" role="alert">{localError}</div>}
    {editable ? <div className="cl-savebar"><span>{dirty ? 'Unsaved changes' : 'All changes saved'} · save before leaving this review</span><div className="cl-inline"><button className="btn btn-ghost" disabled={busy} onClick={() => save(review.status)}><Save size={15} />{busy ? 'Saving…' : 'Save draft'}</button><button className="btn btn-primary" disabled={busy} onClick={() => save('submitted')}><Send size={15} />Submit weekly review</button></div></div> : <p className="cl-muted cl-preserve">{readOnly ? 'This captured revision is preserved and read-only. Any current actions or review changes are shown separately in the workspace.' : review.status === 'finalized' ? `Finalized ${timestamp(review.finalized_at)}. This weekly record is preserved and read-only.` : review.status === 'submitted' ? `Submitted ${timestamp(review.submitted_at)}. Waiting for Operations / CEO review.` : 'Only this review’s creative lead can edit the draft.'}</p>}
  </div>
}

function CreativeResultsEditor({ results, disabled, legacy, onChange }) {
  const value = results || newCreativeResults()
  const fields = [['eligible_ads', 'Eligible tested ads'], ['winners', 'Winners (including super-winners)'], ['super_winners', 'Super-winners'], ['blocked_ads', 'Blocked ads · excluded'], ['inconclusive_ads', 'Inconclusive ads · excluded']]
  const patch = changes => onChange({ ...value, ...changes })
  const changeStatus = status => {
    if (status !== 'logged' && fields.some(([key]) => Number(value[key]) > 0)
      && !window.confirm('Changing the results status will clear the entered counts. Continue?')) return
    const counts = status === 'logged' ? {} : Object.fromEntries(fields.map(([key]) => [key, status === 'no_tests' ? 0 : null]))
    patch({ status, ...counts })
  }
  const error = validateCreativeResults(value)
  const eligible = Number(value.eligible_ads)
  const canShowRates = resultsRecorded({ results: value }) && value.status === 'logged' && eligible > 0
  return <section className="cl-results-editor" aria-label="Manual creative results">
    <div><h3>Weekly test results</h3><p className="cl-muted">Elish enters the Google Sheet results here. Keep the same tested-ad unit as the source; do not substitute planned concepts or editing revisions. Count each classified ad once across weekly reviews.</p></div>
    <fieldset disabled={disabled} className="cl-form-grid">
      <Field label="Results status" wide><select value={value.status || 'not_entered'} onChange={event => changeStatus(event.target.value)}><option value="not_entered">{legacy ? 'Historical / not entered' : 'Choose a results status'}</option><option value="logged">Results logged</option><option value="no_tests">No eligible tests this week</option><option value="unavailable">Results unavailable</option></select></Field>
      {(value.status === 'logged' || value.status === 'no_tests') && <div className="cl-results-counts cl-wide">{fields.map(([key, title]) => <Field key={key} label={title}><input type="number" min="0" step="1" max="1000000" inputMode="numeric" disabled={value.status === 'no_tests' && ['eligible_ads', 'winners', 'super_winners'].includes(key)} value={value[key] ?? ''} onChange={event => patch({ [key]: event.target.value === '' ? null : Number(event.target.value) })} placeholder="0" /></Field>)}</div>}
      {value.status !== 'not_entered' && <>
        <Field label="Results source link" wide hint="Link the Google Sheet tab or range supporting this week's results. Required for logged results and confirmed no-tests weeks."><input type="url" maxLength={2000} value={value.evidence_url || ''} onChange={event => patch({ evidence_url: event.target.value })} placeholder="https://docs.google.com/spreadsheets/…" /></Field>
        <Field label={value.status === 'unavailable' ? 'Why are results unavailable?' : 'Result notes / account context'} wide hint={value.status === 'unavailable' ? 'Explain the missing source or blocker. Unknown results are never counted as zero.' : 'Record relevant account goals, testing window or spend context, and why ads were excluded.'}><textarea rows={2} maxLength={6000} value={value.notes || ''} onChange={event => patch({ notes: event.target.value })} placeholder={value.status === 'unavailable' ? 'Explain the blocker and next step…' : 'Relevant context from the Google Sheet…'} /></Field>
      </>}
    </fieldset>
    {error && <p className="cl-danger" role="status">{error}</p>}
    {value.status === 'not_entered' && <p className="cl-muted">{legacy ? 'Results were not captured in this historical review. They are excluded from performance rates, not treated as zero.' : 'Choose logged, no eligible tests, or unavailable before submitting.'}</p>}
    {canShowRates && <div className="cl-results-preview"><span><strong>{percent(Number(value.winners) / eligible * 100)}</strong> winner rate</span><span><strong>{percent(Number(value.super_winners) / eligible * 100)}</strong> super-winner rate</span><small>Weekly context only. Evaluate benchmarks monthly and over 90 days, not as a weekly quota.</small></div>}
    {value.status === 'no_tests' && <p className="cl-muted">Confirmed zero eligible tests. Rates are unavailable—not 0%. You can still record blocked or inconclusive ads in the excluded counts above.</p>}
    {value.evidence_url && <EvidenceLink value={value.evidence_url}>Open results source</EvidenceLink>}
  </section>
}

function ActionWorkspace({ data, busy, mutate, onDirty, suggestedClient }) {
  const [editing, setEditing] = useState(null)
  const [status, setStatus] = useState('active')
  const [filterClient, setFilterClient] = useState('')
  const [formDirty, setFormDirty] = useState(false)
  const [handledSuggestion, setHandledSuggestion] = useState(null)
  const onFormDirty = useCallback((_name, value) => setFormDirty(value), [])
  useDirtyNotice('action', formDirty, onDirty)
  const begin = action => { if (formDirty && !window.confirm('Discard this unsaved action?')) return; setEditing(action ? { ...action, editKey: Date.now() } : null); setFormDirty(false) }
  // A suggested client offers an explicit action so an open form is never overwritten.
  const suggested = suggestedClient && suggestedClient.nonce !== handledSuggestion
  const clients = spendClientOptionLabels(data.clients)
  const members = new Map(data.members.map(member => [member.id, member.full_name]))
  const rows = data.actions.filter(action => (!filterClient || action.client_id === filterClient) && (status === 'all' || status === 'active' && action.status !== 'resolved' || action.status === status)).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  return <div className="cl-stack"><div className="cl-toolbar"><div><h2>Close the loop</h2><p className="cl-muted">Actions persist across weeks. Resolve only when there is evidence of the outcome.</p></div><button className="btn btn-primary" disabled={busy} onClick={() => begin({})}><Plus size={15} />New action</button></div><div className="cl-callout"><Flag size={17} /><div><strong>Retention risks should not wait for Monday.</strong><p>Record escalation within 1 business day and a recovery plan within 2. Timestamp buttons record what happened; they do not send notifications or contact anyone.</p></div></div>{suggested && <div className="cl-alert"><span>Add an action for <strong>{clients.get(suggestedClient.clientId) || 'the selected client'}</strong>. Your weekly draft is still open in Weekly review.</span><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => { if (formDirty && !window.confirm('Discard this unsaved action?')) return; setEditing({ client_id: suggestedClient.clientId, editKey: Date.now() }); setFormDirty(false); setHandledSuggestion(suggestedClient.nonce) }}>Create linked action</button></div>}{editing && <ActionForm key={`${editing.id || 'new'}:${editing.editKey || editing.client_id || ''}`} action={editing} data={data} busy={busy} onDirty={onFormDirty} onCancel={() => begin(null)} onSave={async values => { const saved = await mutate(() => saveCreativeAction(values, editing.id ? editing : null), 'Action saved. It will carry forward until resolved.'); if (saved) { setEditing(null); setFormDirty(false) } }} />}
    <div className="cl-inline"><Field label="Action status"><select value={status} onChange={event => setStatus(event.target.value)}><option value="active">Open / in progress / blocked</option><option value="all">All actions</option>{ACTION_STATUSES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field><Field label="Client"><select value={filterClient} onChange={event => setFilterClient(event.target.value)}><option value="">All clients</option><ClientOptions clients={data.clients} includeAll /></select></Field></div>
    <div className="cl-action-list">{rows.map(action => <article className="card cl-action" key={action.id}><div className="cl-toolbar"><div><div className="cl-inline"><Status value={action.status} /><span className="cl-muted">{label(action.kind)} · {clients.get(action.client_id) || 'Team-wide'}</span></div><h3>{action.title}</h3><p className="cl-preserve">{action.action_plan}</p></div><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => begin(action)}>Edit action</button></div><div className="cl-action-meta"><span><strong>Owner:</strong> {members.get(action.owner_id) || 'Previous team member'}</span><span className={action.status !== 'resolved' && action.due_date < dubaiDate() ? 'cl-danger' : ''}><strong>Due:</strong> {action.due_date}</span><EvidenceLink value={action.evidence_url} /></div>{action.kind === 'retention' && <RetentionMilestones action={action} busy={busy} mutate={mutate} />}{action.status === 'resolved' && <div className="cl-callout"><strong>Resolution evidence</strong><p className="cl-preserve">{action.resolution_evidence}</p></div>}<details className="cl-detail"><summary>Diagnosis & details</summary><p className="cl-preserve">{action.diagnosis || 'No diagnosis recorded.'}</p><p className="cl-muted">Strategist: {members.get(action.strategist_id) || 'Not specified'} · Identified: {timestamp(action.identified_at)}</p></details></article>)}{!rows.length && <div className="card cl-empty"><CheckCircle2 size={25} /><h3>No actions in this view</h3><p>Add a specific owner and deadline whenever a review flags a problem.</p></div>}</div>
  </div>
}

function RetentionMilestones({ action, busy, mutate }) {
  const identified = action.identified_at ? dubaiDate(new Date(action.identified_at)) : null
  const escalationDue = identified ? addBusinessDays(identified, 1) : null
  const recoveryDue = identified ? addBusinessDays(identified, 2) : null
  const record = async field => {
    if (!window.confirm(field === 'escalated_at' ? 'Confirm that you have escalated this risk to the responsible person. This records the current timestamp only.' : 'Confirm that a recovery plan has been recorded in the action plan / evidence. This records the current timestamp only.')) return
    await mutate(() => saveCreativeAction({ ...action, [field]: new Date().toISOString() }, action), 'Retention milestone recorded. No external notification was sent.')
  }
  return <div className="cl-retention"><div><strong>Escalation</strong><small>{action.escalated_at ? timestamp(action.escalated_at) : `Due ${escalationDue || 'date not recorded'}`}</small>{!action.escalated_at && action.status !== 'resolved' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => record('escalated_at')}>Mark escalated</button>}</div><div><strong>Recovery plan</strong><small>{action.recovery_plan_at ? timestamp(action.recovery_plan_at) : `Due ${recoveryDue || 'date not recorded'}`}</small>{!action.recovery_plan_at && action.status !== 'resolved' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => record('recovery_plan_at')}>Mark plan recorded</button>}</div><p className="cl-muted">Business days: Monday–Friday. Dates are shown in Dubai time; public holidays are not excluded.</p></div>
}

function ActionForm({ action, data, busy, onDirty, onCancel, onSave }) {
  const initial = { client_id: initialClientId(data.clients, action), strategist_id: action.strategist_id || '', kind: action.kind || 'quality', title: action.title || '', diagnosis: action.diagnosis || '', action_plan: action.action_plan || '', owner_id: action.owner_id || '', due_date: action.due_date || '', status: action.status || 'open', evidence_url: action.evidence_url || '', resolution_evidence: action.resolution_evidence || '' }
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  useDirtyNotice('actionForm', JSON.stringify(form) !== JSON.stringify(initial), onDirty)
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const submit = event => {
    event.preventDefault()
    if (!form.title.trim() || !form.diagnosis.trim() || !form.action_plan.trim() || !form.owner_id || !form.due_date) { setError('Add a title, diagnosis, action plan, owner, and due date.'); return }
    if (form.status === 'resolved' && !form.resolution_evidence.trim()) { setError('Add resolution evidence before marking this action resolved.'); return }
    if (form.evidence_url && !safeUrl(form.evidence_url)) { setError('Use a valid http or https evidence link.'); return }
    setError(''); onSave({ ...form, client_id: form.client_id || null, strategist_id: form.strategist_id || null, ...(action.id ? {} : { identified_at: new Date().toISOString() }) })
  }
  return <form className="card cl-editor" onSubmit={submit}><h3>{action.id ? 'Edit action' : 'New action'}</h3><fieldset disabled={busy} className="cl-form-grid"><Field label="Title" wide><input required maxLength={240} value={form.title} onChange={event => update('title', event.target.value)} placeholder="The specific change we need to make" /></Field><Field label="Client"><select value={form.client_id} onChange={event => update('client_id', event.target.value)}><option value="">Team-wide / no single client</option><ClientOptions clients={data.clients} preservedId={action.client_id} /></select></Field><Field label="Kind"><select value={form.kind} onChange={event => update('kind', event.target.value)}>{['quality', 'retention', 'coaching', 'dependency'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field><Field label="Related strategist"><select value={form.strategist_id} onChange={event => update('strategist_id', event.target.value)}><option value="">Not specified</option>{data.members.filter(member => member.is_active === true && isCreativeStrategist(member) || member.id === form.strategist_id).map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></Field><Field label="Owner"><select required value={form.owner_id} onChange={event => update('owner_id', event.target.value)}><option value="">Choose owner</option>{data.members.filter(member => member.is_active === true || member.id === form.owner_id).map(member => <option key={member.id} value={member.id}>{member.full_name}{member.is_active === false ? ' (inactive)' : ''}</option>)}</select></Field><Field label="Due date"><input required type="date" value={form.due_date} onChange={event => update('due_date', event.target.value)} /></Field><Field label="Status"><select value={form.status} onChange={event => update('status', event.target.value)}>{ACTION_STATUSES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field><Field label="Diagnosis" wide hint="Separate editing / production revisions from performance-testing rounds."><textarea required maxLength={6000} rows={2} value={form.diagnosis} onChange={event => update('diagnosis', event.target.value)} /></Field><Field label="Corrective action / recovery plan" wide><textarea required maxLength={6000} rows={3} value={form.action_plan} onChange={event => update('action_plan', event.target.value)} placeholder="What will happen, and what does success look like?" /></Field><Field label="Evidence link" wide><input maxLength={2000} type="url" value={form.evidence_url} onChange={event => update('evidence_url', event.target.value)} placeholder="https://…" /></Field><Field label="Resolution evidence" wide hint="Required to resolve. Record the outcome and how you verified it, with supporting links if relevant."><textarea maxLength={6000} rows={2} required={form.status === 'resolved'} value={form.resolution_evidence} onChange={event => update('resolution_evidence', event.target.value)} /></Field></fieldset>{error && <div className="cl-alert cl-error" role="alert">{error}</div>}<div className="cl-inline"><button type="submit" disabled={busy} className="btn btn-primary"><Save size={15} />Save action</button><button type="button" disabled={busy} className="btn btn-ghost" onClick={onCancel}>Cancel</button></div></form>
}

function CoachingWorkspace({ data, busy, mutate, onDirty }) {
  const [editing, setEditing] = useState(null)
  const [publishing, setPublishing] = useState(null)
  const [filter, setFilter] = useState('')
  const [formDirty, setFormDirty] = useState(false)
  const onFormDirty = useCallback((_name, value) => setFormDirty(value), [])
  useDirtyNotice('coaching', formDirty, onDirty)
  const begin = value => { if (formDirty && !window.confirm('Discard this unsaved coaching note?')) return; setEditing(value ? { ...value, editKey: Date.now() } : null); setFormDirty(false) }
  const members = new Map(data.members.map(member => [member.id, member.full_name]))
  const clients = spendClientOptionLabels(data.clients)
  const rows = data.coaching.filter(row => !filter || row.strategist_id === filter)
  return <div className="cl-stack"><div className="cl-toolbar"><div><h2>Build the strategist, not just the next brief</h2><p className="cl-muted">Log a clear standard, an agreed improvement, and the follow-up result.</p></div><button className="btn btn-primary" disabled={busy} onClick={() => begin({})}><Plus size={15} />New coaching note</button></div><div className="cl-callout"><LockKeyhole size={17} /><p>These coaching notes are private to this leadership workspace. Use <strong>Publish feedback</strong> to deliberately share a separate message with the selected strategist. Private notes are never included automatically.</p></div>{editing && <CoachingForm key={`${editing.id || 'new'}:${editing.editKey || ''}`} note={editing} data={data} busy={busy} onDirty={onFormDirty} onCancel={() => begin(null)} onSave={async values => { const saved = await mutate(() => saveCreativeCoaching(values, editing.id ? editing : null), 'Private coaching note saved.'); if (saved) { setEditing(null); setFormDirty(false) } }} />}
    <Field label="Strategist" hint={publishing ? 'Publish or cancel your feedback message before changing this filter.' : undefined}><select disabled={!!publishing} value={filter} onChange={event => setFilter(event.target.value)}><option value="">All strategists</option>{data.members.filter(isCreativeStrategist).map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></Field>
    <div className="cl-action-list">{rows.map(note => <article className="card cl-action" key={note.id}><div className="cl-toolbar"><div><div className="cl-inline"><Status value={note.outcome} /><span className="cl-muted">{clients.get(note.client_id) || 'Team-wide coaching'}</span></div><h3>{members.get(note.strategist_id) || 'Previous strategist'}</h3></div><div className="cl-inline"><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => begin(note)}>Edit note</button><button className="btn btn-primary btn-sm" disabled={busy || !!publishing} onClick={() => setPublishing(note)}><Send size={13} />{data.feedback.some(feedback => feedback.coaching_id === note.id) ? 'Replace published feedback' : 'Publish feedback'}</button></div></div><dl className="cl-coaching-detail"><div><dt>Observation</dt><dd>{note.observation}</dd></div><div><dt>Expected standard</dt><dd>{note.expected_standard}</dd></div><div><dt>Agreed action</dt><dd>{note.agreed_action}</dd></div><div><dt>Follow-up result</dt><dd>{note.follow_up || 'Not yet recorded'}</dd></div></dl><p className="cl-muted">Follow-up due: {note.due_date || 'Not set'}</p>{publishing?.id === note.id && <FeedbackForm key={note.id} note={note} replacing={data.feedback.some(feedback => feedback.coaching_id === note.id)} recipient={members.get(note.strategist_id)} busy={busy} onDirty={onDirty} onCancel={() => setPublishing(null)} onPublish={async message => { const saved = await mutate(() => publishCreativeFeedback(note.id, note.strategist_id, message), 'Feedback published to this strategist. Private coaching notes were not shared.'); if (saved) setPublishing(null) }} />}{data.feedback.some(feedback => feedback.coaching_id === note.id) && <details className="cl-detail"><summary>Published feedback</summary>{data.feedback.filter(feedback => feedback.coaching_id === note.id).map(feedback => <div className="cl-published" key={feedback.id}><small>Shared with {members.get(feedback.recipient_id) || 'the strategist'} · {timestamp(feedback.published_at)}</small><p className="cl-preserve">{feedback.message}</p></div>)}</details>}</article>)}{!rows.length && <div className="card cl-empty"><h3>No coaching notes yet</h3><p>Capture recurring patterns and specific examples of the standard you expect.</p></div>}</div>
  </div>
}

function CoachingForm({ note, data, busy, onDirty, onCancel, onSave }) {
  const initial = { strategist_id: note.strategist_id || '', client_id: initialClientId(data.clients, note), observation: note.observation || '', expected_standard: note.expected_standard || '', agreed_action: note.agreed_action || '', due_date: note.due_date || '', follow_up: note.follow_up || '', outcome: note.outcome || 'open' }
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  useDirtyNotice('coachingForm', JSON.stringify(form) !== JSON.stringify(initial), onDirty)
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const submit = event => { event.preventDefault(); if (!form.strategist_id || !form.observation.trim() || !form.expected_standard.trim() || !form.agreed_action.trim() || !form.due_date) { setError('Choose a strategist and complete the observation, standard, agreed action, and follow-up date.'); return } if (form.outcome === 'resolved' && !form.follow_up.trim()) { setError('Record the follow-up result before resolving this coaching note.'); return } setError(''); onSave({ ...form, client_id: form.client_id || null }) }
  return <form onSubmit={submit} className="card cl-editor"><h3>{note.id ? 'Edit private coaching note' : 'New private coaching note'}</h3><fieldset disabled={busy} className="cl-form-grid"><Field label="Strategist"><select required disabled={!!note.id} value={form.strategist_id} onChange={event => update('strategist_id', event.target.value)}><option value="">Choose strategist</option>{data.members.filter(member => member.is_active === true && isCreativeStrategist(member) || member.id === form.strategist_id).map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></Field><Field label="Client"><select value={form.client_id} onChange={event => update('client_id', event.target.value)}><option value="">Team-wide / no single client</option><ClientOptions clients={data.clients} preservedId={note.id ? note.client_id : null} /></select></Field><Field label="Observation / recurring weakness" wide><textarea required maxLength={6000} rows={3} value={form.observation} onChange={event => update('observation', event.target.value)} /></Field><Field label="Expected standard / example" wide><textarea required maxLength={6000} rows={3} value={form.expected_standard} onChange={event => update('expected_standard', event.target.value)} /></Field><Field label="Agreed improvement" wide><textarea required maxLength={6000} rows={3} value={form.agreed_action} onChange={event => update('agreed_action', event.target.value)} /></Field><Field label="Follow-up due"><input required type="date" value={form.due_date} onChange={event => update('due_date', event.target.value)} /></Field><Field label="Outcome"><select value={form.outcome} onChange={event => update('outcome', event.target.value)}>{['open', 'improving', 'resolved'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field><Field label="Follow-up result" wide><textarea maxLength={6000} rows={3} required={form.outcome === 'resolved'} value={form.follow_up} onChange={event => update('follow_up', event.target.value)} placeholder="What changed after coaching? How did you verify it?" /></Field></fieldset>{error && <div className="cl-alert cl-error" role="alert">{error}</div>}<div className="cl-inline"><button type="submit" className="btn btn-primary" disabled={busy}><Save size={15} />Save private note</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button></div></form>
}

function FeedbackForm({ note, recipient, busy, onDirty, onCancel, onPublish, replacing = false }) {
  const [message, setMessage] = useState('')
  useDirtyNotice('publishFeedback', !!message.trim(), onDirty)
  return <form className="cl-feedback-form" onSubmit={event => { event.preventDefault(); if (message.trim() && window.confirm(`${replacing ? 'Replace the currently published feedback with this message' : 'Publish this message'} to ${recipient || 'the selected strategist'}? Only the message you typed will be shared.${replacing ? ' The previous published message will be replaced.' : ''}`)) onPublish(message.trim()) }}><h4>{replacing ? 'Replace published feedback for' : 'Publish feedback to'} {recipient || 'this strategist'}</h4><p className="cl-muted">Only this message will be visible to the recipient. This does not send an email or expose the private coaching record.{replacing ? ' Publishing will replace the message currently visible to this strategist.' : ''}</p><Field label="Message to share"><textarea maxLength={10000} rows={4} required disabled={busy} value={message} onChange={event => setMessage(event.target.value)} placeholder="Write the feedback you want this person to see…" /></Field><div className="cl-inline"><button type="submit" disabled={busy || !message.trim() || !note.strategist_id} className="btn btn-primary btn-sm"><Send size={14} />{replacing ? 'Replace published message' : 'Publish message'}</button><button type="button" disabled={busy} className="btn btn-ghost btn-sm" onClick={() => { if (!message.trim() || window.confirm('Discard this unpublished feedback message?')) onCancel() }}>Cancel</button></div></form>
}

function HistoryScorecard({ data, leadId, onOpen, reviewer }) {
  const [month, setMonth] = useState(() => dubaiDate().slice(0, 7))
  const [mode, setMode] = useState('month')
  const [asOf, setAsOf] = useState(() => dubaiDate())
  const [groupBy, setGroupBy] = useState('client')
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(null)
  const reviews = data.reviews.filter(review => !leadId || review.lead_id === leadId).sort((a, b) => b.week_start.localeCompare(a.week_start))
  // The rolling cutoff is local to that mode; it must not silently filter a
  // calendar month after the user switches reporting modes.
  const finalized = creativeResultsPeriod(reviews, { mode, month, asOf: mode === 'month' ? dubaiDate() : asOf })
  const results = summarizeCreativeResults(finalized)
  const periodStart = mode === 'month' ? `${month}-01` : new Date(new Date(`${asOf}T00:00:00Z`).getTime() - 89 * 86400000).toISOString().slice(0, 10)
  const periodEnd = mode === 'month' ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) : asOf
  const savedInPeriod = reviews.filter(review => review.week_start >= periodStart && review.week_start <= periodEnd)
  const captured = capturedClientWeeks(finalized)
  const totals = summarizeSpend(captured.flatMap(item => item.entry ? [item.entry] : []))
  const pairedTotals = summarizeSpend(captured.flatMap(item => isCompleteSpendEntry(item.entry) ? [item.entry] : []))
  const breakdown = creativeResultsBreakdown(finalized, { groupBy }).filter(row => !search || row.name.toLowerCase().includes(search.toLowerCase()))
  const checks = captured.flatMap(item => CHECKS.map(([key]) => item.row?.[key])).filter(value => value && value !== 'not_applicable')
  const passingChecks = checks.filter(value => value === 'pass').length
  const guidesUpdated = captured.filter(item => item.row?.growth_guide_status === 'updated').length
  const members = new Map(data.members.map(member => [member.id, member.full_name]))
  return <div className="cl-stack">
    <div className="cl-toolbar"><div><h2>Creative performance scorecard</h2><p className="cl-muted">{members.get(leadId) || 'Creative leadership'} · finalized weekly records only. Drafts and submitted reviews are not included.</p></div><div className="cl-inline"><Field label="Reporting period"><select value={mode} onChange={event => setMode(event.target.value)}><option value="month">Calendar month</option><option value="rolling90">Rolling 90 days</option></select></Field>{mode === 'month' ? <Field label="Reporting month"><input type="month" value={month} max={dubaiDate().slice(0, 7)} onChange={event => event.target.value && setMonth(event.target.value)} /></Field> : <Field label="90-day period ending"><input type="date" value={asOf} max={dubaiDate()} onChange={event => event.target.value && setAsOf(event.target.value)} /></Field>}</div></div>
    <p className="cl-muted cl-period-note">Review-week start dates: {periodStart} through {periodEnd}, inclusive · Dubai time; only completed weeks are eligible. Whole weeks are assigned to the period containing their Monday; this is not a daily or ad-launch cohort report.</p>
    <div className="cl-metrics">
      <Metric title="Winner rate" value={percent(results.winner_rate)} detail={<BenchmarkLabel rate={results.winner_rate} type="winner" />} />
      <Metric title="Super-winner rate" value={percent(results.super_winner_rate)} detail={<BenchmarkLabel rate={results.super_winner_rate} type="super_winner" />} />
      <Metric title="Weighted DDU share" value={percent(totals.share)} detail={<><SpendHealth share={totals.share} /> · aim for Healthy or Excellent</>} />
      <Metric title="Results coverage" value={`${results.recorded_clients} / ${results.total_clients}`} detail={`${results.unavailable_clients} unavailable · ${results.missing_clients + results.invalid_clients} missing / invalid client-weeks`} />
    </div>
    <div className="card cl-summary cl-results-overview"><h3>What is included</h3><div className="cl-count-summary"><span><strong>{results.recorded_clients ? results.eligible_ads : '—'}</strong> eligible tested ads</span><span><strong>{results.recorded_clients ? results.winners : '—'}</strong> winners</span><span><strong>{results.recorded_clients ? results.super_winners : '—'}</strong> super-winners <small>already included in winners</small></span><span><strong>{results.recorded_clients ? results.blocked_ads : '—'}</strong> blocked / excluded</span><span><strong>{results.recorded_clients ? results.inconclusive_ads : '—'}</strong> inconclusive / excluded</span></div><p className="cl-muted">{results.logged_clients} logged client-weeks · {results.no_tests_clients} confirmed no-tests client-weeks · {finalized.length} finalized of {savedInPeriod.length} saved weekly reviews. Rates use total winners ÷ total eligible tested ads, never an average of client percentages. Missing results are excluded—not zero.</p><p className="cl-muted">Paired DDU spend: {formatSpendMoney(pairedTotals.ddu)} / total spend: {formatSpendMoney(pairedTotals.total)} · {totals.completeEntries} / {captured.length} client-weeks have complete paired spend. Missing or invalid spend is excluded from these amounts and the weighted share.</p></div>
    {!finalized.length && <div className="cl-callout"><div><strong>No finalized reviews in this period yet</strong><p>Elish can enter results in Weekly review and submit them. Once Operations / CEO finalizes the review, its captured results appear here. Existing historical records are preserved.</p></div></div>}
    {!!finalized.length && results.recorded_clients < results.total_clients && <div className="cl-callout"><div><strong>Partial results coverage</strong><p>The rates represent only the recorded client-weeks shown above. Unavailable, missing and legacy results are excluded; do not treat this as a complete team performance score.</p></div></div>}
    <div className="cl-toolbar"><div><h2>Performance breakdown</h2><p className="cl-muted">Client-level outcomes and the strategists assigned when each review was created.</p></div><div className="cl-inline"><Field label="Group results by"><select value={groupBy} onChange={event => { setGroupBy(event.target.value); setSearch('') }}><option value="client">Client</option><option value="strategist">Creative strategist</option></select></Field><Field label={`Search ${groupBy === 'client' ? 'clients' : 'strategists'}`}><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search…" /></Field></div></div>
    {groupBy === 'strategist' && <p className="cl-muted">Shared clients appear in each assigned strategist’s view with their full client results. These rows are attribution views, not individual ownership scores, and must not be added together. Team totals count each client-week once.</p>}
    <div className="card cl-history-table cl-results-table"><div className="table-wrap" tabIndex={0} role="region" aria-label="Creative performance breakdown"><table><thead><tr><th>{groupBy === 'client' ? 'Client' : 'Strategist'}</th><th>Results coverage</th><th>Eligible ads</th><th>Winners / rate</th><th>Super-winners / rate</th><th>DDU share / health</th></tr></thead><tbody>{breakdown.map(row => {
      const assignedWeeks = captured.filter(item => groupBy === 'client' ? item.client.id === row.id : row.id === 'unassigned' ? !capturedStrategistIds(item.client).length : capturedStrategistIds(item.client).includes(row.id))
      const spend = summarizeSpend(assignedWeeks.flatMap(item => item.entry ? [item.entry] : []))
      return <tr key={row.id}><td><strong>{row.name}</strong>{row.shared_attribution && <small>Includes shared-client attribution</small>}</td><td>{row.recorded_clients} / {row.total_clients}<small>{row.unavailable_clients + row.missing_clients + row.invalid_clients} unavailable / missing</small></td><td>{row.recorded_clients ? row.eligible_ads : '—'}</td><td>{row.recorded_clients ? row.winners : '—'} <small>{percent(row.winner_rate)}</small></td><td>{row.recorded_clients ? row.super_winners : '—'} <small>{percent(row.super_winner_rate)}</small></td><td>{percent(spend.share)} <SpendHealth share={spend.share} /><small>{spend.completeEntries} / {assignedWeeks.length} complete spend logs</small></td></tr>
    })}{!breakdown.length && <tr><td colSpan={6} className="cl-empty">{search ? 'No matching records.' : 'No finalized client results in this period.'}</td></tr>}</tbody></table></div></div>
    <div className="cl-metrics"><Metric title="Applicable quality checks passed" value={checks.length ? `${passingChecks} / ${checks.length}` : '—'} detail="Research, brief, sign-off and learning · N/A excluded" /><Metric title="Growth Guides updated" value={captured.length ? `${guidesUpdated} / ${captured.length}` : '—'} detail="Across captured client-weeks" /><Metric title="Finalized weekly reviews" value={finalized.length} detail={`${savedInPeriod.filter(review => review.status === 'submitted').length} awaiting review in this period`} /><Metric title="Unique clients reviewed" value={results.unique_clients} detail="Client-week totals may include the same client more than once" /></div>
    <div className="card cl-summary cl-scoring"><h3>Lead CS expectations framework</h3><div className="cl-framework"><span><strong>40%</strong> Team creative performance</span><span><strong>20%</strong> Creative-related churn</span><span><strong>10%</strong> Overall portfolio churn</span><span><strong>30%</strong> Quality & operating discipline</span></div><p className="cl-muted">Winner benchmark: 5–10%. Super-winner benchmark: 2–4%, as a subset of winners. Use monthly and rolling 90-day results with account, spend and testing context; a small denominator is not conclusive. Above-range results are not marked as failure.</p><p className="cl-muted">Spend share follows the existing dashboard: below 20% Low share, 20% to below 50% Healthy, 50% or more Excellent. Spend adoption is not itself proof of creative quality or profitability.</p><p className="cl-muted">The framework weights are preserved, but no invented combined rating or churn target is applied. Churn ratings and a weighted 1–5 score remain unscored until their target and attribution rules are defined. {reviewer && <Link to="/churn-analysis">Open client churn analysis →</Link>}</p></div>
    <div className="cl-toolbar"><div><h2>Preserved weekly history</h2><p className="cl-muted">All saved weeks, independent of the reporting filter. Open a review to inspect its captured clients, results, assessments, spend, and actions.</p></div></div>
    <div className="card cl-history-table"><div className="table-wrap"><table><thead><tr><th>Review week</th><th>Creative lead</th><th>Status</th><th>Clients</th><th>Submitted / finalized</th><th>Open</th></tr></thead><tbody>{reviews.map(review => <tr key={review.id}><td>{weekLabel(review.week_start)}<small>{review.week_start.slice(0, 4)}</small></td><td>{members.get(review.lead_id) || 'Previous creative lead'}</td><td><Status value={review.status} /></td><td>{review.client_snapshot?.length || 0}</td><td>{review.finalized_at ? timestamp(review.finalized_at) : review.submitted_at ? timestamp(review.submitted_at) : 'Not submitted'}</td><td><button className="btn btn-ghost btn-sm" onClick={() => onOpen(review)}>Open review<ArrowRight size={13} /></button></td></tr>)}{!reviews.length && <tr><td colSpan={6} className="cl-empty">No weekly reviews have been saved yet.</td></tr>}</tbody></table></div></div>
    {reviews.some(review => review.history?.length) && <details className="card cl-history-events"><summary>Review transition history</summary>{reviews.filter(review => review.history?.length).map(review => <div key={review.id}><h4>Week of {review.week_start}</h4><ul>{review.history.map((event, index) => <li key={index}><span>{label(event.status || event.to_status || event.action || 'Review updated')}</span>{(event.at || event.changed_at || event.timestamp) && <small>{timestamp(event.at || event.changed_at || event.timestamp)}</small>}{event.snapshot?.reviewer_feedback && <p className="cl-preserve">{event.snapshot.reviewer_feedback}</p>}{event.snapshot && <button className="btn btn-ghost btn-sm" onClick={() => setRevision({ snapshot: event.snapshot, at: event.at })}>View captured revision</button>}</li>)}</ul></div>)}</details>}
    {revision && <div className="cl-stack cl-revision"><div className="cl-toolbar"><div><h2>Captured revision</h2><p className="cl-muted">Preserved {timestamp(revision.at)} · read-only</p></div><button className="btn btn-ghost btn-sm" onClick={() => setRevision(null)}>Close revision</button></div><WeeklyReview key={`${revision.snapshot.id}:${revision.at}`} review={revision.snapshot} data={data} profile={{}} busy={false} onDirty={ignoreDirty} readOnly /></div>}
  </div>
}

function BenchmarkLabel({ rate, type }) {
  const benchmark = winnerBenchmark(rate, type)
  return <span className={`cl-benchmark cl-benchmark-${benchmark.status}`}>{benchmark.label} · {type === 'super_winner' ? '2–4%' : '5–10%'} benchmark</span>
}

function capturedClientWeeks(reviews) {
  const weeks = new Map()
  // A changed creative lead can yield overlapping historical records. Keep the
  // latest finalized snapshot for a client-week, never double-count its spend.
  const sorted = [...reviews].sort((a, b) => String(a.finalized_at || a.updated_at || a.created_at || '').localeCompare(String(b.finalized_at || b.updated_at || b.created_at || '')) || String(a.id || '').localeCompare(String(b.id || '')))
  for (const review of sorted) for (const client of review.client_snapshot || []) {
    weeks.set(`${review.week_start}:${client.id}`, { client, row: review.client_reviews?.find(row => row.client_id === client.id), entry: review.spend_snapshot?.find(entry => entry.client_id === client.id && (!entry.week_start || entry.week_start === review.week_start)) })
  }
  return [...weeks.values()]
}

function capturedStrategistIds(client) {
  return [...new Set([...getClientStrategistIds(client), client.assigned_cs_id, ...(client.strategist_names || []).map(member => member.id)].filter(Boolean))]
}
