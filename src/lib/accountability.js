import { CREATIVE_LEAD_FIRST_WEEK, isCreativeLead, shiftCreativeLeadWeek } from './creativeLeadership.js'

export const ACCOUNTABILITY_COLUMNS = [
  { type: 'weekly-status', key: 'weekly_update_status', label: 'Weekly Update' },
  { type: 'bool', key: 'monday_intentions', label: 'Mon Intentions' },
  { type: 'bool', key: 'friday_reflections', label: 'Fri Reflections' },
  { type: 'bool', key: 'mvp_votes', label: 'MVP Votes' },
  { type: 'bool', key: 'growth_tracker_logged', label: 'Growth Tracker' },
  { type: 'monthly-tri', key: 'client_reports', label: 'Monthly Client Report' },
  { type: 'monthly-bool', key: 'monthly_survey', label: 'Monthly Survey' },
  { type: 'bool', key: 'on_time_pod_calls', label: 'Pod Attendance' },
  { type: 'bool', key: 'on_time_client_calls', label: 'Client Attendance' },
]

export const WEEKLY_UPDATE_OPTIONS = [
  { value: 'sent', label: 'Sent update' },
  { value: 'partial', label: 'Partly sent' },
  { value: 'not_sent', label: 'No update sent' },
  { value: 'not_required', label: 'Not required' },
]

export const isMonthlyType = type => type === 'monthly-bool' || type === 'monthly-tri'

export function weeklyUpdateStatus(log) {
  return log?.weekly_update_status || (log?.weekly_update_sent ? 'sent' : 'not_sent')
}

export function weeklyUpdatePatch(status) {
  // Keep the legacy field consistent before an upsert's INSERT trigger runs.
  return { weekly_update_status: status, weekly_update_sent: status === 'sent' }
}

// Accountability for week W covers the Lead CS review of the completed week W-1.
export function leadReviewWeekForAccountability(weekStart) {
  return shiftCreativeLeadWeek(weekStart, -1)
}

export function leadReviewAccountabilityStatus(member, reviews, accountabilityWeek, error = false) {
  if (!isCreativeLead(member)) return { applicable: false, complete: false }
  const weekStart = leadReviewWeekForAccountability(accountabilityWeek)
  if (weekStart < CREATIVE_LEAD_FIRST_WEEK) return { applicable: false, complete: false }
  if (error) return { applicable: true, complete: false, unavailable: true, weekStart, label: 'Status unavailable' }
  const review = (reviews || []).find(item => item.lead_id === member.id && item.week_start === weekStart)
  const complete = ['submitted', 'finalized'].includes(review?.status)
  const label = review?.status === 'finalized' ? 'Finalized' : review?.status === 'submitted' ? 'Submitted'
    : review?.status === 'changes_requested' ? 'Changes requested' : review?.status === 'draft' ? 'Draft' : 'Not submitted'
  return { applicable: true, complete, status: review?.status || 'missing', weekStart, label }
}

export function scoreLog(log, monthlyVisible, spendStatus, hundredDayLogged, leadReviewStatus = null) {
  let earned = 0, total = 0
  ACCOUNTABILITY_COLUMNS.forEach(column => {
    if (isMonthlyType(column.type) && !monthlyVisible) return
    const status = column.type === 'weekly-status' ? weeklyUpdateStatus(log) : null
    // An exempt update is neither earned credit nor a missing requirement.
    if (status === 'not_required') return
    total += 1
    const value = log?.[column.key]
    if (column.type === 'weekly-status') {
      if (status === 'sent') earned += 1
      else if (status === 'partial') earned += 0.5
    } else if (column.type === 'bool' || column.type === 'monthly-bool') {
      if (value) earned += 1
    } else if (column.type === 'monthly-tri') {
      if (value === 'done') earned += 1
      else if (value === 'partial') earned += 0.5
    }
  })
  if (spendStatus?.total > 0) {
    total += 1
    if (spendStatus.complete) earned += 1
  }
  total += 1
  if (hundredDayLogged) earned += 1
  if (leadReviewStatus?.applicable && !leadReviewStatus.unavailable) {
    total += 1
    if (leadReviewStatus.complete) earned += 1
  }
  return { earned, total }
}
