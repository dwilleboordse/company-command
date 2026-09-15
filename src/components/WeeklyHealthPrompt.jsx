import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, HeartPulse, RefreshCw, Users, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { hasBusinessDashboardAccess } from '../lib/dashboardAccess'
import { parseLocal } from '../lib/dates'
import { fetchHealthData } from '../lib/healthData'
import { HEALTH_REVIEW_EVENT, healthDueWeek } from '../lib/healthWeekly'
import { canPromptWeeklyHealth, healthPromptSessionKey, healthPromptSummary } from '../lib/healthPrompt'
import './WeeklyHealthPrompt.css'

function wasDismissed(key) {
  try { return window.sessionStorage.getItem(key) === 'dismissed' } catch { return false }
}

function hasOtherModal() {
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"], .modal-overlay')].some(element => {
    if (element.closest('[data-weekly-health-modal]')) return false
    const style = window.getComputedStyle(element)
    return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  })
}

function ReviewCount({ kind, summary, week, onNavigate }) {
  const team = kind === 'team'
  const Icon = team ? Users : HeartPulse
  const done = summary.complete === summary.eligible
  return (
    <div className={`weekly-health-review ${done ? 'is-complete' : ''}`}>
      <Icon size={19} aria-hidden="true" />
      <div className="weekly-health-review-copy">
        <strong>{team ? 'Team health' : 'Client health'}</strong>
        <span>{summary.complete} / {summary.eligible} complete</span>
        <small>{summary.eligible === 0 ? 'No active reviews required.'
          : done ? 'All eligible weekly reviews are complete.'
            : `${summary.missing} not started · ${summary.partial} incomplete`}</small>
      </div>
      <Link to={`${team ? '/team-health' : '/clients'}?week=${week}`} onClick={onNavigate}>
        {done ? 'View' : 'Review'}<ArrowRight size={14} aria-hidden="true" />
        <span className="weekly-health-sr-only"> {team ? 'team' : 'client'} health</span>
      </Link>
    </div>
  )
}

function WeeklyHealthPromptContent({ profile }) {
  const [week, setWeek] = useState(() => healthDueWeek())
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const [dismissedKey, setDismissedKey] = useState(null)
  // Start deferred: other reminders may mount while their own data is loading.
  const [otherModalOpen, setOtherModalOpen] = useState(true)
  const dialogRef = useRef(null)
  const dismissalKey = healthPromptSessionKey(profile.id, week)
  const isOperationsManager = canPromptWeeklyHealth(profile)

  useEffect(() => {
    const refresh = () => {
      setWeek(healthDueWeek())
      setRevision(value => value + 1)
    }
    const timer = window.setInterval(refresh, 5 * 60 * 1000)
    window.addEventListener('focus', refresh)
    window.addEventListener(HEALTH_REVIEW_EVENT, refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(HEALTH_REVIEW_EVENT, refresh)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [team, client] = await Promise.all([fetchHealthData('team'), fetchHealthData('client')])
        const summaries = {
          team: healthPromptSummary('team', team.entities, team.entries, week),
          client: healthPromptSummary('client', client.entities, client.entries, week),
        }
        if (!cancelled) setResult({ userId: profile.id, week, revision, ...summaries, error: false })
      } catch {
        if (!cancelled) setResult({ userId: profile.id, week, revision, error: true })
      }
    }
    load()
    return () => { cancelled = true }
  }, [profile.id, week, revision])

  useEffect(() => {
    if (!isOperationsManager) return
    let frame = null
    const inspect = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = null
        setOtherModalOpen(hasOtherModal())
      })
    }
    const observer = new MutationObserver(inspect)
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'open'],
    })
    inspect()
    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [isOperationsManager])

  const current = result?.userId === profile.id && result?.week === week && result?.revision === revision
  const ready = current && !result.error
  const complete = ready && result.team.complete === result.team.eligible && result.client.complete === result.client.eligible
  const eligible = ready ? result.team.eligible + result.client.eligible : null
  const due = ready && !complete
  const open = isOperationsManager && due && !otherModalOpen && dismissedKey !== dismissalKey && !wasDismissed(dismissalKey)
  const dismiss = () => {
    setDismissedKey(dismissalKey)
    try { window.sessionStorage.setItem(dismissalKey, 'dismissed') } catch { /* In-memory dismissal still works. */ }
  }

  useEffect(() => {
    if (!open || !dialogRef.current || hasOtherModal()) return
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    // A class-owned lock does not overwrite another modal's inline scroll lock.
    document.body.classList.add('weekly-health-modal-open')
    dialog.querySelector('a[href]')?.focus()
    const handleKey = event => {
      if (hasOtherModal()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissedKey(dismissalKey)
        try { window.sessionStorage.setItem(dismissalKey, 'dismissed') } catch { /* Session fallback. */ }
      }
      if (event.key !== 'Tab') return
      const elements = [...dialog.querySelectorAll('a[href],button:not([disabled])')]
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.classList.remove('weekly-health-modal-open')
      document.removeEventListener('keydown', handleKey)
      if (!hasOtherModal() && previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open, dismissalKey])

  const weekLabel = parseLocal(week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const status = !current ? 'Checking reviews' : result.error ? 'Status unavailable'
    : complete ? (eligible === 0 ? 'No reviews required' : 'Weekly reviews complete') : 'Weekly reviews due'
  const counts = ready && <div className="weekly-health-counts">
    <ReviewCount kind="team" summary={result.team} week={week} onNavigate={dismiss} />
    <ReviewCount kind="client" summary={result.client} week={week} onNavigate={dismiss} />
  </div>

  return (
    <>
      <section className={`card weekly-health-card ${complete ? 'is-complete' : ''}`} aria-labelledby="weekly-health-card-title">
        <div className="weekly-health-heading">
          <div>
            <h2 id="weekly-health-card-title"><HeartPulse size={19} aria-hidden="true" />Weekly health reviews</h2>
            <p>Week of {weekLabel} · Previous completed week · Due Mondays, Dubai time</p>
          </div>
          <span className={`weekly-health-status ${complete ? 'is-complete' : due ? 'is-due' : ''}`} role="status">
            {complete && <CheckCircle2 size={14} aria-hidden="true" />}{status}
          </span>
        </div>
        {!current && <p className="weekly-health-note">Checking team and client reviews…</p>}
        {current && result.error && <div className="weekly-health-unavailable" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <p>We couldn’t check this week’s reviews. Your saved history is unchanged. <Link to={`/team-health?week=${week}`}>Open Team Health</Link> or <Link to={`/clients?week=${week}`}>Client Health</Link>.</p>
          <button className="btn btn-ghost" onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />Retry</button>
        </div>}
        {counts}
        {due && <p className="weekly-health-note">Complete one weekly review for each eligible team member and active client. Incomplete reviews still need attention; previous weeks stay in history.</p>}
      </section>
      {open && <div className="modal-overlay weekly-health-overlay" data-weekly-health-modal="true">
        <section className="modal weekly-health-dialog" role="dialog" aria-modal="true" aria-labelledby="weekly-health-dialog-title" aria-describedby="weekly-health-dialog-description" ref={dialogRef}>
          <div className="weekly-health-dialog-heading">
            <HeartPulse size={26} aria-hidden="true" />
            <button className="btn btn-ghost btn-icon" onClick={dismiss} aria-label="Dismiss health reminder for this session"><X size={20} /></button>
          </div>
          <p className="weekly-health-eyebrow">Monday check-in · Week of {weekLabel}</p>
          <h2 id="weekly-health-dialog-title">Log last week’s team and client health</h2>
          <p id="weekly-health-dialog-description">Review the previous completed week, record any risks, and add follow-up actions where needed.</p>
          {counts}
          <p className="weekly-health-note">Dismissing this reminder does not mark the reviews complete. You can return to them from your dashboard.</p>
          <div className="weekly-health-dialog-actions"><button className="btn btn-ghost" onClick={dismiss}>Not now</button></div>
        </section>
      </div>}
    </>
  )
}

export default function WeeklyHealthPrompt() {
  const { profile } = useAuth()
  if (!profile?.id || !hasBusinessDashboardAccess(profile)) return null
  // Remount on an identity/capability change: no previous user's data or dismissal
  // state can render while a new user's requests are in flight.
  return <WeeklyHealthPromptContent key={`${profile.id}:${profile.role}:${profile.position}`} profile={profile} />
}
