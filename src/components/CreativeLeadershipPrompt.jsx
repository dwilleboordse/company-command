import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, MessageSquare, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { isCreativeStrategist } from '../lib/creativeStrategyRoles'
import { CREATIVE_LEAD_EVENT, canReviewCreativeLeadership, canUseCreativeLeadership, creativeLeadDueWeek, isCreativeLead } from '../lib/creativeLeadership'
import { planToday } from '../lib/planReview'
import './CreativeLeadershipPrompt.css'

function wasDismissed(key) {
  try { return window.sessionStorage.getItem(key) === 'dismissed' } catch { return false }
}

function hasOtherModal() {
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"], .modal-overlay')].some(element => {
    if (element.closest('[data-creative-lead-modal]')) return false
    const style = window.getComputedStyle(element)
    return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  })
}

function CreativeLeadershipReviewPrompt({ profile }) {
  const [week, setWeek] = useState(() => creativeLeadDueWeek())
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const [dismissedKey, setDismissedKey] = useState(null)
  const [otherModalOpen, setOtherModalOpen] = useState(true)
  const dialogRef = useRef(null)
  const reviewer = canReviewCreativeLeadership(profile)
  const lead = isCreativeLead(profile) && !reviewer
  const sessionKey = `creative-lead-review:v1:${profile.id}:${week}`
  const link = `/creative-leadership?week=${week}${lead ? `&lead=${profile.id}` : ''}`

  useEffect(() => {
    const refresh = () => { setWeek(creativeLeadDueWeek()); setRevision(value => value + 1) }
    const timer = window.setInterval(refresh, 5 * 60 * 1000)
    window.addEventListener('focus', refresh)
    window.addEventListener(CREATIVE_LEAD_EVENT, refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(CREATIVE_LEAD_EVENT, refresh)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = lead
          ? await supabase.from('creative_lead_reviews').select('status,week_start,submitted_at,finalized_at')
            .eq('lead_id', profile.id).eq('week_start', week).maybeSingle()
          : await supabase.from('creative_lead_reviews').select('id', { count: 'exact', head: true }).eq('status', 'submitted')
        if (response.error) throw response.error
        if (!cancelled) setResult({ profileId: profile.id, week, revision, review: response.data, pending: response.count || 0, error: false })
      } catch {
        if (!cancelled) setResult({ profileId: profile.id, week, revision, error: true })
      }
    }
    load()
    return () => { cancelled = true }
  }, [profile.id, lead, week, revision])

  useEffect(() => {
    if (!lead) return
    let frame = null
    const inspect = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => { frame = null; setOtherModalOpen(hasOtherModal()) })
    }
    const observer = new MutationObserver(inspect)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'open'] })
    inspect()
    return () => { observer.disconnect(); if (frame !== null) window.cancelAnimationFrame(frame) }
  }, [lead])

  const current = result?.profileId === profile.id && result?.week === week && result?.revision === revision
  const ready = current && !result.error
  const complete = ready && ['submitted', 'finalized'].includes(result.review?.status)
  const changesRequested = ready && result.review?.status === 'changes_requested'
  const due = lead && ready && !complete
  const monday = new Date(`${planToday()}T00:00:00Z`).getUTCDay() === 1
  const open = due && monday && !otherModalOpen && dismissedKey !== sessionKey && !wasDismissed(sessionKey)
  const dismiss = () => {
    setDismissedKey(sessionKey)
    try { window.sessionStorage.setItem(sessionKey, 'dismissed') } catch { /* In-memory dismissal still works. */ }
  }

  useEffect(() => {
    if (!open || !dialogRef.current || hasOtherModal()) return
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    document.body.classList.add('creative-lead-modal-open')
    dialog.querySelector('a[href]')?.focus()
    const handleKey = event => {
      if (hasOtherModal()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissedKey(sessionKey)
        try { window.sessionStorage.setItem(sessionKey, 'dismissed') } catch { /* Session fallback. */ }
      }
      if (event.key !== 'Tab') return
      const controls = [...dialog.querySelectorAll('a[href],button:not([disabled])')]
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.classList.remove('creative-lead-modal-open')
      document.removeEventListener('keydown', handleKey)
      if (!hasOtherModal() && previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open, sessionKey])

  return (
    <>
      <section className={`card creative-lead-home ${changesRequested ? 'needs-changes' : ''}`} aria-labelledby="creative-lead-home-title">
        <div className="creative-lead-home-heading">
          <h2 id="creative-lead-home-title"><ClipboardList size={19} aria-hidden="true"/>Creative Leadership</h2>
          <Link to={link} onClick={dismiss}>Open reviews <ArrowRight size={14} aria-hidden="true"/></Link>
        </div>
        {!current && <p role="status">Checking leadership reviews…</p>}
        {current && result.error && <div className="creative-lead-home-error" role="status"><AlertCircle size={17} aria-hidden="true"/><p>Review status is unavailable. Saved reviews are unchanged.</p><button className="btn btn-ghost" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
        {lead && ready && <div className="creative-lead-home-summary">
          {complete ? <CheckCircle2 size={18} aria-hidden="true"/> : <ClipboardList size={18} aria-hidden="true"/>}
          <div><strong>{changesRequested ? 'Changes requested — update your review' : complete ? result.review.status === 'finalized' ? 'Weekly review finalized' : 'Submitted — awaiting Operations review' : 'Weekly creative leadership review due'}</strong>
            <p>Week of {week} · Previous completed week · Due Monday, Dubai time</p>
            {!complete && <p>Review your clients, log actions and coaching, then submit. This records completion, not a performance score.</p>}
          </div>
          {!complete && <Link className="btn btn-primary" to={link} onClick={dismiss}>{changesRequested ? 'Update review' : 'Complete review'}</Link>}
        </div>}
        {reviewer && !lead && ready && <p role="status"><strong>{result.pending}</strong> submitted {result.pending === 1 ? 'review awaits' : 'reviews await'} your feedback and finalization. <Link to="/creative-leadership">Review submissions →</Link></p>}
      </section>
      {open && <div className="modal-overlay" data-creative-lead-modal="true">
        <section className="modal creative-lead-prompt-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="creative-lead-prompt-title" aria-describedby="creative-lead-prompt-description">
          <div className="creative-lead-home-heading"><ClipboardList size={24} aria-hidden="true"/><button className="btn btn-ghost btn-icon" aria-label="Dismiss leadership reminder for this session" onClick={dismiss}><X size={20}/></button></div>
          <p className="creative-lead-prompt-eyebrow">Monday check-in · Week of {week} · Dubai time</p>
          <h2 id="creative-lead-prompt-title">{changesRequested ? 'Your leadership review needs changes' : 'Time for your creative leadership review'}</h2>
          <p id="creative-lead-prompt-description">Review the previous week’s client coverage, actions and coaching, then submit your leadership summary to Operations.</p>
          <p className="creative-lead-prompt-muted">Dismissing this reminder does not mark the review complete. The dashboard reminder stays until you submit.</p>
          <div className="creative-lead-prompt-actions"><Link className="btn btn-primary" to={link} onClick={dismiss}>Open my review →</Link><button className="btn btn-ghost" onClick={dismiss}>Not now</button></div>
        </section>
      </div>}
    </>
  )
}

function PublishedCreativeFeedback({ profileId }) {
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    window.addEventListener('focus', refresh)
    window.addEventListener(CREATIVE_LEAD_EVENT, refresh)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener(CREATIVE_LEAD_EVENT, refresh) }
  }, [])
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Recipient-owned published messages only. Never query private coaching notes.
        const { data, error } = await supabase.from('creative_lead_feedback').select('id,message,published_at')
          .eq('recipient_id', profileId).not('published_at', 'is', null).order('published_at', { ascending: false })
          .order('id').range(page * 5, page * 5 + 5)
        if (error) throw error
        if (!cancelled) setResult({ profileId, revision, page, rows: (data || []).slice(0, 5), hasMore: (data || []).length > 5, error: false })
      } catch { if (!cancelled) setResult({ profileId, revision, page, rows: [], error: true }) }
    }
    load()
    return () => { cancelled = true }
  }, [profileId, revision, page])
  const current = result?.profileId === profileId && result?.revision === revision && result?.page === page
  return <section className="card creative-lead-home" aria-labelledby="creative-feedback-home-title">
    <h2 id="creative-feedback-home-title"><MessageSquare size={18} aria-hidden="true"/>Your creative leadership feedback</h2>
    {!current && <p role="status">Checking published feedback…</p>}
    {current && result.error && <div role="status" className="creative-lead-home-error"><p>We couldn’t load your published feedback.</p><button className="btn btn-ghost" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
    {current && !result.error && result.rows.length === 0 && <p>{page === 0 ? 'No feedback has been published to you yet.' : 'No older published feedback.'}</p>}
    {current && !result.error && result.rows.length > 0 && <ul className="creative-lead-feedback-list">{result.rows.map(row => <li key={row.id}><time dateTime={row.published_at}>{new Date(row.published_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric' })}</time><p>{row.message}</p></li>)}</ul>}
    {current && !result.error && (page > 0 || result.hasMore) && <div className="creative-lead-prompt-actions"><button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Newer feedback</button><button className="btn btn-ghost" disabled={!result.hasMore} onClick={() => setPage(value => value + 1)}>Older feedback</button></div>}
  </section>
}

export default function CreativeLeadershipPrompt() {
  const { profile } = useAuth()
  if (!profile?.id || profile.is_active === false) return null
  const leadership = canUseCreativeLeadership(profile)
  const strategist = isCreativeStrategist(profile)
  if (!leadership && !strategist) return null
  return <>
    {leadership && <CreativeLeadershipReviewPrompt key={profile.id} profile={profile}/>}
    {strategist && <PublishedCreativeFeedback key={profile.id} profileId={profile.id}/>}
  </>
}
