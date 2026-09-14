// The weekly review resets at Monday 00:00 in the agency's business timezone.
// Use the same boundary in reminders, dashboards, and the database lock guard.
export const PLAN_TIME_ZONE = 'Asia/Dubai'
export const PLAN_REVIEW_EVENT = 'hundred-day-plan-updated'
export const WEEKLY_LOCK_ROLLOUT = '2026-09-14'

// Drafts counted as submissions before weekly locking existed. Keep that history
// intact, while requiring finalization for the rollout week and every week after it.
export function countsAsCompletedPlanReview(pulse) {
  return Boolean(pulse?.week_start && (pulse.week_start < WEEKLY_LOCK_ROLLOUT || pulse.locked_at))
}

export function planToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLAN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = type => parts.find(item => item.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function planWeekStart(now = new Date()) {
  const date = new Date(`${planToday(now)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return date.toISOString().slice(0, 10)
}

// Only whole-answer placeholders mean "no blocker". Do not discard a real
// explanation such as "No blockers except waiting for client approval".
export function planBlockerText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[\p{P}\s]+/gu, ' ').trim()
  return ['', 'none', 'no blocker', 'no blockers', 'n a', 'na', 'not applicable'].includes(normalized) ? '' : text
}

export function planReviewState(plan, pulse, now = new Date()) {
  const today = planToday(now)
  const week = planWeekStart(now)
  if (!plan) return { status: 'missing', label: 'No plan', due: true, locked: false, week }
  if (plan.end_date && plan.end_date < today) {
    return { status: 'ended', label: 'Plan ended', due: true, locked: false, week }
  }
  if (plan.status !== 'committed') {
    return { status: 'draft', label: 'Draft plan', due: true, locked: false, week }
  }
  if (!plan.start_date) {
    return { status: 'needs_dates', label: 'Plan start date needed', due: true, locked: false, week }
  }
  if (plan.start_date && plan.start_date > today) {
    return { status: 'upcoming', label: 'Starts soon', due: false, locked: false, week }
  }
  const current = pulse?.plan_id === plan.id && pulse.week_start === week ? pulse : null
  if (!current?.locked_at) {
    return { status: current ? 'update_draft' : 'due', label: current ? 'Weekly update draft' : 'Weekly update due', due: true, locked: false, week }
  }
  const blocked = current.track_status === 'off_track' || Boolean(planBlockerText(current.blocker))
  const status = blocked ? 'blocked' : current.track_status === 'at_risk' ? 'at_risk' : 'on_track'
  const label = status === 'blocked' ? 'Blocked / off track' : status === 'at_risk' ? 'At risk' : 'On track'
  return { status, label, due: false, locked: true, week }
}

export function validateWeeklyReview(pulse) {
  if (!pulse?.progress_note?.trim()) return 'Add your progress since last week before locking.'
  if (!pulse?.next_commitment?.trim()) return 'Add your next commitment before locking.'
  if (!['on_track', 'at_risk', 'off_track'].includes(pulse.track_status)) return 'Choose an execution status.'
  return ''
}

export function buildPlanOverview(profiles, plans, pulses, now = new Date()) {
  const planMap = new Map()
  for (const plan of plans || []) {
    const existing = planMap.get(plan.user_id)
    if (!existing || (plan.updated_at || '') > (existing.updated_at || '')) planMap.set(plan.user_id, plan)
  }
  const pulseMap = new Map()
  for (const pulse of pulses || []) {
    const existing = pulseMap.get(pulse.plan_id)
    if (!existing || pulse.week_start > existing.week_start) pulseMap.set(pulse.plan_id, pulse)
  }
  const rows = (profiles || []).filter(profile => profile.is_active !== false).map(profile => {
    const plan = planMap.get(profile.id) || null
    const pulse = plan ? pulseMap.get(plan.id) || null : null
    const review = planReviewState(plan, pulse, now)
    const day = plan?.start_date
      ? Math.max(0, Math.floor((Date.parse(`${planToday(now)}T00:00:00Z`) - Date.parse(`${plan.start_date}T00:00:00Z`)) / 86400000) + 1)
      : null
    return { profile, plan, pulse, review, day }
  })
  const priority = { blocked: 0, at_risk: 1, missing: 2, ended: 3, needs_dates: 4, draft: 5, due: 6, update_draft: 7, upcoming: 8, on_track: 9 }
  rows.sort((a, b) => priority[a.review.status] - priority[b.review.status]
    || (a.profile.full_name || '').localeCompare(b.profile.full_name || ''))
  return {
    rows,
    total: rows.length,
    missing: rows.filter(row => row.review.status === 'missing').length,
    draft: rows.filter(row => row.review.status === 'draft').length,
    ended: rows.filter(row => row.review.status === 'ended').length,
    needsDates: rows.filter(row => row.review.status === 'needs_dates').length,
    committed: rows.filter(row => row.plan?.status === 'committed' && !['ended', 'needs_dates', 'upcoming'].includes(row.review.status)).length,
    upcoming: rows.filter(row => row.review.status === 'upcoming').length,
    due: rows.filter(row => ['due', 'update_draft'].includes(row.review.status)).length,
    locked: rows.filter(row => row.review.locked).length,
    onTrack: rows.filter(row => row.review.status === 'on_track').length,
    atRisk: rows.filter(row => row.review.status === 'at_risk').length,
    blocked: rows.filter(row => row.review.status === 'blocked').length,
  }
}

export function planReviewLink(plan) {
  return plan?.status === 'committed' ? '/100-day-plan#weekly-review' : '/100-day-plan'
}
