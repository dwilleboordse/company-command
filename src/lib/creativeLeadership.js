import { isHeadOfCreativeStrategy } from './creativeStrategyRoles.js'
import { healthCurrentWeek, healthDueWeek, healthShiftWeek, isHealthDate, isHealthMonday } from './healthWeekly.js'
import { newCreativeResults, validateCreativeResults } from './creativeLeadershipResults.js'

export const CREATIVE_LEAD_FIRST_WEEK = '2026-09-14'
export const CREATIVE_LEAD_EVENT = 'creative-leadership-updated'
const active = profile => Boolean(profile?.id && profile.is_active === true)
export const isCreativeLead = profile => active(profile) && isHeadOfCreativeStrategy(profile)
export const canReviewCreativeLeadership = profile => active(profile) && (profile.role === 'ceo' || profile.position === 'ops_manager')
export const canUseCreativeLeadership = profile => isCreativeLead(profile) || canReviewCreativeLeadership(profile)
export const creativeLeadDueWeek = (now = new Date()) => healthDueWeek(now)
export const shiftCreativeLeadWeek = healthShiftWeek
export const creativeLeadCurrentWeek = healthCurrentWeek

export const CREATIVE_QUALITY_OPTIONS = [
  { value: 'on_track', label: 'On track' }, { value: 'needs_attention', label: 'Needs attention' },
  { value: 'blocked', label: 'Blocked' }, { value: 'insufficient_evidence', label: 'Insufficient evidence' },
]
export const CREATIVE_CHECK_OPTIONS = [
  { value: 'pass', label: 'Pass' }, { value: 'needs_work', label: 'Needs work' },
  { value: 'blocked', label: 'Blocked' }, { value: 'not_applicable', label: 'Not applicable' },
]
export const CREATIVE_GROWTH_OPTIONS = [
  { value: 'updated', label: 'Updated' }, { value: 'needs_update', label: 'Needs update' }, { value: 'blocked', label: 'Blocked' },
]
export const CREATIVE_REVIEW_CHECKS = ['research_check', 'brief_check', 'signoff_check', 'learning_check']
const text = value => typeof value === 'string' ? value.trim() : ''
const includes = (options, value) => options.some(option => option.value === value)

export function safeCreativeEvidenceUrl(value) {
  try {
    const url = new URL(text(value))
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && value.length <= 2000 ? url.href : null
  } catch { return null }
}

export function newClientReview(client) {
  return { client_id: client.id, quality_status: '', research_check: '', brief_check: '', signoff_check: '',
    learning_check: '', growth_guide_status: '', diagnosis: '', next_tests: '', blocker: '', evidence_url: '', results: newCreativeResults() }
}

export function creativeClientNeedsAction(row) {
  return row.quality_status !== 'on_track' || row.growth_guide_status !== 'updated'
    || CREATIVE_REVIEW_CHECKS.some(key => ['needs_work', 'blocked'].includes(row[key]))
}

export function validateCreativeReview(review, actions = []) {
  if (!text(review.summary)) return 'Add your weekly leadership summary before submitting.'
  if (!Array.isArray(review.client_snapshot) || !Array.isArray(review.client_reviews)) return 'The captured client roster is unavailable. Reload the review.'
  if (review.client_reviews.some(row => !row || typeof row !== 'object')) return 'Review every client in the captured roster exactly once.'
  const ids = new Set(review.client_snapshot.map(client => client.id))
  const reviewedIds = new Set(review.client_reviews.map(row => row.client_id))
  if (review.client_reviews.length !== ids.size || reviewedIds.size !== ids.size || [...reviewedIds].some(id => !ids.has(id))) return 'Review every client in the captured roster exactly once.'
  for (const client of review.client_snapshot) {
    const row = review.client_reviews.find(item => item.client_id === client.id)
    const name = client.name || 'Client'
    if (!includes(CREATIVE_QUALITY_OPTIONS, row.quality_status)) return `${name}: choose a creative status.`
    if (CREATIVE_REVIEW_CHECKS.some(key => !includes(CREATIVE_CHECK_OPTIONS, row[key]))) return `${name}: complete all four quality checks.`
    if (!includes(CREATIVE_GROWTH_OPTIONS, row.growth_guide_status)) return `${name}: choose a Growth Guide status.`
    if (!safeCreativeEvidenceUrl(row.evidence_url)) return `${name}: add a valid http(s) evidence link without embedded credentials.`
    if (!text(row.next_tests)) return `${name}: record the next tests or next action.`
    const resultsError = validateCreativeResults(row.results, { required: review.results_version >= 1, submission: true })
    if (resultsError) return `${name}: ${resultsError}`
    if (['blocked', 'insufficient_evidence'].includes(row.quality_status) && !text(row.blocker)) return `${name}: explain the blocker or missing evidence.`
    if (creativeClientNeedsAction(row)) {
      if (!text(row.diagnosis)) return `${name}: explain what needs attention.`
      if (!actions.some(action => action.client_id === client.id && ['open', 'in_progress', 'blocked'].includes(action.status))) return `${name}: add a linked open action with an owner and deadline.`
    }
  }
  return ''
}

export function validateCreativeReviewWeek(week, now = new Date()) {
  return isHealthMonday(week) && week >= CREATIVE_LEAD_FIRST_WEEK && week <= creativeLeadDueWeek(now)
}

// Weekends are Saturday/Sunday. These are operational due dates, not a holiday calendar.
export function addBusinessDays(date, days) {
  let key = typeof date === 'string' ? date : ''
  if (key.includes('T')) {
    const instant = new Date(key)
    if (Number.isNaN(instant.getTime())) return null
    key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
  }
  if (!isHealthDate(key) || !Number.isInteger(days) || days < 0) return null
  const result = new Date(`${key}T00:00:00Z`)
  let remaining = days
  while (remaining) {
    result.setUTCDate(result.getUTCDate() + 1)
    if (![0, 6].includes(result.getUTCDay())) remaining -= 1
  }
  return result.toISOString().slice(0, 10)
}

export function validateCreativeAction(values) {
  if (!text(values.title) || !text(values.diagnosis) || !text(values.action_plan)) return 'Add the issue, diagnosis and corrective action.'
  if (!values.owner_id || !isHealthDate(values.due_date)) return 'Choose an owner and a valid deadline.'
  if (!['quality', 'retention', 'coaching', 'dependency'].includes(values.kind)) return 'Choose an action type.'
  if (!['open', 'in_progress', 'blocked', 'resolved'].includes(values.status)) return 'Choose an action status.'
  if (values.kind === 'retention' && !values.client_id) return 'Retention risks must be linked to a client.'
  if (values.status === 'resolved' && !text(values.resolution_evidence)) return 'Record evidence of improvement before resolving the action.'
  if (text(values.evidence_url) && !safeCreativeEvidenceUrl(values.evidence_url)) return 'Enter a valid http(s) evidence link.'
  return ''
}

const actionFields = ['client_id', 'strategist_id', 'kind', 'title', 'diagnosis', 'action_plan', 'owner_id', 'due_date', 'status', 'evidence_url', 'resolution_evidence', 'escalated_at', 'recovery_plan_at']
export function creativeActionPayload(values, existing = null) {
  const payload = Object.fromEntries(actionFields.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]))
  for (const field of ['client_id', 'strategist_id', 'escalated_at', 'recovery_plan_at']) {
    if (!existing || Object.hasOwn(payload, field)) payload[field] ||= null
  }
  if (!existing && values.identified_at) payload.identified_at = values.identified_at
  return payload
}

export function validateCreativeCoaching(values) {
  if (!values.strategist_id || !text(values.observation) || !text(values.expected_standard) || !text(values.agreed_action) || !isHealthDate(values.due_date)) return 'Add a strategist, observation, expected standard, agreed action and deadline.'
  if (!['open', 'improving', 'resolved'].includes(values.outcome)) return 'Choose a coaching outcome.'
  if (values.outcome === 'resolved' && !text(values.follow_up)) return 'Record the follow-up result before resolving coaching.'
  return ''
}
