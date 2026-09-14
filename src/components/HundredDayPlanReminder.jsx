import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Compass, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { PLAN_REVIEW_EVENT, planReviewState, planReviewLink, planWeekStart } from '../lib/planReview'
import './PlanDashboard.css'

function wasDismissed(key) {
  try { return window.sessionStorage.getItem(key) === 'dismissed' } catch { return false }
}

export default function HundredDayPlanReminder() {
  const { profile } = useAuth()
  const location = useLocation()
  const [week, setWeek] = useState(() => planWeekStart())
  const [result, setResult] = useState(null)
  const [dismissedKey, setDismissedKey] = useState(null)
  const [revision, setRevision] = useState(0)
  const dialogRef = useRef(null)
  const key = `hundred-day-review:${profile?.id}:${week}`

  useEffect(() => {
    const refresh = () => { setWeek(planWeekStart()); setRevision(value => value + 1) }
    const timer = window.setInterval(refresh, 5 * 60 * 1000)
    window.addEventListener('focus', refresh)
    window.addEventListener(PLAN_REVIEW_EVENT, refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(PLAN_REVIEW_EVENT, refresh)
    }
  }, [])

  useEffect(() => {
    if (!profile?.id || profile.is_active === false) return
    let cancelled = false
    ;(async () => {
      const plans = await supabase.from('hundred_day_plans').select('id,user_id,status,start_date,end_date').eq('user_id', profile.id).maybeSingle()
      if (plans.error) { if (!cancelled) setResult(null); return }
      const pulses = plans.data
        ? await supabase.from('hundred_day_plan_weekly_pulses').select('plan_id,week_start,locked_at,track_status,blocker').eq('plan_id', plans.data.id).eq('week_start', week).maybeSingle()
        : { data: null }
      if (!cancelled) setResult(pulses.error ? null : { userId: profile.id, plan: plans.data, pulse: pulses.data, week })
    })().catch(() => { if (!cancelled) setResult(null) })
    return () => { cancelled = true }
  }, [profile?.id, profile?.is_active, week, revision, location.pathname])

  const review = result ? planReviewState(result.plan, result.pulse) : null
  const show = Boolean(result?.userId === profile?.id && result?.week === week && review?.due && location.pathname !== '/100-day-plan')
  const open = show && dismissedKey !== key && !wasDismissed(key)
  const dismiss = () => {
    setDismissedKey(key)
    try { window.sessionStorage.setItem(key, 'dismissed') } catch { /* In-memory dismissal still works when storage is disabled. */ }
  }

  useEffect(() => {
    if (!open || !dialogRef.current) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = dialogRef.current
    dialog.querySelector('a')?.focus()
    const handleKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissedKey(key)
        try { window.sessionStorage.setItem(key, 'dismissed') } catch { /* Session fallback. */ }
      }
      if (event.key !== 'Tab') return
      const elements = [...dialog.querySelectorAll('a[href],button:not([disabled])')]
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open, key])

  if (!show) return null
  const setup = ['missing', 'draft', 'ended', 'needs_dates'].includes(review.status)
  const title = setup ? 'Your 100-day plan needs a review' : 'Time to lock your weekly 100-day update'
  const description = review.status === 'missing' ? 'Create your 100-day plan, review your objectives, and commit it. Then complete and lock this week’s execution update.'
    : review.status === 'draft' ? 'Finish your draft and commit your plan. Then add your progress and next commitment, and lock this week’s execution update.'
      : review.status === 'needs_dates' ? 'Your committed plan is missing its start date. Edit the plan to agree its dates before completing your weekly review.'
      : review.status === 'ended' ? 'Your previous plan has ended. Review it with your lead and agree the next cycle before updating your plan dates. Your existing plan and weekly history are kept.'
        : 'Review your existing 100-day plan, log progress since last week and your next commitment, then lock the weekly update. You do not need to rewrite your full plan.'
  return (
    <>
      <div className="plan-review-banner" role="status">
        <Compass size={18} aria-hidden="true" />
        <span><strong>{setup ? '100-day plan review needed' : 'Weekly 100-day update due'}</strong> · Week of {week}</span>
        <Link to={planReviewLink(result.plan)} onClick={dismiss}>{setup ? 'Review plan' : 'Fill in & lock update'} →</Link>
      </div>
      {open && (
        <div className="modal-overlay plan-review-overlay">
          <section className="modal plan-review-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="plan-review-title" aria-describedby="plan-review-description">
            <div className="plan-review-dialog-heading"><Compass size={26} aria-hidden="true" /><button className="btn btn-ghost btn-icon" aria-label="Dismiss for this session" onClick={dismiss}><X size={20} /></button></div>
            <p className="plan-review-eyebrow">Monday check-in · week of {week} · Dubai time</p>
            <h2 id="plan-review-title">{title}</h2>
            <p id="plan-review-description">{description}</p>
            <p className="plan-review-muted">The reminder stays due until the update is locked. Dismissing it does not mark your work complete.</p>
            <div className="plan-review-dialog-actions">
              <Link className="btn btn-primary" to={planReviewLink(result.plan)} onClick={dismiss}>{setup ? 'Review my plan' : 'Fill in & lock update'} →</Link>
              <button className="btn btn-ghost" onClick={dismiss}>Not now</button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
